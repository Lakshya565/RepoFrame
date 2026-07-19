from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import PurePosixPath

from app.config import (
    MAX_CHARS_PER_FILE,
    MAX_FILE_SIZE_BYTES,
    VERIFY_MAX_ADDITIONAL_CHARS,
    VERIFY_MAX_ADDITIONAL_FILES,
)
from app.services import repo_access
from app.services.auth import AuthenticatedUser
from app.services.file_content_service import (
    CONFIG_FILE_NAMES,
    README_NAMES,
    RepoEvidenceCollection,
    SelectedFileEvidence,
    SOURCE_TYPE_CONFIG,
    SOURCE_TYPE_README,
    SOURCE_TYPE_SOURCE,
    collect_file_evidence,
)
from app.services.file_ranker import (
    RankedRepoFile,
    filter_repo_files,
    rank_important_files,
)
from app.services.github_service import (
    GitHubFileContentError,
    GitHubRepoFile,
    GitHubTextFileContent,
    fetch_repo_metadata,
    fetch_repo_text_file,
    fetch_repo_tree,
)
from app.services.repo_parser import parse_github_repo_url

# Request-scoped repository access for the claim-verification agent. The initial
# evidence remains deterministic, while this workspace gives the agent a bounded
# way to find and read additional known text files when a claim has a real gap.

RepositoryContentFetcher = Callable[..., GitHubTextFileContent]

_MAX_REPOSITORY_SEARCH_RESULTS = 30
_MAX_EVIDENCE_SEARCH_LINES = 40
_MAX_MATCHES_PER_FILE = 8
_MAX_SNIPPET_CHARS = 200
_RECOVERABLE_FILE_STATUSES = {404, 413, 415}
_SENSITIVE_FILE_NAMES = {
    ".npmrc",
    ".pypirc",
    "credentials",
    "credentials.json",
    "id_dsa",
    "id_ed25519",
    "id_rsa",
    "secrets.json",
}
_SENSITIVE_FILE_SUFFIXES = {".key", ".p12", ".pem", ".pfx"}


# One searchable file from GitHub's known tree. importance_score/reasons are
# populated when the deterministic ranker recognizes the file; zero-score paths
# remain searchable so useful docs outside the original top-ranked set are visible.
@dataclass(frozen=True)
class RepositoryIndexEntry:
    path: str
    size: int | None
    importance_score: int
    reasons: tuple[str, ...]


