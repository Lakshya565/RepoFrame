import logging
import threading
from dataclasses import dataclass

import jwt
from fastapi import Header, HTTPException, Request
from jwt import PyJWKClient

from app import config
from app.services import supabase_client
from app.services.repo_parser import RepoUrlParseError, parse_github_repo_url

# Verifies Supabase-issued access tokens and turns a valid one into an identified
# user. This is the trust boundary for every authenticated endpoint: a request is
# only treated as "signed in" when its bearer token cryptographically verifies
# here. Everything downstream (project storage, per-user quotas, GitHub App
# installation ownership) keys off the user_id this module returns.
#
# Verification model (see PHASE_15_PLAN.md §15.1):
#   * Primary path — ASYMMETRIC (ES256/RS256). The target project signs tokens
#     with a private key it never reveals; we verify against its PUBLIC keys,
#     fetched from the project's JWKS discovery endpoint (derived from
#     SUPABASE_URL). No secret is stored anywhere. PyJWKClient caches keys and
#     refreshes across rotation.
#   * Fallback path — LEGACY HS256. If SUPABASE_JWT_SECRET is set (a project still
#     on a shared secret), verify HS256 with it instead. The presence of the secret
#     selects the path.
#
# Security invariants, always enforced:
#   * Algorithms are PINNED (never inferred from the token header), so a forged
#     `alg: none` or an attacker-chosen algorithm is rejected outright.
#   * Audience ("authenticated") and expiry are verified; `sub` is required.
#   * Fail CLOSED: any verification or key-fetch failure yields None (anonymous),
#     never a partially-trusted user.

logger = logging.getLogger(__name__)

# Supabase sets aud="authenticated" on user access tokens; a token minted for any
# other audience (e.g. service tokens) must not authenticate a user here.
EXPECTED_AUDIENCE = "authenticated"

# The only asymmetric algorithms we accept on the JWKS path. Pinning the set is
# the core defense against algorithm-substitution attacks.
_ASYMMETRIC_ALGORITHMS = ["ES256", "RS256"]

# GoTrue's JWKS discovery path, appended to SUPABASE_URL.
_JWKS_PATH = "/auth/v1/.well-known/jwks.json"

# Message returned on a 401 from require_user. Deliberately generic — it never
# reveals whether a token was absent, expired, or malformed.
UNAUTHENTICATED_MESSAGE = "Authentication required."

# Memoized JWKS client (network-backed) and the lock guarding its one-time build.
_jwks_client: PyJWKClient | None = None
_jwks_lock = threading.Lock()


# The identity extracted from a verified token. github_id/github_login/email are
# best-effort (present when the user signed in with GitHub via Supabase); user_id
# is the only field guaranteed for any authenticated user and is what storage and
# quotas key on.
@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: str
    github_id: str | None = None
    github_login: str | None = None
    email: str | None = None


def _get_jwks_client() -> PyJWKClient:
    """Return the memoized JWKS client, built once from SUPABASE_URL.

    Split out so tests can patch it to a local fake and never hit the network.
    """
    global _jwks_client
    if _jwks_client is None:
        with _jwks_lock:
            if _jwks_client is None:
                jwks_url = config.SUPABASE_URL.rstrip("/") + _JWKS_PATH
                _jwks_client = PyJWKClient(jwks_url)
    return _jwks_client


def _resolve_key_and_algorithms(token: str) -> tuple[object, list[str]]:
    """Pick the verifying key + allowed algorithms for this token.

    Legacy HS256 when SUPABASE_JWT_SECRET is set; otherwise the project's public
    signing key from JWKS (asymmetric). Never trusts the token's own `alg` header
    to choose — the algorithm set is fixed per path.
    """
    if config.SUPABASE_JWT_SECRET:
        return config.SUPABASE_JWT_SECRET, ["HS256"]
    signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
    return signing_key.key, _ASYMMETRIC_ALGORITHMS


def _extract_bearer_token(authorization: str | None) -> str | None:
    """Pull the raw token out of an `Authorization: Bearer <token>` header.

    Returns None for a missing header or any non-Bearer / malformed value.
    """
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        return None
    return parts[1]


def _user_from_claims(claims: dict) -> AuthenticatedUser | None:
    """Build an AuthenticatedUser from verified claims, or None if `sub` is absent.

    GitHub identifiers live in user_metadata for a GitHub OAuth sign-in; they are
    read best-effort (a non-GitHub or minimal token simply leaves them None).
    """
    user_id = claims.get("sub")
    if not isinstance(user_id, str) or not user_id:
        return None

    metadata = claims.get("user_metadata")
    metadata = metadata if isinstance(metadata, dict) else {}

    # Supabase stores the provider's numeric id under provider_id (falling back to
    # the identity's own sub); the handle under user_name / preferred_username.
    github_id = metadata.get("provider_id") or metadata.get("sub")
    github_login = metadata.get("user_name") or metadata.get("preferred_username")

    email = claims.get("email")

    return AuthenticatedUser(
        user_id=user_id,
        github_id=str(github_id) if github_id is not None else None,
        github_login=str(github_login) if github_login is not None else None,
        email=str(email) if isinstance(email, str) else None,
    )


