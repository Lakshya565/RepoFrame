import logging
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone

from app.services import github_app, github_service, installation_store, supabase_client
from app.services.auth import AuthenticatedUser

# Decides, per analyze request, whether to read a repo AS the signed-in user's
# GitHub App installation (private-repo access) or via the public path (Phase 15.5).
# The rule is conservative and safe: use an installation token ONLY when the user
# has installed the App AND the requested repo is actually in that installation's
# accessible set. Otherwise fall back to the public flow — so a public repo the
# user hasn't added to the App still works, and no token is minted needlessly.

logger = logging.getLogger(__name__)

_ACCESS_CACHE_SECONDS = 300
_TOKEN_EXPIRY_SAFETY_SECONDS = 300
_cache_lock = threading.Lock()


@dataclass(frozen=True)
class RepoAccess:
    """Resolved GitHub access without exposing the token outside backend services."""

    token: str | None
    installation_id: int | None


@dataclass(frozen=True)
class _CachedInstallation:
    record: installation_store.InstallationRecord | None
    cached_at: float


@dataclass(frozen=True)
class _CachedInstallationAccess:
    token: str
    expires_at: float
    repositories: frozenset[str]
    repositories_cached_at: float


_installation_cache: dict[str, _CachedInstallation] = {}
_access_cache: dict[int, _CachedInstallationAccess] = {}


def _parse_expiry(value: str, now: float) -> float:
    """Parse GitHub's ISO expiry, falling back to its normal one-hour lifetime."""
    if not value:
        return now + 3600
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(
            timezone.utc
        ).timestamp()
    except ValueError:
        return now + 3600


def _get_installation_record(
    user: AuthenticatedUser,
    now: float,
) -> installation_store.InstallationRecord | None:
    with _cache_lock:
        cached = _installation_cache.get(user.user_id)
        if cached and now - cached.cached_at < _ACCESS_CACHE_SECONDS:
            return cached.record

    record = installation_store.get_installation_repository().get_by_user(user.user_id)
    with _cache_lock:
        _installation_cache[user.user_id] = _CachedInstallation(record, now)
    return record


def _get_installation_access(
    installation_id: int,
    now: float,
) -> _CachedInstallationAccess:
    with _cache_lock:
        cached = _access_cache.get(installation_id)

    token_valid = bool(
        cached and cached.expires_at - _TOKEN_EXPIRY_SAFETY_SECONDS > now
    )
    repositories_fresh = bool(
        cached
        and now - cached.repositories_cached_at < _ACCESS_CACHE_SECONDS
    )
    if cached and token_valid and repositories_fresh:
        return cached

    if cached and token_valid:
        token = cached.token
        expires_at = cached.expires_at
    else:
        minted = github_app.mint_installation_token(installation_id)
        token = minted.token
        expires_at = _parse_expiry(minted.expires_at, now)

    repositories = frozenset(
        str(repository.get("full_name", "")).lower()
        for repository in github_app.list_installation_repositories(token)
        if repository.get("full_name")
    )
    result = _CachedInstallationAccess(
        token=token,
        expires_at=expires_at,
        repositories=repositories,
        repositories_cached_at=now,
    )
    with _cache_lock:
        _access_cache[installation_id] = result
    return result


def resolve_repo_access(
    user: AuthenticatedUser | None,
    owner: str,
    repo: str,
) -> RepoAccess:
    """Resolve a repository-scoped installation token with bounded memory caches."""
    if user is None or user.github_id is None:
        return RepoAccess(None, None)
    if not github_app.is_configured() or not supabase_client.is_configured():
        return RepoAccess(None, None)

    now = time.time()
    try:
        record = _get_installation_record(user, now)
    except Exception as exc:  # noqa: BLE001 - store/config failure => public path
        logger.debug("Installation lookup failed; using public path: %s", exc)
        return RepoAccess(None, None)

    if record is None:
        return RepoAccess(None, None)

    try:
        access = _get_installation_access(record.installation_id, now)
    except github_app.GitHubAppError as exc:
        logger.debug("Installation token/repos failed; using public path: %s", exc)
        return RepoAccess(None, None)

    wanted = f"{owner}/{repo}".lower()
    if wanted in access.repositories:
        return RepoAccess(access.token, record.installation_id)
    return RepoAccess(None, None)


def resolve_installation_token(
    user: AuthenticatedUser | None, owner: str, repo: str
) -> str | None:
    """Return an installation token that grants this repo, or None for the public path.

    None (never an error) whenever: no user, the App/Supabase aren't configured, the
    user has no installation, or the repo isn't in the installation. Only mints a
    token when the user has an installation, and only returns it after verifying the
    repo is in that installation's accessible set (a per-repo scope check). Any
    GitHub App error is swallowed to None so a failure here degrades to the public
    path rather than breaking analysis.
    """
    return resolve_repo_access(user, owner, repo).token


def apply_repo_access(
    user: AuthenticatedUser | None, owner: str, repo: str
) -> None:
    """Resolve and install the request's GitHub token onto github_service.

    Always sets the token (to a value or None), so the public path is explicit and
    no installation token can carry over within a reused context. Call once at the
    top of each analyze route, after the repo URL is parsed.
    """
    github_service.set_installation_token(resolve_installation_token(user, owner, repo))


def reset_access_cache() -> None:
    """Clear process-memory installation data; used by tests and webhook changes."""
    with _cache_lock:
        _installation_cache.clear()
        _access_cache.clear()
