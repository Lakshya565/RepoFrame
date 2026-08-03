import logging
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone

from app.services import (
    github_app,
    github_authorization_store,
    github_oauth,
    github_service,
    installation_store,
    supabase_client,
)
from app.services.auth import AuthenticatedUser

logger = logging.getLogger(__name__)

_ACCESS_CACHE_SECONDS = 300
_TOKEN_EXPIRY_SAFETY_SECONDS = 300
_cache_lock = threading.Lock()


@dataclass(frozen=True)
class RepoAccess:
    """Repository-scoped backend access; the token never reaches the browser."""

    token: str | None
    installation_id: int | None


@dataclass(frozen=True)
class _CachedInstallations:
    records: tuple[installation_store.InstallationRecord, ...]
    cached_at: float


@dataclass(frozen=True)
class _CachedInstallationToken:
    token: str
    expires_at: float


@dataclass(frozen=True)
class _CachedUserRepositories:
    repositories: frozenset[str]
    cached_at: float


_installation_cache: dict[str, _CachedInstallations] = {}
_installation_token_cache: dict[int, _CachedInstallationToken] = {}
_user_repository_cache: dict[tuple[str, int], _CachedUserRepositories] = {}


def _parse_expiry(value: str, now: float) -> float:
    if not value:
        return now + 3600
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(
            timezone.utc
        ).timestamp()
    except ValueError:
        return now + 3600


def _get_installation_records(
    user_id: str, now: float
) -> tuple[installation_store.InstallationRecord, ...]:
    with _cache_lock:
        cached = _installation_cache.get(user_id)
        if cached and now - cached.cached_at < _ACCESS_CACHE_SECONDS:
            return cached.records

    records = tuple(
        installation_store.get_installation_repository().list_by_user(user_id)
    )
    with _cache_lock:
        _installation_cache[user_id] = _CachedInstallations(records, now)
    return records


def _get_installation_token(installation_id: int, now: float) -> str:
    with _cache_lock:
        cached = _installation_token_cache.get(installation_id)
    if cached and cached.expires_at - _TOKEN_EXPIRY_SAFETY_SECONDS > now:
        return cached.token

    minted = github_app.mint_installation_token(installation_id)
    result = _CachedInstallationToken(
        token=minted.token,
        expires_at=_parse_expiry(minted.expires_at, now),
    )
    with _cache_lock:
        _installation_token_cache[installation_id] = result
    return result.token


def _get_user_repositories(
    user_id: str,
    installation_id: int,
    user_token: str,
    now: float,
) -> frozenset[str]:
    cache_key = (user_id, installation_id)
    with _cache_lock:
        cached = _user_repository_cache.get(cache_key)
    if cached and now - cached.cached_at < _ACCESS_CACHE_SECONDS:
        return cached.repositories

    repositories = github_oauth.list_user_installation_repositories(
        user_token, installation_id
    )
    with _cache_lock:
        _user_repository_cache[cache_key] = _CachedUserRepositories(
            repositories=repositories,
            cached_at=now,
        )
    return repositories


def resolve_repo_access(
    user: AuthenticatedUser | None,
    owner: str,
    repo: str,
) -> RepoAccess:
    """Use an App installation only after GitHub confirms current user access.

    The user-token repository endpoint is the important organization boundary: a
    stale database mapping alone never grants access after membership is removed.
    Failures degrade to the existing public path so public repositories continue
    to work during an authorization or installation outage.
    """
    if user is None or user.github_id is None:
        return RepoAccess(None, None)
    if (
        not github_app.is_configured()
        or not github_oauth.is_configured()
        or not supabase_client.is_configured()
    ):
        return RepoAccess(None, None)

    now = time.time()
    try:
        records = _get_installation_records(user.user_id, now)
        authorization_repository = (
            github_authorization_store.get_github_authorization_repository()
        )
        user_token = github_oauth.get_valid_access_token(
            authorization_repository, user.user_id
        )
    except Exception as exc:  # noqa: BLE001 - access failure keeps public repos usable
        logger.debug("GitHub authorization lookup failed; using public path: %s", exc)
        return RepoAccess(None, None)

    if not records or not user_token:
        return RepoAccess(None, None)

    wanted = f"{owner}/{repo}".lower()
    for record in records:
        try:
            repositories = _get_user_repositories(
                user.user_id, record.installation_id, user_token, now
            )
            if wanted in repositories:
                return RepoAccess(
                    _get_installation_token(record.installation_id, now),
                    record.installation_id,
                )
        except (github_app.GitHubAppError, github_oauth.GitHubOAuthError) as exc:
            logger.debug(
                "GitHub installation %s unavailable; trying another: %s",
                record.installation_id,
                exc,
            )
    return RepoAccess(None, None)


def resolve_installation_token(
    user: AuthenticatedUser | None, owner: str, repo: str
) -> str | None:
    return resolve_repo_access(user, owner, repo).token


def apply_repo_access(
    user: AuthenticatedUser | None, owner: str, repo: str
) -> None:
    github_service.set_installation_token(resolve_installation_token(user, owner, repo))


def reset_access_cache() -> None:
    with _cache_lock:
        _installation_cache.clear()
        _installation_token_cache.clear()
        _user_repository_cache.clear()
