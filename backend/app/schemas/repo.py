from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictStr


# Shared request body for endpoints that start from a GitHub repo URL. Forbids
# extra fields so callers cannot silently send unsupported analysis options.
class RepoParseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    repo_url: StrictStr = Field(alias="repoUrl", min_length=1, max_length=2048)


# Normalized repository identity returned after URL parsing succeeds. Aliases
# keep Python names idiomatic while matching frontend camelCase JSON.
class RepoParseResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    owner: str
    repo: str
    normalized_url: str = Field(alias="normalizedUrl")


# GitHub repository facts displayed in the frontend summary card. This response
# intentionally stays small and excludes file contents.
class RepoMetadataResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    owner: str
    repo: str
    normalized_url: str = Field(alias="normalizedUrl")
    name: str
    description: str | None
    default_branch: str = Field(alias="defaultBranch")
    stars: int
    forks: int
    language: str | None
    html_url: str = Field(alias="htmlUrl")
    # Maintainer-applied subject tags (may be empty) and the detected license's
    # short id (e.g. "MIT"), or null when unlicensed/unrecognized.
    topics: list[str] = Field(default_factory=list)
    license: str | None = None


# The time window for the commit-activity timeline: the last month (daily points),
# the last year (weekly), or the full history (adaptive grain).
CommitActivityRange = Literal["month", "year", "all"]


# Request body for commit activity: the repo URL plus which time range to chart.
class CommitActivityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    repo_url: StrictStr = Field(alias="repoUrl", min_length=1, max_length=2048)
    range: CommitActivityRange = "year"


# One bar in the commit-activity timeline: the UTC ISO date the bucket starts on
# and the commits summed into it.
class CommitTimelineBucket(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    period_start: str = Field(alias="periodStart")
    commit_count: int = Field(alias="commitCount")


# The commit-activity timeline for the Analysis-page graph: the bars plus the chosen
# grain's label, the total commits across the window, the window's start/end dates
# (null when the repository has no commit activity), the range that was charted, and
# whether the "all time" data may be truncated (GitHub caps contributor stats at the
# top 100 contributors, so a very large repo can undercount).
class CommitActivityResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    owner: str
    repo: str
    normalized_url: str = Field(alias="normalizedUrl")
    range: CommitActivityRange
    interval_label: str = Field(alias="intervalLabel")
    total_commits: int = Field(alias="totalCommits")
    range_start: str | None = Field(default=None, alias="rangeStart")
    range_end: str | None = Field(default=None, alias="rangeEnd")
    contributors_truncated: bool = Field(
        default=False, alias="contributorsTruncated"
    )
    buckets: list[CommitTimelineBucket]


# One normalized file-tree entry returned from GitHub's tree API. RepoFrame uses
# a smaller type set than GitHub so the frontend can render consistently.
class RepoFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str
    type: Literal["file", "directory", "submodule"]
    size: int | None = None
    url: str | None = None


# Full file-tree payload for the analysis page tree view. Counts are included so
# the frontend does not need to recalculate summary stats.
class RepoTreeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    owner: str
    repo: str
    normalized_url: str = Field(alias="normalizedUrl")
    default_branch: str = Field(alias="defaultBranch")
    files: list[RepoFile]
    total_files: int = Field(alias="totalFiles")
    total_directories: int = Field(alias="totalDirectories")
    is_truncated: bool = Field(alias="isTruncated")


# One important file selected by the deterministic Phase 5 ranking service. The
# response keeps only the fields needed for review and later content fetching.
class RankedRepoFile(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    path: str
    size: int | None = None
    importance_score: int = Field(alias="importanceScore")
    reasons: list[str]


# File ranking payload for the analysis page. Counts describe the filtering
# funnel from all tree entries to rankable files to the returned top set.
class RepoFileRankingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    owner: str
    repo: str
    normalized_url: str = Field(alias="normalizedUrl")
    default_branch: str = Field(alias="defaultBranch")
    ranked_files: list[RankedRepoFile] = Field(alias="rankedFiles")
    total_files: int = Field(alias="totalFiles")
    rankable_files: int = Field(alias="rankableFiles")
    returned_files: int = Field(alias="returnedFiles")


# One evidence point behind a detected technology. Paths are included when the
# source is one of the important files selected by the backend.
class TechStackEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: str
    detail: str
    path: str | None = None


# One detected technology with a confidence score and auditable evidence.
class DetectedTechnology(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    category: str
    confidence: float
    evidence: list[TechStackEvidence]


# Phase 6 stack-detection payload for the analysis page. The evidence file count
# shows how many ranked README or manifest files were read for detection.
class TechStackResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    owner: str
    repo: str
    normalized_url: str = Field(alias="normalizedUrl")
    default_branch: str = Field(alias="defaultBranch")
    technologies: list[DetectedTechnology]
    evidence_files_read: int = Field(alias="evidenceFilesRead")


# One fetched evidence file returned by the Phase 7 bounded content pipeline.
# Keeps auditability: where the file came from, why it was chosen, its original
# size, and whether the stored excerpt was trimmed to fit the limits.
class SelectedFileEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    path: str
    source_type: Literal["readme", "config", "source"] = Field(alias="sourceType")
    reason: str
    content: str
    original_size: int | None = Field(default=None, alias="originalSize")
    truncated: bool
    char_count: int = Field(alias="charCount")


# One file RepoFrame chose not to include, with a plain-language skip reason such
# as oversized, missing, non-text, or beyond the selection/character limits.
class SkippedFileEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    path: str
    source_type: Literal["readme", "config", "source"] = Field(alias="sourceType")
    reason: str


# Phase 7 bounded evidence payload for the analysis page. Counts describe the
# selection funnel and the running character total enforced across all excerpts.
class RepoFileContentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    owner: str
    repo: str
    normalized_url: str = Field(alias="normalizedUrl")
    default_branch: str = Field(alias="defaultBranch")
    selected_files: list[SelectedFileEvidence] = Field(alias="selectedFiles")
    skipped_files: list[SkippedFileEvidence] = Field(alias="skippedFiles")
    selected_count: int = Field(alias="selectedCount")
    skipped_count: int = Field(alias="skippedCount")
    total_characters: int = Field(alias="totalCharacters")


# Current GitHub core REST API budget for the backend token or IP bucket. The
# response reveals token presence, never the token value.
class GitHubRateLimitResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    limit: int
    used: int
    remaining: int
    reset: int
    reset_at: str = Field(alias="resetAt")
    is_authenticated: bool = Field(alias="isAuthenticated")