# Mutable only within one verification request. Its caches and counters are
# deliberately instance state, so private-repo access and fetched evidence can
# never leak between users or concurrent runs.
@dataclass
class EvidenceWorkspace:
    owner: str
    repo: str
    ref: str
    initial_evidence: RepoEvidenceCollection
    repository_index: list[RepositoryIndexEntry]
    tree_is_truncated: bool = False
    fetcher: RepositoryContentFetcher = field(
        default=fetch_repo_text_file,
        repr=False,
    )
    max_additional_files: int = VERIFY_MAX_ADDITIONAL_FILES
    max_additional_characters: int = VERIFY_MAX_ADDITIONAL_CHARS
    _additional_evidence: list[SelectedFileEvidence] = field(
        default_factory=list,
        init=False,
        repr=False,
    )
    _additional_characters: int = field(default=0, init=False, repr=False)
    _known_paths: dict[str, RepositoryIndexEntry] = field(
        default_factory=dict,
        init=False,
        repr=False,
    )
    _evidence_by_path: dict[str, SelectedFileEvidence] = field(
        default_factory=dict,
        init=False,
        repr=False,
    )

    # Builds case-insensitive lookup maps once, while retaining GitHub's canonical
    # path spelling in every tool result and evidence citation.
    def __post_init__(self) -> None:
        self._known_paths = {
            entry.path.casefold(): entry for entry in self.repository_index
        }
        self._evidence_by_path = {
            item.path.casefold(): item for item in self.initial_evidence.selected_files
        }

    # Lists files inspected beyond the deterministic initial evidence. The copy
    # prevents callers from mutating the workspace's accounting state.
    @property
    def additional_files_inspected(self) -> list[str]:
        return [item.path for item in self._additional_evidence]

    # Returns the initial and on-demand evidence as one collection so searches
    # naturally include everything the agent has learned so far.
    @property
    def accumulated_evidence(self) -> RepoEvidenceCollection:
        return RepoEvidenceCollection(
            selected_files=[
                *self.initial_evidence.selected_files,
                *self._additional_evidence,
            ],
            skipped_files=list(self.initial_evidence.skipped_files),
            total_characters=(
                self.initial_evidence.total_characters
                + self._additional_characters
            ),
        )

    # Searches known repository paths and ranker reasons without fetching content.
    # Results are bounded and ordered by query relevance, then deterministic file
    # importance, so a broad term cannot flood the next model turn.
    def search_repository(self, query: str) -> str:
        normalized = " ".join(query.strip().casefold().split())[:200]
        if not normalized:
            return "Provide a non-empty query to search the repository index."

        terms = [term for term in normalized.split() if len(term) >= 2]
        matches: list[tuple[int, RepositoryIndexEntry]] = []
        for entry in self.repository_index:
            haystack = " ".join((entry.path, *entry.reasons)).casefold()
            exact_bonus = 100 if normalized in haystack else 0
            term_hits = sum(1 for term in terms if term in haystack)
            if exact_bonus or term_hits:
                matches.append((exact_bonus + term_hits, entry))

        matches.sort(
            key=lambda item: (
                -item[0],
                -item[1].importance_score,
                item[1].path.casefold(),
            )
        )
        if not matches:
            return f"No repository paths matched '{query}'."

        lines: list[str] = []
        for _relevance, entry in matches[:_MAX_REPOSITORY_SEARCH_RESULTS]:
            reason = "; ".join(entry.reasons) or "Path matched the search query."
            size = f", {entry.size} bytes" if entry.size is not None else ""
            lines.append(
                f"- {entry.path} (importance {entry.importance_score}{size}): {reason}"
            )
        return "\n".join(lines)

    # Searches line content across all evidence accumulated so far. This is useful
    # after an on-demand read because the new file immediately becomes searchable.
    def search_evidence(self, query: str) -> str:
        needle = query.strip().casefold()
        if not needle:
            return "Provide a non-empty query to search the evidence."

        lines_out: list[str] = []
        for evidence_file in self.accumulated_evidence.selected_files:
            matches = 0
            for number, line in enumerate(
                evidence_file.content.splitlines(),
                start=1,
            ):
                if needle in line.casefold():
                    snippet = line.strip()[:_MAX_SNIPPET_CHARS]
                    lines_out.append(
                        f"{evidence_file.path}:L{number}: {snippet}"
                    )
                    matches += 1
                    if matches >= _MAX_MATCHES_PER_FILE:
                        break
                if len(lines_out) >= _MAX_EVIDENCE_SEARCH_LINES:
                    break
            if len(lines_out) >= _MAX_EVIDENCE_SEARCH_LINES:
                break

        if not lines_out:
            return f"No matches for '{query}' in the accumulated evidence."
        return "\n".join(lines_out)

    # Reads one exact allowlisted path. Initial/cached files are returned without
    # spending a GitHub request or another file-budget slot; a new read is fetched,
    # trimmed, cached, and counted against both on-demand limits.
    def read_repository_file(self, path: str) -> str:
        requested = path.strip()
        if not _is_safe_repository_path(requested):
            return "Provide an exact relative repository path without traversal."

        entry = self._known_paths.get(requested.casefold())
        if entry is None:
            return (
                f"'{requested}' is not an allowlisted path from the known repository "
                "tree. Use search_repository first."
            )

        cached = self._evidence_by_path.get(entry.path.casefold())
        if cached is not None:
            return _format_file_evidence(cached, cached=True)

        if len(self._additional_evidence) >= self.max_additional_files:
            return (
                "The additional-file limit has been reached. Use the evidence "
                "already gathered and produce the final verdict."
            )
        remaining = self.max_additional_characters - self._additional_characters
        if remaining <= 0:
            return (
                "The additional-evidence character limit has been reached. Use "
                "the evidence already gathered and produce the final verdict."
            )
        if entry.size is not None and entry.size > MAX_FILE_SIZE_BYTES:
            return (
                f"{entry.path} exceeds the {MAX_FILE_SIZE_BYTES}-byte text-file "
                "read limit."
            )

        try:
            fetched = self.fetcher(
                self.owner,
                self.repo,
                entry.path,
                self.ref,
                MAX_FILE_SIZE_BYTES,
            )
        except GitHubFileContentError as exc:
            if exc.status_code in _RECOVERABLE_FILE_STATUSES:
                return f"RepoFrame could not read {entry.path}: {exc}"
            raise

        limit = min(MAX_CHARS_PER_FILE, remaining)
        content = fetched.content[:limit]
        truncated = len(fetched.content) > len(content)
        evidence_file = SelectedFileEvidence(
            path=entry.path,
            source_type=_source_type(entry.path),
            reason="Read on demand by the Evidence Investigator.",
            content=content,
            original_size=fetched.size,
            truncated=truncated,
            char_count=len(content),
        )
        self._additional_evidence.append(evidence_file)
        self._additional_characters += len(content)
        self._evidence_by_path[entry.path.casefold()] = evidence_file
        return _format_file_evidence(evidence_file, cached=False)


