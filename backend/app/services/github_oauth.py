import base64
import hashlib
import secrets
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import jwt
import requests
from cryptography.fernet import Fernet, InvalidToken

from app import config
from app.services.github_authorization_store import (
    GitHubAuthorizationRecord,
    GitHubAuthorizationRepository,
)

GITHUB_API_BASE_URL = "https://api.github.com"
GITHUB_OAUTH_BASE_URL = "https://github.com/login/oauth"
REQUEST_TIMEOUT_SECONDS = 10
STATE_AUDIENCE = "repoframe-github-install"
STATE_TTL_SECONDS = 1800
TOKEN_EXPIRY_SAFETY_SECONDS = 300
_GITHUB_ACCEPT = "application/vnd.github+json"
_GITHUB_API_VERSION = "2022-11-28"
_MAX_PAGES = 10


class GitHubOAuthError(RuntimeError):
    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class GitHubUserToken:
    access_token: str
    refresh_token: str | None
    access_expires_at: str | None
    refresh_expires_at: str | None


@dataclass(frozen=True)
class GitHubUser:
    user_id: int
    login: str


@dataclass(frozen=True)
class UserInstallation:
    installation_id: int
    account_id: int
    account_login: str
    account_type: str
    repo_selection: str
    settings_url: str


@dataclass(frozen=True)
class InstallState:
    return_to: str
    code_challenge: str | None


@dataclass(frozen=True)
class AuthorizationStart:
    authorization_url: str
    state: str
    code_verifier: str


RequestFn = Callable[..., tuple[int, dict]]


def is_configured() -> bool:
    """Return whether OAuth-on-install and encrypted persistence can operate."""
    required_values_present = bool(
        config.GITHUB_APP_CLIENT_ID
        and config.GITHUB_APP_CLIENT_SECRET
        and config.GITHUB_APP_SLUG
        and len(config.GITHUB_APP_STATE_SECRET.encode()) >= 32
        and config.GITHUB_USER_TOKEN_ENCRYPTION_KEY
    )
    if not required_values_present:
        return False
    try:
        Fernet(config.GITHUB_USER_TOKEN_ENCRYPTION_KEY.encode())
    except (TypeError, ValueError):
        return False
    return True


def _safe_return_to(value: str | None) -> str:
    """Limit redirects to an app-local path to prevent an open redirect."""
    if not value or not value.startswith("/") or value.startswith("//"):
        return "/"
    if "\\" in value or "://" in value:
        return "/"
    return value


def create_install_state(
    user_id: str,
    return_to: str | None = None,
    code_challenge: str | None = None,
) -> str:
    if not config.GITHUB_APP_STATE_SECRET:
        raise GitHubOAuthError("GitHub connection state is not configured.", 503)
    now = int(time.time())
    return jwt.encode(
        {
            "sub": user_id,
            "returnTo": _safe_return_to(return_to),
            "iat": now,
            "exp": now + STATE_TTL_SECONDS,
            "aud": STATE_AUDIENCE,
            "jti": secrets.token_urlsafe(16),
            "codeChallenge": code_challenge,
        },
        config.GITHUB_APP_STATE_SECRET,
        algorithm="HS256",
    )


def read_install_state(state: str, expected_user_id: str) -> InstallState:
    try:
        payload = jwt.decode(
            state,
            config.GITHUB_APP_STATE_SECRET,
            algorithms=["HS256"],
            audience=STATE_AUDIENCE,
            options={"require": ["sub", "exp", "iat"]},
        )
    except Exception as exc:  # noqa: BLE001 - all invalid state fails closed
        raise GitHubOAuthError("GitHub connection state is invalid or expired.", 400) from exc
    if payload.get("sub") != expected_user_id:
        raise GitHubOAuthError("GitHub connection belongs to another session.", 403)
    challenge = payload.get("codeChallenge")
    return InstallState(
        return_to=_safe_return_to(payload.get("returnTo")),
        code_challenge=challenge if isinstance(challenge, str) else None,
    )


