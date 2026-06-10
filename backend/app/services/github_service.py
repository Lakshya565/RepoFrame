import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import cast

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


def _required_int(payload: Mapping[str, object], key: str) -> int:
    value = payload.get(key)
    if type(value) is not int:
        raise GitHubMetadataError(
            "GitHub returned metadata with invalid number fields.",
            502,
        )

    return value
