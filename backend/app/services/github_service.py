import os
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import cast
from urllib.parse import quote

import requests
from dotenv import load_dotenv
from requests import RequestException

GITHUB_API_BASE_URL = "https://api.github.com"
GITHUB_TOKEN_ENV = "GITHUB_TOKEN"
REQUEST_TIMEOUT_SECONDS = 10
BACKEND_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

load_dotenv(BACKEND_ENV_FILE)


class GitHubMetadataError(RuntimeError):
    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class GitHubRepoMetadata:
    name: str
    description: str | None
    default_branch: str
    stars: int
    forks: int
    language: str | None
    html_url: str


class GitHubTreeError(RuntimeError):
    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


class GitHubRateLimitError(RuntimeError):
    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class GitHubRepoFile:
    path: str
    type: str
    size: int | None
    url: str | None


@dataclass(frozen=True)
class GitHubRepoTree:
    files: list[GitHubRepoFile]
    total_files: int
    total_directories: int
    is_truncated: bool


@dataclass(frozen=True)
class GitHubRateLimit:
    limit: int
    used: int
    remaining: int
    reset: int
    reset_at: str
    is_authenticated: bool


def fetch_repo_metadata(
    owner: str,
    repo: str,
    session: requests.Session | None = None,
) -> GitHubRepoMetadata:
    client = session or requests.Session()

    try:
        response = client.get(
            f"{GITHUB_API_BASE_URL}/repos/{owner}/{repo}",
            headers=_build_headers(),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except RequestException as exc:
        raise GitHubMetadataError(
            "RepoFrame could not reach GitHub right now. Please try again.",
            502,
        ) from exc

    if response.status_code == 404:
        raise GitHubMetadataError(
            "GitHub could not find that public repository.",
            404,
        )

    if response.status_code == 403:
        if response.headers.get("x-ratelimit-remaining") == "0":
            raise GitHubMetadataError(
                "GitHub rate limit reached. Add a GITHUB_TOKEN on the backend or try again later.",
                429,
            )

        raise GitHubMetadataError(
            "GitHub denied access to that repository metadata.",
            403,
        )

    if response.status_code >= 500:
        raise GitHubMetadataError(
            "GitHub is not available right now. Please try again.",
            502,
        )

    if not response.ok:
        raise GitHubMetadataError(
            "RepoFrame could not fetch metadata for that repository.",
            502,
        )

    return _parse_metadata_response(response)


def fetch_repo_tree(
    owner: str,
    repo: str,
    default_branch: str,
    session: requests.Session | None = None,
) -> GitHubRepoTree:
    client = session or requests.Session()
    tree_ref = quote(default_branch, safe="")

    try:
        response = client.get(
            f"{GITHUB_API_BASE_URL}/repos/{owner}/{repo}/git/trees/{tree_ref}",
            params={"recursive": "1"},
            headers=_build_headers(),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except RequestException as exc:
        raise GitHubTreeError(
            "RepoFrame could not reach GitHub for the repository file tree.",
            502,
        ) from exc

    if response.status_code == 404:
        raise GitHubTreeError(
            "GitHub could not find that repository file tree.",
            404,
        )

    if response.status_code == 403:
        if response.headers.get("x-ratelimit-remaining") == "0":
            raise GitHubTreeError(
                "GitHub rate limit reached. Add a GITHUB_TOKEN on the backend or try again later.",
                429,
            )

        raise GitHubTreeError(
            "GitHub denied access to that repository file tree.",
            403,
        )

    if response.status_code == 409:
        raise GitHubTreeError(
            "GitHub could not return a file tree for this repository.",
            409,
        )

    if response.status_code >= 500:
        raise GitHubTreeError(
            "GitHub is not available right now. Please try again.",
            502,
        )

    if not response.ok:
        raise GitHubTreeError(
            "RepoFrame could not fetch the repository file tree.",
            502,
        )

    return _parse_tree_response(response)


def fetch_rate_limit(
    session: requests.Session | None = None,
) -> GitHubRateLimit:
    client = session or requests.Session()

    try:
        response = client.get(
            f"{GITHUB_API_BASE_URL}/rate_limit",
            headers=_build_headers(),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except RequestException as exc:
        raise GitHubRateLimitError(
            "RepoFrame could not reach GitHub for rate limit status.",
            502,
        ) from exc

    if response.status_code == 403:
        raise GitHubRateLimitError(
            "GitHub denied access to rate limit status.",
            403,
        )

    if response.status_code >= 500:
        raise GitHubRateLimitError(
            "GitHub is not available right now. Please try again.",
            502,
        )

    if not response.ok:
        raise GitHubRateLimitError(
            "RepoFrame could not fetch GitHub rate limit status.",
            502,
        )

    return _parse_rate_limit_response(response)


def _build_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "RepoFrame",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    github_token = os.environ.get(GITHUB_TOKEN_ENV)
    if github_token:
        headers["Authorization"] = f"Bearer {github_token}"

    return headers


def _parse_metadata_response(response: requests.Response) -> GitHubRepoMetadata:
    try:
        raw_payload = response.json()
    except ValueError as exc:
        raise GitHubMetadataError(
            "GitHub returned an unreadable metadata response.",
            502,
        ) from exc

    if not isinstance(raw_payload, dict):
        raise GitHubMetadataError(
            "GitHub returned metadata in an unexpected format.",
            502,
        )

    payload = cast(Mapping[str, object], raw_payload)

    return GitHubRepoMetadata(
        name=_required_string(payload, "name"),
        description=_optional_string(payload, "description"),
        default_branch=_required_string(payload, "default_branch"),
        stars=_required_int(payload, "stargazers_count"),
        forks=_required_int(payload, "forks_count"),
        language=_optional_string(payload, "language"),
        html_url=_required_string(payload, "html_url"),
    )


def _parse_tree_response(response: requests.Response) -> GitHubRepoTree:
    try:
        raw_payload = response.json()
    except ValueError as exc:
        raise GitHubTreeError(
            "GitHub returned an unreadable file tree response.",
            502,
        ) from exc

    if not isinstance(raw_payload, dict):
        raise GitHubTreeError(
            "GitHub returned the file tree in an unexpected format.",
            502,
        )

    payload = cast(Mapping[str, object], raw_payload)
    raw_tree = payload.get("tree")
    if not isinstance(raw_tree, list):
        raise GitHubTreeError(
            "GitHub returned the file tree with missing required fields.",
            502,
        )

    files = [_parse_tree_item(item) for item in raw_tree]
    total_files = sum(1 for file in files if file.type == "file")
    total_directories = sum(1 for file in files if file.type == "directory")

    return GitHubRepoTree(
        files=files,
        total_files=total_files,
        total_directories=total_directories,
        is_truncated=_optional_bool(payload, "truncated") or False,
    )


def _parse_rate_limit_response(response: requests.Response) -> GitHubRateLimit:
    try:
        raw_payload = response.json()
    except ValueError as exc:
        raise GitHubRateLimitError(
            "GitHub returned an unreadable rate limit response.",
            502,
        ) from exc

    if not isinstance(raw_payload, dict):
        raise GitHubRateLimitError(
            "GitHub returned rate limit status in an unexpected format.",
            502,
        )

    payload = cast(Mapping[str, object], raw_payload)
    resources = payload.get("resources")
    if not isinstance(resources, dict):
        raise GitHubRateLimitError(
            "GitHub returned rate limit status with missing required fields.",
            502,
        )

    core = resources.get("core")
    if not isinstance(core, dict):
        raise GitHubRateLimitError(
            "GitHub returned rate limit status with missing core fields.",
            502,
        )

    core_payload = cast(Mapping[str, object], core)
    reset = _required_rate_int(core_payload, "reset")

    return GitHubRateLimit(
        limit=_required_rate_int(core_payload, "limit"),
        used=_required_rate_int(core_payload, "used"),
        remaining=_required_rate_int(core_payload, "remaining"),
        reset=reset,
        reset_at=datetime.fromtimestamp(reset, tz=timezone.utc).isoformat(),
        is_authenticated=bool(os.environ.get(GITHUB_TOKEN_ENV)),
    )


def _parse_tree_item(raw_item: object) -> GitHubRepoFile:
    if not isinstance(raw_item, dict):
        raise GitHubTreeError(
            "GitHub returned file tree entries in an unexpected format.",
            502,
        )

    item = cast(Mapping[str, object], raw_item)
    return GitHubRepoFile(
        path=_normalize_tree_path(_required_tree_string(item, "path")),
        type=_normalize_tree_type(_required_tree_string(item, "type")),
        size=_optional_int(item, "size"),
        url=_optional_tree_string(item, "url"),
    )


def _normalize_tree_path(path: str) -> str:
    normalized_path = "/".join(
        part for part in path.replace("\\", "/").split("/") if part
    )
    if not normalized_path:
        raise GitHubTreeError(
            "GitHub returned a file tree entry with an empty path.",
            502,
        )

    return normalized_path


def _normalize_tree_type(github_type: str) -> str:
    if github_type == "blob":
        return "file"

    if github_type == "tree":
        return "directory"

    if github_type == "commit":
        return "submodule"

    raise GitHubTreeError(
        "GitHub returned a file tree entry with an unknown type.",
        502,
    )


def _required_tree_string(payload: Mapping[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise GitHubTreeError(
            "GitHub returned file tree entries with missing required fields.",
            502,
        )

    return value


def _optional_tree_string(payload: Mapping[str, object], key: str) -> str | None:
    value = payload.get(key)
    if value is None:
        return None

    if not isinstance(value, str):
        raise GitHubTreeError(
            "GitHub returned file tree entries with invalid optional fields.",
            502,
        )

    return value


def _required_string(payload: Mapping[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise GitHubMetadataError(
            "GitHub returned metadata with missing required fields.",
            502,
        )

    return value


def _optional_string(payload: Mapping[str, object], key: str) -> str | None:
    value = payload.get(key)
    if value is None:
        return None

    if not isinstance(value, str):
        raise GitHubMetadataError(
            "GitHub returned metadata with invalid optional fields.",
            502,
        )

    return value


def _optional_bool(payload: Mapping[str, object], key: str) -> bool | None:
    value = payload.get(key)
    if value is None:
        return None

    if type(value) is not bool:
        raise GitHubTreeError(
            "GitHub returned the file tree with invalid optional fields.",
            502,
        )

    return value


def _required_int(payload: Mapping[str, object], key: str) -> int:
    value = payload.get(key)
    if type(value) is not int:
        raise GitHubMetadataError(
            "GitHub returned metadata with invalid number fields.",
            502,
        )

    return value


def _required_rate_int(payload: Mapping[str, object], key: str) -> int:
    value = payload.get(key)
    if type(value) is not int:
        raise GitHubRateLimitError(
            "GitHub returned rate limit status with invalid number fields.",
            502,
        )

    return value


def _optional_int(payload: Mapping[str, object], key: str) -> int | None:
    value = payload.get(key)
    if value is None:
        return None

    if type(value) is not int:
        raise GitHubTreeError(
            "GitHub returned file tree entries with invalid number fields.",
            502,
        )

    return value
