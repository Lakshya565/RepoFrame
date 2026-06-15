from collections.abc import Callable
from dataclasses import dataclass
from pathlib import PurePosixPath

from app.config import (
    MAX_CHARS_PER_FILE,
    MAX_FILE_SIZE_BYTES,
    MAX_SELECTED_FILES,
    MAX_TOTAL_PROMPT_CHARS,
)
from app.services.file_ranker import RankedRepoFile
from app.services.github_service import (
    GitHubFileContentError,
    GitHubTextFileContent,
    fetch_repo_text_file,
)

# Convenience alias so internal logic reads naturally against what the limit
# means in this service (total characters across all fetched evidence files).
# The canonical name MAX_TOTAL_PROMPT_CHARS lives in config.py because Phase 10
# will also enforce it before sending evidence to OpenAI.
MAX_TOTAL_CHARS = MAX_TOTAL_PROMPT_CHARS

README_NAMES = {"readme", "readme.md", "readme.mdx", "readme.txt"}

# Dependency and configuration manifests worth fetching for setup/tooling
# evidence. Kept aligned with the ranker's config detection but scoped to the
# files whose contents (not just presence) are useful as evidence.
CONFIG_FILE_NAMES = {
    ".env.example",
    "compose.yaml",
    "docker-compose.yml",
    "dockerfile",
    "eslint.config.js",
    "eslint.config.mjs",
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "tailwind.config.js",
    "tailwind.config.ts",
    "tsconfig.json",
    "vite.config.js",
    "vite.config.ts",
}

# Source extensions that can carry implementation evidence. Mirrors the ranker's
# source set so Phase 7 fetches the same kind of files Phase 5 prioritized.
SOURCE_EXTENSIONS = {
    ".c",
    ".cpp",
    ".cs",
    ".css",
    ".go",
    ".html",
    ".java",
    ".js",
    ".jsx",
    ".kt",
    ".mjs",
    ".php",
    ".py",
    ".rb",
    ".rs",
    ".scss",
    ".sql",
    ".swift",
    ".ts",
    ".tsx",
}

# Source-type labels and the order in which categories claim the file and
# character budgets: README first, then config/manifests, then source files.
SOURCE_TYPE_README = "readme"
SOURCE_TYPE_CONFIG = "config"
SOURCE_TYPE_SOURCE = "source"
_CATEGORY_PRIORITY = (SOURCE_TYPE_README, SOURCE_TYPE_CONFIG, SOURCE_TYPE_SOURCE)

# Human-readable selection reasons shown alongside each evidence file.
_SELECTION_REASONS = {
    SOURCE_TYPE_README: "README selected as primary project context.",
    SOURCE_TYPE_CONFIG: "Dependency or configuration file selected for setup and tooling evidence.",
    SOURCE_TYPE_SOURCE: "Top-ranked source file selected for implementation evidence.",
}

# Maps GitHub content-fetch failures we can tolerate into user-facing skip
# reasons. Other statuses (rate limits, auth, upstream errors) are systemic and
# re-raised so the route can surface a real error instead of a silent skip.
_SKIP_REASONS = {
    404: "File was not found on the default branch.",
    413: "File exceeds the per-file size limit.",
    415: "File is not readable UTF-8 text.",
}

# Type of the content fetcher so tests can inject a fake without hitting GitHub.
ContentFetcher = Callable[..., GitHubTextFileContent]


# One ranked file chosen for fetching, tagged with its evidence category before
# any network call happens.
@dataclass(frozen=True)
class EvidenceCandidate:
    path: str
    size: int | None
    source_type: str


# One successfully fetched evidence file. Keeps enough detail for auditing later
# phases: where it came from, why it was chosen, its original size, and whether
# the stored excerpt was trimmed to fit the limits.
@dataclass(frozen=True)
class SelectedFileEvidence:
    path: str
    source_type: str
    reason: str
    content: str
    original_size: int | None
    truncated: bool
    char_count: int


# One file RepoFrame wanted but did not include, with a plain-language reason.
@dataclass(frozen=True)
class SkippedFile:
    path: str
    source_type: str
    reason: str


# The bounded evidence bundle returned to the route: included excerpts, skipped
# files with reasons, and the running total of characters across all excerpts.
@dataclass(frozen=True)
class RepoEvidenceCollection:
    selected_files: list[SelectedFileEvidence]
    skipped_files: list[SkippedFile]
    total_characters: int


