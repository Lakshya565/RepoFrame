import os
import base64
import time
from collections.abc import Mapping
from contextvars import ContextVar
from dataclasses import dataclass, field
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

# Bounded warm-up retries for GitHub's commit-statistics endpoint, which returns
# 202 (with no body) the first time it must compute the stats for a repository.
# A few short retries usually catch the freshly-cached data on the same request;
# if not, the caller surfaces a "try again" state rather than blocking indefinitely.
COMMIT_STATS_MAX_ATTEMPTS = 3
COMMIT_STATS_RETRY_DELAY_SECONDS = 1.2

BACKEND_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

load_dotenv(BACKEND_ENV_FILE)

# Per-request GitHub App installation token (Phase 15.5). Default None → the public
# flow (backend PAT or unauthenticated). An analyze route sets this for a signed-in
# user whose installation grants the repo, so the fetchers below authenticate as
# that installation and can read private repos. It's a ContextVar, so each request
# runs against its own value and a token never leaks between requests.
_installation_token: ContextVar[str | None] = ContextVar(
    "installation_token", default=None
)


def set_installation_token(token: str | None) -> None:
    """Set (or clear, with None) the installation token for the current request.

    Called at the top of an analyze route AFTER resolving whether the signed-in
    user's App installation grants this repo. Always call it (with None for the
    public path) so a value can never carry over within a reused context.
    """
    _installation_token.set(token)


# Carries a user-facing GitHub metadata error and matching HTTP status so
# routers can map service failures directly to HTTP responses.
class GitHubMetadataError(RuntimeError):
    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


# Internal repository metadata shape after GitHub's raw JSON is validated. topics
# and license come from the same /repos response (no extra request): topics are the
# maintainer-applied subject tags, and license is the detected license's short
# identifier (SPDX id, e.g. "MIT"), or None when unlicensed/unrecognized.
@dataclass(frozen=True)
class GitHubRepoMetadata:
    name: str
    description: str | None
    default_branch: str
    stars: int
    forks: int
    language: str | None
    html_url: str
    topics: list[str] = field(default_factory=list)
    license: str | None = None


# Carries a user-facing GitHub file-tree error and matching HTTP status.
class GitHubTreeError(RuntimeError):
    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


# Carries a user-facing GitHub rate-limit error and matching HTTP status.
class GitHubRateLimitError(RuntimeError):
    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


# Carries a user-facing GitHub file-content error and matching HTTP status.
class GitHubFileContentError(RuntimeError):
    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


# Carries a user-facing GitHub commit-activity error and matching HTTP status.
# The stats endpoints have a distinct "still computing" (202) state, surfaced here
# as a retryable error so the route/UI can ask the user to try again shortly.
class GitHubCommitActivityError(RuntimeError):
    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


# Internal file-tree item shape after GitHub types and paths are normalized.
@dataclass(frozen=True)
class GitHubRepoFile:
    path: str
    type: str
    size: int | None
    url: str | None


# Internal tree response shape with both entries and summary counts.
@dataclass(frozen=True)
class GitHubRepoTree:
    files: list[GitHubRepoFile]
    total_files: int
    total_directories: int
    is_truncated: bool


# Internal rate-limit shape for the GitHub core REST API bucket.
@dataclass(frozen=True)
class GitHubRateLimit:
    limit: int
    used: int
    remaining: int
    reset: int
    reset_at: str
    is_authenticated: bool


# One week of commit activity: the Unix timestamp of the week's start (Sunday, UTC)
# and the total commits that week. `days` holds the seven daily counts (Sun–Sat)
# when the source provides them (the /stats/commit_activity endpoint does; the
# contributor-summed full-history source does not, leaving it empty).
@dataclass(frozen=True)
class WeeklyCommitCount:
    week_start: int
    total: int
    days: tuple[int, ...] = ()


# Internal text-file content shape after GitHub's content payload is decoded.
@dataclass(frozen=True)
class GitHubTextFileContent:
    path: str
    content: str
    size: int


# Fetches the basic repository facts RepoFrame needs for the summary card. The
# function handles GitHub-specific status codes before parsing the response.
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