def _pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def create_authorization_start(
    user_id: str, return_to: str | None = None
) -> AuthorizationStart:
    """Build the standard GitHub App OAuth flow with browser-held PKCE proof."""
    if not is_configured():
        raise GitHubOAuthError(
            "GitHub private-repository access is not configured.", 503
        )
    verifier = secrets.token_urlsafe(64)
    challenge = _pkce_challenge(verifier)
    state = create_install_state(user_id, return_to, code_challenge=challenge)
    authorization_url = f"{GITHUB_OAUTH_BASE_URL}/authorize?" + urlencode(
        {
            "client_id": config.GITHUB_APP_CLIENT_ID,
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
    )
    return AuthorizationStart(authorization_url, state, verifier)


def build_install_url(
    user_id: str,
    return_to: str | None = None,
    state: str | None = None,
) -> str:
    if not is_configured():
        raise GitHubOAuthError("GitHub private-repository access is not configured.", 503)
    signed_state = state or create_install_state(user_id, return_to)
    return (
        f"https://github.com/apps/{config.GITHUB_APP_SLUG}/installations/new?"
        + urlencode({"state": signed_state})
    )


def _default_request(
    method: str,
    url: str,
    headers: dict | None = None,
    data: dict | None = None,
) -> tuple[int, dict]:
    response = requests.request(
        method,
        url,
        headers=headers,
        data=data,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    try:
        body = response.json() if response.content else {}
    except ValueError:
        body = {}
    return response.status_code, body if isinstance(body, dict) else {}


def exchange_code(
    code: str,
    code_verifier: str | None = None,
    request: RequestFn = _default_request,
) -> GitHubUserToken:
    request_data = {
        "client_id": config.GITHUB_APP_CLIENT_ID,
        "client_secret": config.GITHUB_APP_CLIENT_SECRET,
        "code": code,
    }
    if code_verifier:
        request_data["code_verifier"] = code_verifier
    status, body = request(
        "POST",
        f"{GITHUB_OAUTH_BASE_URL}/access_token",
        headers={"Accept": "application/json"},
        data=request_data,
    )
    if status != 200 or not body.get("access_token"):
        raise GitHubOAuthError("GitHub did not authorize repository access.", 502)
    return _token_from_body(body)


def validate_code_verifier(
    state: InstallState, code_verifier: str | None
) -> None:
    if state.code_challenge is None:
        return
    if not code_verifier or not secrets.compare_digest(
        _pkce_challenge(code_verifier), state.code_challenge
    ):
        raise GitHubOAuthError("GitHub authorization proof is invalid.", 400)


def refresh_access_token(
    refresh_token: str, request: RequestFn = _default_request
) -> GitHubUserToken:
    status, body = request(
        "POST",
        f"{GITHUB_OAUTH_BASE_URL}/access_token",
        headers={"Accept": "application/json"},
        data={
            "client_id": config.GITHUB_APP_CLIENT_ID,
            "client_secret": config.GITHUB_APP_CLIENT_SECRET,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
    )
    if status != 200 or not body.get("access_token"):
        raise GitHubOAuthError("GitHub authorization expired. Reconnect GitHub.", 401)
    return _token_from_body(body)


def _expiry_from_seconds(value: object) -> str | None:
    try:
        seconds = int(value)
    except (TypeError, ValueError):
        return None
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()


def _token_from_body(body: dict) -> GitHubUserToken:
    return GitHubUserToken(
        access_token=str(body["access_token"]),
        refresh_token=str(body["refresh_token"]) if body.get("refresh_token") else None,
        access_expires_at=_expiry_from_seconds(body.get("expires_in")),
        refresh_expires_at=_expiry_from_seconds(body.get("refresh_token_expires_in")),
    )


def _user_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": _GITHUB_ACCEPT,
        "X-GitHub-Api-Version": _GITHUB_API_VERSION,
    }


def get_github_user(token: str, request: RequestFn = _default_request) -> GitHubUser:
    status, body = request(
        "GET", f"{GITHUB_API_BASE_URL}/user", headers=_user_headers(token)
    )
    if status != 200 or not body.get("id"):
        raise GitHubOAuthError("Could not verify the authorized GitHub user.", 502)
    return GitHubUser(user_id=int(body["id"]), login=str(body.get("login", "")))


def list_user_installations(
    token: str, request: RequestFn = _default_request
) -> list[UserInstallation]:
    installations: list[UserInstallation] = []
    for page in range(1, _MAX_PAGES + 1):
        status, body = request(
            "GET",
            f"{GITHUB_API_BASE_URL}/user/installations?per_page=100&page={page}",
            headers=_user_headers(token),
        )
        if status != 200:
            raise GitHubOAuthError(
                "Could not read your GitHub App installations.", 502
            )
        raw_installations = body.get("installations")
        if not isinstance(raw_installations, list):
            break
        for item in raw_installations:
            account = item.get("account") if isinstance(item, dict) else None
            if (
                not isinstance(account, dict)
                or not item.get("id")
                or not account.get("id")
            ):
                continue
            account_type = str(account.get("type", "User"))
            installations.append(
                UserInstallation(
                    installation_id=int(item["id"]),
                    account_id=int(account["id"]),
                    account_login=str(account.get("login", "")),
                    account_type=(
                        account_type
                        if account_type in {"User", "Organization"}
                        else "User"
                    ),
                    repo_selection=str(item.get("repository_selection", "all")),
                    settings_url=str(item.get("html_url", "")),
                )
            )
        if len(raw_installations) < 100:
            break
    return installations


def list_user_installation_repositories(
    token: str, installation_id: int, request: RequestFn = _default_request
) -> frozenset[str]:
    repository_names: set[str] = set()
    for page in range(1, _MAX_PAGES + 1):
        status, body = request(
            "GET",
            (
                f"{GITHUB_API_BASE_URL}/user/installations/{installation_id}"
                f"/repositories?per_page=100&page={page}"
            ),
            headers=_user_headers(token),
        )
        if status in {401, 403, 404}:
            raise GitHubOAuthError(
                "GitHub access changed. Reconnect or update the installation.", 401
            )
        if status != 200:
            raise GitHubOAuthError(
                "Could not verify repository access with GitHub.", 502
            )
        repositories = body.get("repositories")
        if not isinstance(repositories, list):
            break
        repository_names.update(
            str(repo["full_name"]).lower()
            for repo in repositories
            if isinstance(repo, dict) and repo.get("full_name")
        )
        if len(repositories) < 100:
            break
    return frozenset(repository_names)


def _fernet() -> Fernet:
    try:
        return Fernet(config.GITHUB_USER_TOKEN_ENCRYPTION_KEY.encode())
    except (TypeError, ValueError) as exc:
        raise GitHubOAuthError("GitHub token encryption is misconfigured.", 500) from exc


def _encrypt(value: str | None) -> str | None:
    return _fernet().encrypt(value.encode()).decode() if value else None


def _decrypt(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise GitHubOAuthError("Stored GitHub authorization could not be read.", 500) from exc


def save_authorization(
    repository: GitHubAuthorizationRepository,
    user_id: str,
    github_user_id: int,
    token: GitHubUserToken,
) -> GitHubAuthorizationRecord:
    record = GitHubAuthorizationRecord(
        user_id=user_id,
        github_user_id=github_user_id,
        access_token_ciphertext=_encrypt(token.access_token) or "",
        refresh_token_ciphertext=_encrypt(token.refresh_token),
        access_expires_at=token.access_expires_at,
        refresh_expires_at=token.refresh_expires_at,
    )
    return repository.upsert(record)


def _is_expiring(expires_at: str | None) -> bool:
    if not expires_at:
        return False
    try:
        expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return True
    return expiry <= time.time() + TOKEN_EXPIRY_SAFETY_SECONDS


def get_valid_access_token(
    repository: GitHubAuthorizationRepository,
    user_id: str,
    request: RequestFn = _default_request,
) -> str | None:
    record = repository.get_by_user(user_id)
    if record is None:
        return None
    access_token = _decrypt(record.access_token_ciphertext)
    if not _is_expiring(record.access_expires_at):
        return access_token
    refresh_token = _decrypt(record.refresh_token_ciphertext)
    if not refresh_token:
        return None
    refreshed = refresh_access_token(refresh_token, request)
    save_authorization(repository, user_id, record.github_user_id, refreshed)
    return refreshed.access_token