# Classifies one ranked file into an evidence category, or None when the file is
# not a README, config manifest, or recognized source file.
def _classify_file(path: str) -> str | None:
    pure_path = PurePosixPath(path)
    name = pure_path.name.lower()
    suffix = pure_path.suffix.lower()

    if name in README_NAMES:
        return SOURCE_TYPE_README

    if name in CONFIG_FILE_NAMES:
        return SOURCE_TYPE_CONFIG

    if suffix in SOURCE_EXTENSIONS:
        return SOURCE_TYPE_SOURCE

    return None


# Chooses which ranked files to fetch. Files are grouped by category and emitted
# in README -> config -> source order so the most useful context claims the file
# budget first. Returns the capped selection plus the overflow that did not fit,
# so the route can report the overflow as skipped instead of dropping it silently.
def select_evidence_candidates(
    ranked_files: list[RankedRepoFile],
    limit: int = MAX_SELECTED_FILES,
) -> tuple[list[EvidenceCandidate], list[EvidenceCandidate]]:
    by_category: dict[str, list[EvidenceCandidate]] = {
        category: [] for category in _CATEGORY_PRIORITY
    }
    for file in ranked_files:
        source_type = _classify_file(file.path)
        if source_type is not None:
            by_category[source_type].append(
                EvidenceCandidate(
                    path=file.path,
                    size=file.size,
                    source_type=source_type,
                )
            )

    ordered = [
        candidate
        for category in _CATEGORY_PRIORITY
        for candidate in by_category[category]
    ]

    return ordered[:limit], ordered[limit:]


# Fetches the selected ranked files within all three limits and records why any
# file was skipped or trimmed. Missing README files are treated as a normal
# skipped state, not a failure. Systemic GitHub errors (rate limits, auth) are
# raised so the route can return a clear error rather than hiding them as skips.
def collect_file_evidence(
    owner: str,
    repo: str,
    ref: str,
    ranked_files: list[RankedRepoFile],
    fetcher: ContentFetcher = fetch_repo_text_file,
) -> RepoEvidenceCollection:
    selected_candidates, overflow_candidates = select_evidence_candidates(ranked_files)

    selected_files: list[SelectedFileEvidence] = []
    skipped_files: list[SkippedFile] = []
    total_characters = 0

    for candidate in selected_candidates:
        # Skip oversized files up front so we never download content we will not
        # keep; GitHub also rejects these, but the size hint avoids the round trip.
        if candidate.size is not None and candidate.size > MAX_FILE_SIZE_BYTES:
            skipped_files.append(
                SkippedFile(
                    path=candidate.path,
                    source_type=candidate.source_type,
                    reason=_SKIP_REASONS[413],
                )
            )
            continue

        try:
            fetched = fetcher(owner, repo, candidate.path, ref, MAX_FILE_SIZE_BYTES)
        except GitHubFileContentError as exc:
            if exc.status_code not in _SKIP_REASONS:
                raise
            skipped_files.append(
                SkippedFile(
                    path=candidate.path,
                    source_type=candidate.source_type,
                    reason=_SKIP_REASONS[exc.status_code],
                )
            )
            continue

        remaining_budget = MAX_TOTAL_CHARS - total_characters
        if remaining_budget <= 0:
            skipped_files.append(
                SkippedFile(
                    path=candidate.path,
                    source_type=candidate.source_type,
                    reason="Total content limit reached before this file.",
                )
            )
            continue

        content, truncated = _trim_content(fetched.content, remaining_budget)
        total_characters += len(content)
        selected_files.append(
            SelectedFileEvidence(
                path=candidate.path,
                source_type=candidate.source_type,
                reason=_SELECTION_REASONS[candidate.source_type],
                content=content,
                original_size=fetched.size,
                truncated=truncated,
                char_count=len(content),
            )
        )

    # Eligible files that did not fit under the max-file cap are reported so the
    # frontend can show the full selection funnel rather than dropping them.
    for candidate in overflow_candidates:
        skipped_files.append(
            SkippedFile(
                path=candidate.path,
                source_type=candidate.source_type,
                reason="Maximum number of selected files reached.",
            )
        )

    return RepoEvidenceCollection(
        selected_files=selected_files,
        skipped_files=skipped_files,
        total_characters=total_characters,
    )


# Trims decoded content to the smaller of the per-file cap and the remaining
# total budget, flagging when the excerpt was shortened so callers stay honest
# about partial evidence.
def _trim_content(content: str, remaining_budget: int) -> tuple[str, bool]:
    limit = min(MAX_CHARS_PER_FILE, remaining_budget)
    if len(content) <= limit:
        return content, False

    return content[:limit], True
