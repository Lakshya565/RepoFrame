import hashlib
import hmac
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import jwt
import requests

from app import config

# The GitHub App side of Phase 15 auth: everything needed to act AS the RepoFrame
# GitHub App and mint the short-lived, per-installation tokens that read a user's
# repos. This is deliberately separate from identity (Supabase) — see
# PHASE_15_PLAN.md §2. Key properties:
#   * The App private key signs ~9-minute "app JWTs" (RS256). It is backend-only,
#     read from env (inline or a .pem path), never logged or returned.
#   * Installation tokens are minted per request and returned to the caller to use
#     immediately; NOTHING is stored here (the store only keeps the non-secret
#     installation_id → user mapping).
#   * Every network call takes an injectable `request` function, so the whole
#     module is tested offline against a fake — no real GitHub, zero tokens.

logger = logging.getLogger(__name__)

GITHUB_API_BASE_URL = "https://api.github.com"
REQUEST_TIMEOUT_SECONDS = 10

# App JWTs may live at most 10 minutes; use 9 to stay clear of the limit, and
# backdate iat 60s to tolerate clock skew between us and GitHub (both GitHub's
# documented guidance).
_APP_JWT_TTL_SECONDS = 540
_APP_JWT_BACKDATE_SECONDS = 60

# Accept header pinning the current GitHub REST media type.
_GITHUB_ACCEPT = "application/vnd.github+json"


# Carries a user-facing GitHub App error plus the HTTP status a route should
# return, mirroring the github_service / llm_client error pattern so routes stay
# thin. Messages here never include the private key or a minted token.
class GitHubAppError(RuntimeError):
    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


# The GitHub account an installation belongs to (for the ownership check) plus its
# repo-selection scope ('all' or 'selected').
@dataclass(frozen=True)
class InstallationAccount:
    account_id: int
    login: str
    repo_selection: str


# A freshly minted installation token and when it expires (ISO-8601 from GitHub).
# Held only in memory by the caller for the life of one request.
@dataclass(frozen=True)
class InstallationToken:
    token: str
    expires_at: str


# One network call reduced to (status_code, json_body). Injectable so tests pass a
# fake and no real HTTP happens.
RequestFn = Callable[..., tuple[int, dict]]

# Cached PEM so we don't re-read the file on every JWT. Reset in tests.
_private_key_cache: str | None = None


def is_configured() -> bool:
    """True when the App is configured enough to mint tokens (id + a private key).

    Read live from config so tests can toggle it. When False, callers must fall
    back to public-repo-only access (no private-repo path).
    """
    return bool(
        config.GITHUB_APP_ID
        and (config.GITHUB_APP_PRIVATE_KEY or config.GITHUB_APP_PRIVATE_KEY_PATH)
    )


def _load_private_key() -> str:
    """Return the App private key PEM, from the inline env or the .pem path.

    Cached after the first read. Raises GitHubAppError (500 — a misconfiguration,
    not a user error) when neither source is set.
    """
    global _private_key_cache
    if _private_key_cache is not None:
        return _private_key_cache

    if config.GITHUB_APP_PRIVATE_KEY:
        key = config.GITHUB_APP_PRIVATE_KEY
    elif config.GITHUB_APP_PRIVATE_KEY_PATH:
        try:
            key = Path(config.GITHUB_APP_PRIVATE_KEY_PATH).read_text(encoding="utf-8")
        except OSError as exc:
            raise GitHubAppError(
                "GitHub App private key file could not be read.", 500
            ) from exc
    else:
        raise GitHubAppError("GitHub App private key is not configured.", 500)

    _private_key_cache = key
    return key


def reset_private_key_cache() -> None:
    """Drop the cached PEM. For tests that swap key configuration only."""
    global _private_key_cache
    _private_key_cache = None


def create_app_jwt() -> str:
    """Sign a short-lived app JWT (RS256) that authenticates as the App itself.

    Used as the Bearer for the app-level endpoints (read an installation, mint an
    installation token). Not an installation token — it grants no repo access on
    its own.
    """
    now = int(time.time())
    payload = {
        "iat": now - _APP_JWT_BACKDATE_SECONDS,
        "exp": now + _APP_JWT_TTL_SECONDS,
        "iss": config.GITHUB_APP_ID,
    }
    return jwt.encode(payload, _load_private_key(), algorithm="RS256")


def _default_request(
    method: str,
    url: str,
    headers: dict | None = None,
    json_body: dict | None = None,
) -> tuple[int, dict]:
    """Real HTTP via requests, reduced to (status_code, json_body)."""
    response = requests.request(
        method,
        url,
        headers=headers,
        json=json_body,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    body: dict = {}
    if response.content:
        try:
            parsed = response.json()
            if isinstance(parsed, dict):
                body = parsed
        except ValueError:
            body = {}
    return response.status_code, body


def _app_headers() -> dict:
    """Authorization + Accept headers for app-level (app-JWT) requests."""
    return {
        "Authorization": f"Bearer {create_app_jwt()}",
        "Accept": _GITHUB_ACCEPT,
    }


def get_installation_account(
    installation_id: int, request: RequestFn = _default_request
) -> InstallationAccount:
    """Read which GitHub account an installation belongs to (for ownership binding).

    Raises GitHubAppError on a non-200 or a malformed body — the caller maps that to
    a clean HTTP error, never a raw GitHub response.
    """
    status, body = request(
        "GET",
        f"{GITHUB_API_BASE_URL}/app/installations/{installation_id}",
        headers=_app_headers(),
    )
    if status != 200:
        raise GitHubAppError("Could not read the GitHub App installation.", 502)
    account = body.get("account")
    if not isinstance(account, dict) or "id" not in account:
        raise GitHubAppError("GitHub App installation has no account.", 502)
    return InstallationAccount(
        account_id=int(account["id"]),
        login=str(account.get("login", "")),
        repo_selection=str(body.get("repository_selection", "all")),
    )


def mint_installation_token(
    installation_id: int, request: RequestFn = _default_request
) -> InstallationToken:
    """Mint a fresh ~1h installation token for one installation.

    The token is returned for immediate use and never stored. Raises GitHubAppError
    on failure.
    """
    status, body = request(
        "POST",
        f"{GITHUB_API_BASE_URL}/app/installations/{installation_id}/access_tokens",
        headers=_app_headers(),
    )
    if status != 201 or "token" not in body:
        raise GitHubAppError("Could not mint a GitHub installation token.", 502)
    return InstallationToken(
        token=str(body["token"]),
        expires_at=str(body.get("expires_at", "")),
    )


def list_installation_repositories(
    token: str, request: RequestFn = _default_request
) -> list[dict]:
    """List the repositories an installation token can access.

    Uses the INSTALLATION token (not the app JWT). Returns the raw repo dicts; the
    caller picks the fields it needs.
    """
    status, body = request(
        "GET",
        f"{GITHUB_API_BASE_URL}/installation/repositories",
        headers={"Authorization": f"token {token}", "Accept": _GITHUB_ACCEPT},
    )
    if status != 200:
        raise GitHubAppError("Could not list installation repositories.", 502)
    repositories = body.get("repositories")
    return repositories if isinstance(repositories, list) else []


def verify_webhook_signature(body: bytes, signature_header: str | None) -> bool:
    """Verify a webhook's X-Hub-Signature-256 against the shared secret (HMAC-SHA256).

    Fails CLOSED: returns False when the secret is unset, the header is missing or
    malformed, or the digest does not match — so an unconfigured or forged webhook
    is never trusted. Uses a constant-time compare.
    """
    secret = config.GITHUB_APP_WEBHOOK_SECRET
    if not secret:
        return False
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)