# Validates a model-supplied path before even consulting the allowlist. Exact
# allowlist matching is the primary security boundary; these checks also make the
# tool's failure message clear for absolute, Windows-style, or traversal paths.
def _is_safe_repository_path(path: str) -> bool:
    if not path or "\\" in path or path.startswith("/"):
        return False
    pure_path = PurePosixPath(path)
    return not pure_path.is_absolute() and ".." not in pure_path.parts


# Labels on-demand files consistently with the deterministic evidence pipeline.
def _source_type(path: str) -> str:
    pure_path = PurePosixPath(path)
    name = pure_path.name.casefold()
    if name in README_NAMES:
        return SOURCE_TYPE_README
    if name in CONFIG_FILE_NAMES:
        return SOURCE_TYPE_CONFIG
    return SOURCE_TYPE_SOURCE


# Formats a read tool result with provenance and truncation state so the model can
# cite the canonical path and stay honest about partial file contents.
def _format_file_evidence(
    evidence_file: SelectedFileEvidence,
    *,
    cached: bool,
) -> str:
    state: list[str] = []
    if cached:
        state.append("cached")
    if evidence_file.truncated:
        state.append("truncated")
    suffix = f"; {', '.join(state)}" if state else ""
    return (
        f"{evidence_file.path} [{evidence_file.source_type}{suffix}]:\n"
        f"{evidence_file.content}"
    )


# Excludes filenames that commonly contain credentials before they become visible
# to either repository search or the model. Committed examples remain usable.
def _is_safe_index_file(repo_file: GitHubRepoFile) -> bool:
    name = PurePosixPath(repo_file.path).name.casefold()
    if name.startswith(".env") and name != ".env.example":
        return False
    if name in _SENSITIVE_FILE_NAMES:
        return False
    return not any(name.endswith(suffix) for suffix in _SENSITIVE_FILE_SUFFIXES)


# Rebuilds the deterministic initial bundle and a broader searchable path index.
# Repo access is applied in the current worker thread before every GitHub call, so
# on-demand reads inherit the same ephemeral private-repository installation token.
def build_evidence_workspace(
    repo_url: str,
    user: AuthenticatedUser | None,
) -> EvidenceWorkspace:
    parsed_repo = parse_github_repo_url(repo_url)
    repo_access.apply_repo_access(user, parsed_repo.owner, parsed_repo.repo)
    metadata = fetch_repo_metadata(parsed_repo.owner, parsed_repo.repo)
    tree = fetch_repo_tree(
        parsed_repo.owner,
        parsed_repo.repo,
        metadata.default_branch,
    )

    initial_ranked = rank_important_files(tree.files)
    initial_evidence = collect_file_evidence(
        parsed_repo.owner,
        parsed_repo.repo,
        metadata.default_branch,
        initial_ranked,
    )
    repository_index = _build_repository_index(tree.files)
    return EvidenceWorkspace(
        owner=parsed_repo.owner,
        repo=parsed_repo.repo,
        ref=metadata.default_branch,
        initial_evidence=initial_evidence,
        repository_index=repository_index,
        tree_is_truncated=tree.is_truncated,
    )


# Combines the ranker's scores with every safe path from the known GitHub tree.
# Ranking all useful files (not only the normal top 20) gives searches meaningful
# ordering without changing which files enter the initial deterministic bundle.
def _build_repository_index(
    files: list[GitHubRepoFile],
) -> list[RepositoryIndexEntry]:
    ranked_files: list[RankedRepoFile] = rank_important_files(
        files,
        limit=max(len(files), 1),
    )
    ranked_by_path = {item.path: item for item in ranked_files}
    entries: list[RepositoryIndexEntry] = []
    for repo_file in filter_repo_files(files):
        if not _is_safe_index_file(repo_file):
            continue
        ranked = ranked_by_path.get(repo_file.path)
        entries.append(
            RepositoryIndexEntry(
                path=repo_file.path,
                size=repo_file.size,
                importance_score=ranked.importance_score if ranked else 0,
                reasons=tuple(ranked.reasons) if ranked else (),
            )
        )
    return sorted(
        entries,
        key=lambda item: (-item.importance_score, item.path.casefold()),
    )