def get_current_user(authorization: str | None) -> AuthenticatedUser | None:
    """Verify a bearer token and return the identified user, or None if anonymous.

    Returns None — never raises — for a missing header, a malformed token, a bad
    signature, a wrong audience, an expired token, an `alg: none` forgery, or a
    JWKS fetch failure. Callers that require a user should use `require_user`
    (which turns None into a 401); callers that allow anonymous access can act on
    the None directly.

    Takes the raw header value (not a Request) so it stays unit-testable and can
    be reused by service-layer callers.
    """
    token = _extract_bearer_token(authorization)
    if token is None:
        return None

    # Nothing to verify against — unconfigured backend (no JWT secret and no
    # SUPABASE_URL for JWKS). Treat as anonymous rather than erroring.
    if not config.SUPABASE_JWT_SECRET and not config.SUPABASE_URL:
        return None

    try:
        key, algorithms = _resolve_key_and_algorithms(token)
        claims = jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience=EXPECTED_AUDIENCE,
            options={"require": ["exp", "sub"]},
        )
    except Exception as exc:  # noqa: BLE001 - fail closed: any failure = anonymous
        # Debug-only: a rejected token is a normal, expected event (expired
        # sessions, probes) and must never be logged at a noisy level or with the
        # token value.
        logger.debug("Rejected bearer token: %s: %s", type(exc).__name__, exc)
        return None

    return _user_from_claims(claims)


def require_user(
    authorization: str | None = Header(default=None),
) -> AuthenticatedUser:
    """FastAPI dependency that demands a verified user, else 401.

    Use on any endpoint that must be signed in. The 401 detail is intentionally
    generic (never distinguishes absent vs invalid). The `configured -> require,
    unconfigured -> open` gating is applied by the routes in 15.3, not here.
    """
    user = get_current_user(authorization)
    if user is None:
        raise HTTPException(status_code=401, detail=UNAUTHENTICATED_MESSAGE)
    return user


def require_user_when_configured(
    authorization: str | None = Header(default=None),
) -> AuthenticatedUser | None:
    """Login gate honoring the two signed-out states (see PHASE_15_PLAN.md §1).

    This is the dependency the live analyze / generate / verify routes use:
      * Supabase UNCONFIGURED (local dev / self-host): returns None and the
        endpoint stays open — the no-login public-repo flow is unchanged.
      * Supabase CONFIGURED (production-like): a verified user is REQUIRED; an
        anonymous or invalid token gets a 401. Signed-out visitors never call these
        routes (they render the static demo fixture instead).

    Returns the AuthenticatedUser when configured (so a handler can attribute the
    run to a user_id), or None when unconfigured. Kept separate from require_user
    so endpoints that must ALWAYS have a user (e.g. saved projects) stay strict
    regardless of configuration.
    """
    if not supabase_client.is_configured():
        return None
    return require_user(authorization)


async def _request_targets_demo_repo(request: Request) -> bool:
    """True when the request body's repoUrl is the configured public demo repo.

    Reads the JSON body once; Starlette caches it, so the route still parses its own
    request model afterward. Any missing/non-JSON body, absent repoUrl, or a repo
    other than config.DEMO_REPO_* yields False — meaning the normal login gate
    applies. The comparison is case-insensitive on owner/repo.
    """
    if not config.DEMO_REPO_OWNER or not config.DEMO_REPO_NAME:
        return False
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001 - a non-JSON body is never the demo path
        return False
    repo_url = body.get("repoUrl") if isinstance(body, dict) else None
    if not isinstance(repo_url, str) or not repo_url:
        return False
    try:
        parsed = parse_github_repo_url(repo_url)
    except RepoUrlParseError:
        return False
    return (
        parsed.owner.lower() == config.DEMO_REPO_OWNER.lower()
        and parsed.repo.lower() == config.DEMO_REPO_NAME.lower()
    )


async def require_user_or_public_demo(
    request: Request,
    authorization: str | None = Header(default=None),
) -> AuthenticatedUser | None:
    """Login gate that ALSO allows anonymous reads of the one public demo repo.

    Identical to require_user_when_configured, except that when Supabase is
    configured and the caller is anonymous, the request is still permitted IF it
    targets the configured public demo repository (config.DEMO_REPO_*). This lets the
    signed-out product demo load real, live analysis data for that single public repo
    — commit history, file tree, ranked files — without exposing the analysis
    endpoints for arbitrary repos. Returns the verified user when present, otherwise
    None (anonymous but permitted). A non-demo anonymous request still gets a 401.
    """
    user = get_current_user(authorization)
    if user is not None:
        return user
    if not supabase_client.is_configured():
        return None
    if await _request_targets_demo_repo(request):
        return None
    raise HTTPException(status_code=401, detail=UNAUTHENTICATED_MESSAGE)


def reset_jwks_client() -> None:
    """Drop the memoized JWKS client. For tests that swap configuration only."""
    global _jwks_client
    with _jwks_lock:
        _jwks_client = None
