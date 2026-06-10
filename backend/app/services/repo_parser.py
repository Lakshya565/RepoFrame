import re
from dataclasses import dataclass
from urllib.parse import urlparse

GITHUB_HOST = "github.com"
GIT_SUFFIX = ".git"
OWNER_PATTERN = re.compile(r"^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$")
REPO_PATTERN = re.compile(r"^[a-zA-Z0-9._-]+$")
MAX_REPO_URL_LENGTH = 2048
INVALID_REPO_URL_MESSAGE = (
    "RepoFrame could not parse that repository URL. Please enter a GitHub "
    "repository URL in the format https://github.com/{owner}/{repo} or "
    "https://github.com/{owner}/{repo}.git and try again."
)


class RepoUrlParseError(ValueError):
    pass


@dataclass(frozen=True)
class ParsedGitHubRepo:
    owner: str
    repo: str
    normalized_url: str


def parse_github_repo_url(repo_url: str) -> ParsedGitHubRepo:
    cleaned_url = repo_url.strip()

    if not cleaned_url or len(cleaned_url) > MAX_REPO_URL_LENGTH:
        raise RepoUrlParseError(INVALID_REPO_URL_MESSAGE)

    if _contains_unsafe_url_characters(cleaned_url):
        raise RepoUrlParseError(INVALID_REPO_URL_MESSAGE)

    parsed_url = urlparse(cleaned_url)
    path_parts = parsed_url.path.split("/")

    if (
        parsed_url.scheme.lower() != "https"
        or parsed_url.hostname is None
        or parsed_url.hostname.lower() != GITHUB_HOST
        or parsed_url.netloc.lower() != GITHUB_HOST
        or parsed_url.params
        or parsed_url.query
        or parsed_url.fragment
        or len(path_parts) != 3
        or path_parts[0] != ""
    ):
        raise RepoUrlParseError(INVALID_REPO_URL_MESSAGE)

    owner, raw_repo = path_parts[1], path_parts[2]
    repo = _strip_git_suffix(raw_repo)

    if not _is_valid_owner(owner) or not _is_valid_repo(repo):
        raise RepoUrlParseError(INVALID_REPO_URL_MESSAGE)

    return ParsedGitHubRepo(
        owner=owner,
        repo=repo,
        normalized_url=f"https://{GITHUB_HOST}/{owner}/{repo}",
    )


def _is_valid_owner(owner: str) -> bool:
    return bool(OWNER_PATTERN.fullmatch(owner))


def _is_valid_repo(repo: str) -> bool:
    return bool(REPO_PATTERN.fullmatch(repo))


def _strip_git_suffix(repo: str) -> str:
    if not repo.lower().endswith(GIT_SUFFIX):
        return repo

    return repo[: -len(GIT_SUFFIX)]


def _contains_unsafe_url_characters(repo_url: str) -> bool:
    return any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in repo_url)