# Fetches GitHub's full per-language byte breakdown for the repository (the data
# behind the colored language bar on the repo page), via the dedicated /languages
# endpoint. This matters because the single `language` field on the metadata
# response is ONLY the top language by bytes — for a polyglot repo like openjdk/jdk
# it reports just "Java" and hides C++, C, Assembly, etc. The /languages endpoint
# returns every language Linguist detected, so detection can represent the real mix.
#
# Best-effort enrichment: on any failure it returns an empty mapping so stack
# detection simply falls back to the primary language and file signals rather than
# failing the whole analysis over a secondary call. Returns {language: bytes}.
def fetch_repo_languages(
    owner: str,
    repo: str,
    session: requests.Session | None = None,
) -> dict[str, int]:
    client = session or requests.Session()

    try:
        response = client.get(
            f"{GITHUB_API_BASE_URL}/repos/{owner}/{repo}/languages",
            headers=_build_headers(),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except RequestException:
        return {}

    if not response.ok:
        return {}

    try:
        payload = response.json()
    except ValueError:
        return {}

    if not isinstance(payload, dict):
        return {}

    # GitHub maps language name -> bytes of code (positive ints). Keep only
    # well-formed, positive entries (and reject bools, which are ints in Python) so
    # a malformed value cannot poison detection.
    languages: dict[str, int] = {}
    for name, size in payload.items():
        if (
            isinstance(name, str)
            and isinstance(size, int)
            and not isinstance(size, bool)
            and size > 0
        ):
            languages[name] = size
    return languages


# GETs a GitHub /stats/* endpoint, handling the shared quirks of that family: the
# stats are computed lazily, so the first request for a repo returns 202 with no
# body while GitHub builds the cache (retried a bounded number of times, then a
# retryable "still computing" error), and an empty repository returns 204 (surfaced
# as None). Returns the 200 response for the caller to parse. The sleep function is
# injectable so tests never actually wait. Shared by both commit-activity fetchers.
def _request_repo_stats(
    client: requests.Session,
    url: str,
    max_attempts: int,
    retry_delay: float,
    sleep,
) -> requests.Response | None:
    for attempt in range(max_attempts):
        try:
            response = client.get(
                url,
                headers=_build_headers(),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except RequestException as exc:
            raise GitHubCommitActivityError(
                "RepoFrame could not reach GitHub for commit activity.",
                502,
            ) from exc

        if response.status_code == 202:
            if attempt < max_attempts - 1:
                sleep(retry_delay)
                continue
            raise GitHubCommitActivityError(
                "GitHub is still preparing commit statistics for this repository. "
                "Please try again in a moment.",
                503,
            )

        if response.status_code == 204:
            return None

        if response.status_code == 404:
            raise GitHubCommitActivityError(
                "GitHub could not find commit activity for that repository.",
                404,
            )

        if response.status_code == 403:
            if response.headers.get("x-ratelimit-remaining") == "0":
                raise GitHubCommitActivityError(
                    "GitHub rate limit reached. Add a GITHUB_TOKEN on the backend "
                    "or try again later.",
                    429,
                )
            raise GitHubCommitActivityError(
                "GitHub denied access to that repository's commit activity.",
                403,
            )

        if response.status_code >= 500:
            raise GitHubCommitActivityError(
                "GitHub is not available right now. Please try again.",
                502,
            )

        if not response.ok:
            raise GitHubCommitActivityError(
                "RepoFrame could not fetch commit activity for that repository.",
                502,
            )

        return response

    # Only reached if max_attempts is 0; kept so the function always returns/raises.
    raise GitHubCommitActivityError(
        "GitHub is still preparing commit statistics for this repository. "
        "Please try again in a moment.",
        503,
    )


# Fetches the last year of weekly commit counts (with daily breakdowns) for the
# repository's default branch from GitHub's /stats/commit_activity endpoint — one
# call, ~52 weekly buckets. Used for the "1 month" (daily) and "1 year" (weekly)
# timeline ranges. An empty repository yields an empty list.
def fetch_commit_activity(
    owner: str,
    repo: str,
    session: requests.Session | None = None,
    max_attempts: int = COMMIT_STATS_MAX_ATTEMPTS,
    retry_delay: float = COMMIT_STATS_RETRY_DELAY_SECONDS,
    sleep=time.sleep,
) -> list[WeeklyCommitCount]:
    client = session or requests.Session()
    url = f"{GITHUB_API_BASE_URL}/repos/{owner}/{repo}/stats/commit_activity"
    response = _request_repo_stats(client, url, max_attempts, retry_delay, sleep)
    if response is None:
        return []
    return _parse_commit_activity_response(response)


# Fetches the repository's FULL commit history as weekly totals from GitHub's
# /stats/contributors endpoint, summing every contributor's weekly commit counts
# into one series (used for the "all time" range, where the adaptive interval ladder
# picks a coarser grain). Returns the weekly totals plus a flag that is True when the
# result may be truncated — GitHub caps this endpoint at the top 100 contributors, so
# a repo with more can undercount (the timeline SHAPE stays representative). An empty
# repository yields an empty list.
def fetch_contributor_weeks(
    owner: str,
    repo: str,
    session: requests.Session | None = None,
    max_attempts: int = COMMIT_STATS_MAX_ATTEMPTS,
    retry_delay: float = COMMIT_STATS_RETRY_DELAY_SECONDS,
    sleep=time.sleep,
) -> tuple[list[WeeklyCommitCount], bool]:
    client = session or requests.Session()
    url = f"{GITHUB_API_BASE_URL}/repos/{owner}/{repo}/stats/contributors"
    response = _request_repo_stats(client, url, max_attempts, retry_delay, sleep)
    if response is None:
        return [], False
    return _parse_contributor_weeks_response(response)


# Fetches GitHub's recursive tree for the default branch without file contents.
# RepoFrame uses this structure in later phases for filtering and ranking.
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


# Fetches one small text file from GitHub's contents API. Shared by Phase 6 stack
# detection and the Phase 7 bounded evidence pipeline; callers pass their own size
# budget and decide how to handle missing, oversized, or non-text files.
def fetch_repo_text_file(
    owner: str,
    repo: str,
    path: str,
    ref: str,
    max_size_bytes: int,
    session: requests.Session | None = None,
) -> GitHubTextFileContent:
    client = session or requests.Session()
    encoded_path = quote(path, safe="/")

    try:
        response = client.get(
            f"{GITHUB_API_BASE_URL}/repos/{owner}/{repo}/contents/{encoded_path}",
            params={"ref": ref},
            headers=_build_headers(),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except RequestException as exc:
        raise GitHubFileContentError(
            "RepoFrame could not reach GitHub for repository file contents.",
            502,
        ) from exc

    if response.status_code == 404:
        raise GitHubFileContentError(
            "GitHub could not find a selected repository file.",
            404,
        )

    if response.status_code == 403:
        if response.headers.get("x-ratelimit-remaining") == "0":
            raise GitHubFileContentError(
                "GitHub rate limit reached. Add a GITHUB_TOKEN on the backend or try again later.",
                429,
            )

        raise GitHubFileContentError(
            "GitHub denied access to a selected repository file.",
            403,
        )

    if response.status_code >= 500:
        raise GitHubFileContentError(
            "GitHub is not available right now. Please try again.",
            502,
        )

    if not response.ok:
        raise GitHubFileContentError(
            "RepoFrame could not fetch a selected repository file.",
            502,
        )

    return _parse_text_file_response(response, path, max_size_bytes)


# Fetches the current core REST API rate-limit bucket for the active backend
# token or unauthenticated IP bucket.
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


# Builds shared GitHub REST headers and attaches the backend token when present.
# Keeping this centralized prevents frontend code from ever seeing secrets.
def _build_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "RepoFrame",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    # Phase 15.5: a per-request GitHub App installation token (set by the analyze
    # routes for a signed-in user with the App installed) takes precedence and
    # grants private-repo access. Falling back to the backend PAT keeps the public
    # flow byte-for-byte unchanged when no installation token is set.
    token = _installation_token.get() or os.environ.get(GITHUB_TOKEN_ENV)
    if token:
        headers["Authorization"] = f"Bearer {token}"

    return headers


# Converts GitHub's repo JSON into the strict internal metadata shape used by
# routers and tests.
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
        topics=_parse_topics(payload),
        license=_parse_license(payload),
    )


# Converts GitHub's /stats/commit_activity JSON (a list of weekly objects, each
# with a Unix "week" start and a "total" commit count) into normalized weekly
# counts, sorted oldest-first. Malformed entries are skipped rather than failing the
# whole series, and a non-list payload is a systemic format error.
def _parse_commit_activity_response(
    response: requests.Response,
) -> list[WeeklyCommitCount]:
    try:
        raw_payload = response.json()
    except ValueError as exc:
        raise GitHubCommitActivityError(
            "GitHub returned an unreadable commit-activity response.",
            502,
        ) from exc

    if not isinstance(raw_payload, list):
        raise GitHubCommitActivityError(
            "GitHub returned commit activity in an unexpected format.",
            502,
        )

    weeks: list[WeeklyCommitCount] = []
    for item in raw_payload:
        if not isinstance(item, dict):
            continue
        week = item.get("week")
        total = item.get("total")
        if (
            isinstance(week, int)
            and not isinstance(week, bool)
            and isinstance(total, int)
            and not isinstance(total, bool)
        ):
            weeks.append(
                WeeklyCommitCount(
                    week_start=week,
                    total=total,
                    days=_parse_daily_counts(item.get("days")),
                )
            )

    weeks.sort(key=lambda week: week.week_start)
    return weeks


# Reads the seven daily counts (Sun–Sat) from a commit-activity week. Only a clean
# 7-int array is accepted, so a malformed value yields no daily data (the week's
# total is still used) rather than a misaligned week.
def _parse_daily_counts(days: object) -> tuple[int, ...]:
    if (
        isinstance(days, list)
        and len(days) == 7
        and all(isinstance(day, int) and not isinstance(day, bool) for day in days)
    ):
        return tuple(days)
    return ()


# Sums GitHub's /stats/contributors JSON (a list of contributors, each with a weekly
# array of commit counts) into one full-history weekly series, oldest-first. Returns
# the weekly totals plus a truncation flag: GitHub returns at most the top 100
# contributors, so a list at that cap may be incomplete. Malformed entries are
# skipped; a non-list payload is a systemic format error.
def _parse_contributor_weeks_response(
    response: requests.Response,
) -> tuple[list[WeeklyCommitCount], bool]:
    try:
        raw_payload = response.json()
    except ValueError as exc:
        raise GitHubCommitActivityError(
            "GitHub returned an unreadable contributor-stats response.",
            502,
        ) from exc

    if not isinstance(raw_payload, list):
        raise GitHubCommitActivityError(
            "GitHub returned contributor stats in an unexpected format.",
            502,
        )

    totals_by_week: dict[int, int] = {}
    for contributor in raw_payload:
        if not isinstance(contributor, dict):
            continue
        contributor_weeks = contributor.get("weeks")
        if not isinstance(contributor_weeks, list):
            continue
        for week in contributor_weeks:
            if not isinstance(week, dict):
                continue
            week_start = week.get("w")
            commits = week.get("c")
            if (
                isinstance(week_start, int)
                and not isinstance(week_start, bool)
                and isinstance(commits, int)
                and not isinstance(commits, bool)
            ):
                totals_by_week[week_start] = totals_by_week.get(week_start, 0) + commits

    weeks = [
        WeeklyCommitCount(week_start=week_start, total=total)
        for week_start, total in sorted(totals_by_week.items())
    ]
    # GitHub caps this endpoint at the top 100 contributors; a full list may be
    # missing the long tail.
    truncated = len(raw_payload) >= 100
    return weeks, truncated


# Reads the repository's subject topics from the metadata payload. Best-effort:
# these enrich (not gate) the response, so a missing or malformed `topics` value
# yields an empty list rather than failing the whole metadata parse. Only non-empty
# string entries are kept.
def _parse_topics(payload: Mapping[str, object]) -> list[str]:
    raw_topics = payload.get("topics")
    if not isinstance(raw_topics, list):
        return []

    return [topic for topic in raw_topics if isinstance(topic, str) and topic]


# Reads the detected license's short identifier from the metadata payload's
# `license` object, preferring the SPDX id (e.g. "MIT") and falling back to its
# name. Best-effort like topics: "NOASSERTION" (GitHub's unrecognized-license
# marker), a missing object, or a malformed value all resolve to None.
def _parse_license(payload: Mapping[str, object]) -> str | None:
    license_object = payload.get("license")
    if not isinstance(license_object, dict):
        return None

    spdx_id = license_object.get("spdx_id")
    if isinstance(spdx_id, str) and spdx_id and spdx_id != "NOASSERTION":
        return spdx_id

    name = license_object.get("name")
    if isinstance(name, str) and name and name != "NOASSERTION":
        return name

    return None


# Converts GitHub's recursive tree JSON into normalized repo-file entries and
# summary counts for the frontend tree view.
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


# Converts GitHub's contents API payload into UTF-8 text after enforcing the
# caller's size budget and rejecting directories or unsupported encodings.
def _parse_text_file_response(
    response: requests.Response,
    expected_path: str,
    max_size_bytes: int,
) -> GitHubTextFileContent:
    try:
        raw_payload = response.json()
    except ValueError as exc:
        raise GitHubFileContentError(
            "GitHub returned an unreadable file-content response.",
            502,
        ) from exc

    if not isinstance(raw_payload, dict):
        raise GitHubFileContentError(
            "GitHub returned file content in an unexpected format.",
            502,
        )

    payload = cast(Mapping[str, object], raw_payload)
    if payload.get("type") != "file":
        raise GitHubFileContentError(
            "GitHub returned a non-file item for selected content.",
            502,
        )

    size = _required_content_int(payload, "size")
    if size > max_size_bytes:
        raise GitHubFileContentError(
            "Selected repository file is too large to fetch.",
            413,
        )

    if payload.get("encoding") != "base64":
        raise GitHubFileContentError(
            "GitHub returned selected file content with an unsupported encoding.",
            502,
        )

    raw_content = _required_content_string(payload, "content")

    try:
        decoded_bytes = base64.b64decode(raw_content, validate=False)
        content = decoded_bytes.decode("utf-8")
    except (ValueError, UnicodeDecodeError) as exc:
        raise GitHubFileContentError(
            "Selected repository file is not readable UTF-8 text.",
            415,
        ) from exc

    return GitHubTextFileContent(
        path=expected_path,
        content=content,
        size=size,
    )


# Extracts the core REST rate-limit bucket from GitHub's broader status payload.
# Other buckets exist, but current RepoFrame calls use the core REST limit.
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


# Normalizes one GitHub tree item while preserving size and API URL fields when
# GitHub provides them.
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


# Normalizes tree paths to slash-separated relative paths for frontend display.
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


# Translates GitHub tree item types into RepoFrame's smaller file taxonomy:
# files, directories, and submodules.
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


# Reads a required string field from a tree entry and converts malformed payloads
# into a tree-specific service error.
def _required_tree_string(payload: Mapping[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise GitHubTreeError(
            "GitHub returned file tree entries with missing required fields.",
            502,
        )

    return value


# Reads an optional string field from a tree entry, such as GitHub's API URL.
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


# Reads a required string field from GitHub's content payload.
def _required_content_string(payload: Mapping[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str):
        raise GitHubFileContentError(
            "GitHub returned file content with missing required fields.",
            502,
        )

    return value


# Reads a required string field from repository metadata and reports malformed
# responses as metadata-specific service errors.
def _required_string(payload: Mapping[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise GitHubMetadataError(
            "GitHub returned metadata with missing required fields.",
            502,
        )

    return value


# Reads an optional string metadata field while still rejecting unexpected types.
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


# Reads optional booleans from GitHub tree payloads, currently used for the
# truncated flag on large recursive trees.
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


# Reads required integer fields from repository metadata, such as stars/forks.
def _required_int(payload: Mapping[str, object], key: str) -> int:
    value = payload.get(key)
    if type(value) is not int:
        raise GitHubMetadataError(
            "GitHub returned metadata with invalid number fields.",
            502,
        )

    return value


# Reads required integer fields from GitHub's rate-limit payload.
def _required_rate_int(payload: Mapping[str, object], key: str) -> int:
    value = payload.get(key)
    if type(value) is not int:
        raise GitHubRateLimitError(
            "GitHub returned rate limit status with invalid number fields.",
            502,
        )

    return value


# Reads required integer fields from GitHub's content payload, such as file size.
def _required_content_int(payload: Mapping[str, object], key: str) -> int:
    value = payload.get(key)
    if type(value) is not int:
        raise GitHubFileContentError(
            "GitHub returned file content with invalid number fields.",
            502,
        )

    return value


# Reads optional integer fields from tree entries, such as file size.
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
