import logging
import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from concurrent.futures import Future
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Generic, Literal, TypeVar

import requests

from app.schemas.repo import (
    CommitActivityRanges,
    CommitActivityResponse,
    CommitActivityTimeline,
    CommitTimelineBucket,
    DetectedTechnology as DetectedTechnologyResponse,
    RankedRepoFile as RankedRepoFileResponse,
    RepoFile,
    RepoFileRankingResponse,
    RepoMetadataResponse,
    RepoTreeResponse,
    TechStackEvidence as TechStackEvidenceResponse,
    TechStackResponse,
)
from app.services import github_service, metrics_store, repo_access
from app.services.auth import AuthenticatedUser
from app.services.commit_activity import build_commit_timeline, build_daily_timeline
from app.services.file_ranker import (
    RankedRepoFile,
    filter_repo_files,
    rank_important_files,
)
from app.services.github_service import (
    GitHubRepoMetadata,
    GitHubRepoTree,
    fetch_commit_activity,
    fetch_repo_languages,
    fetch_repo_metadata,
    fetch_repo_text_file,
    fetch_repo_tree,
)
from app.services.repo_parser import ParsedGitHubRepo, parse_github_repo_url
from app.services.tech_stack_detector import (
    DetectedTechnology,
    collect_stack_evidence,
    detect_tech_stack,
)

logger = logging.getLogger(__name__)

FRESH_SECONDS = 300
STALE_SECONDS = 1800
CORE_CACHE_ENTRIES = 32
COMMIT_CACHE_ENTRIES = 128

CacheStatus = Literal["hit", "stale", "miss", "shared"]
StageCallback = Callable[[str, object], None]
T = TypeVar("T")


@dataclass(frozen=True)
class CacheResult(Generic[T]):
    value: T
    status: CacheStatus


@dataclass(frozen=True)
class _CacheEntry(Generic[T]):
    value: T
    stored_at: float


class _SingleFlightCache(Generic[T]):
    """Small process-local LRU with fresh, stale-revalidate, and single-flight reads."""

    def __init__(self, max_entries: int) -> None:
        self._max_entries = max_entries
        self._entries: OrderedDict[str, _CacheEntry[T]] = OrderedDict()
        self._inflight: dict[str, Future[T]] = {}
        self._lock = threading.Lock()

    def get_or_build(
        self,
        key: str,
        builder: Callable[[], T],
        background_builder: Callable[[], T] | None = None,
    ) -> CacheResult[T]:
        now = time.monotonic()
        with self._lock:
            entry = self._entries.get(key)
            if entry is not None:
                age = now - entry.stored_at
                self._entries.move_to_end(key)
                if age < FRESH_SECONDS:
                    return CacheResult(entry.value, "hit")
                if age < STALE_SECONDS:
                    if key not in self._inflight:
                        future: Future[T] = Future()
                        self._inflight[key] = future
                        refresh = background_builder or builder
                        threading.Thread(
                            target=self._finish_build,
                            args=(key, future, refresh),
                            daemon=True,
                        ).start()
                    return CacheResult(entry.value, "stale")

            future = self._inflight.get(key)
            owns_build = future is None
            if future is None:
                future = Future()
                self._inflight[key] = future

        if not owns_build:
            return CacheResult(future.result(), "shared")

        self._finish_build(key, future, builder)
        return CacheResult(future.result(), "miss")

    def _finish_build(
        self,
        key: str,
        future: Future[T],
        builder: Callable[[], T],
    ) -> None:
        try:
            value = builder()
        except BaseException as exc:
            future.set_exception(exc)
        else:
            with self._lock:
                self._entries[key] = _CacheEntry(value, time.monotonic())
                self._entries.move_to_end(key)
                while len(self._entries) > self._max_entries:
                    self._entries.popitem(last=False)
            future.set_result(value)
        finally:
            with self._lock:
                if self._inflight.get(key) is future:
                    del self._inflight[key]

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()
            self._inflight.clear()


@dataclass(frozen=True)
class RepoAnalysisSnapshot:
    parsed_repo: ParsedGitHubRepo
    metadata: GitHubRepoMetadata
    tree: GitHubRepoTree
    ranked_files: list[RankedRepoFile]
    technologies: list[DetectedTechnology]
    evidence_files_read: int
    generated_at: str

    def metadata_response(self) -> RepoMetadataResponse:
        return RepoMetadataResponse(
            owner=self.parsed_repo.owner,
            repo=self.parsed_repo.repo,
            normalized_url=self.parsed_repo.normalized_url,
            name=self.metadata.name,
            description=self.metadata.description,
            default_branch=self.metadata.default_branch,
            stars=self.metadata.stars,
            forks=self.metadata.forks,
            language=self.metadata.language,
            html_url=self.metadata.html_url,
            topics=self.metadata.topics,
            license=self.metadata.license,
        )

    def tree_response(self) -> RepoTreeResponse:
        return RepoTreeResponse(
            owner=self.parsed_repo.owner,
            repo=self.parsed_repo.repo,
            normalized_url=self.parsed_repo.normalized_url,
            default_branch=self.metadata.default_branch,
            files=[
                RepoFile(path=item.path, type=item.type, size=item.size, url=item.url)
                for item in self.tree.files
            ],
            total_files=self.tree.total_files,
            total_directories=self.tree.total_directories,
            is_truncated=self.tree.is_truncated,
        )

    def ranking_response(self) -> RepoFileRankingResponse:
        return RepoFileRankingResponse(
            owner=self.parsed_repo.owner,
            repo=self.parsed_repo.repo,
            normalized_url=self.parsed_repo.normalized_url,
            default_branch=self.metadata.default_branch,
            ranked_files=[
                RankedRepoFileResponse(
                    path=item.path,
                    size=item.size,
                    importance_score=item.importance_score,
                    reasons=item.reasons,
                )
                for item in self.ranked_files
            ],
            total_files=self.tree.total_files,
            rankable_files=len(filter_repo_files(self.tree.files)),
            returned_files=len(self.ranked_files),
        )

    def tech_stack_response(self) -> TechStackResponse:
        return TechStackResponse(
            owner=self.parsed_repo.owner,
            repo=self.parsed_repo.repo,
            normalized_url=self.parsed_repo.normalized_url,
            default_branch=self.metadata.default_branch,
            technologies=[
                DetectedTechnologyResponse(
                    name=technology.name,
                    category=technology.category,
                    confidence=technology.confidence,
                    evidence=[
                        TechStackEvidenceResponse(
                            source=evidence.source,
                            detail=evidence.detail,
                            path=evidence.path,
                        )
                        for evidence in technology.evidence
                    ],
                )
                for technology in self.technologies
            ],
            evidence_files_read=self.evidence_files_read,
        )


_core_cache: _SingleFlightCache[RepoAnalysisSnapshot] = _SingleFlightCache(
    CORE_CACHE_ENTRIES
)
_commit_cache: _SingleFlightCache[CommitActivityResponse] = _SingleFlightCache(
    COMMIT_CACHE_ENTRIES
)


def _access_and_key(
    parsed_repo: ParsedGitHubRepo,
    user: AuthenticatedUser | None,
    category: str,
) -> tuple[repo_access.RepoAccess, str]:
    with metrics_store.timed("analysis_access"):
        access = repo_access.resolve_repo_access(
            user, parsed_repo.owner, parsed_repo.repo
        )
    github_service.set_installation_token(access.token)
    if access.installation_id is not None and user is not None:
        scope = f"private:{user.user_id}:{access.installation_id}"
    else:
        scope = "public"
    return access, (
        f"{category}:{scope}:{parsed_repo.owner.lower()}/{parsed_repo.repo.lower()}"
    )


def _emit_snapshot(snapshot: RepoAnalysisSnapshot, callback: StageCallback) -> None:
    callback("metadata", snapshot.metadata_response())
    callback(
        "structure",
        {
            "tree": snapshot.tree_response(),
            "rankedFiles": snapshot.ranking_response(),
        },
    )
    callback("techStack", snapshot.tech_stack_response())


def _build_analysis(
    parsed_repo: ParsedGitHubRepo,
    token: str | None,
    callback: StageCallback | None,
) -> RepoAnalysisSnapshot:
    github_service.set_installation_token(token)
    session = requests.Session()
    try:
        with metrics_store.timed("analysis_metadata"):
            metadata = fetch_repo_metadata(
                parsed_repo.owner, parsed_repo.repo, session=session
            )

        partial = RepoAnalysisSnapshot(
            parsed_repo=parsed_repo,
            metadata=metadata,
            tree=GitHubRepoTree([], 0, 0, False),
            ranked_files=[],
            technologies=[],
            evidence_files_read=0,
            generated_at="",
        )
        if callback:
            callback("metadata", partial.metadata_response())

        with metrics_store.timed("analysis_tree"):
            tree = fetch_repo_tree(
                parsed_repo.owner,
                parsed_repo.repo,
                metadata.default_branch,
                session=session,
            )
        with metrics_store.timed("analysis_ranking"):
            ranked_files = rank_important_files(tree.files)

        structural = RepoAnalysisSnapshot(
            parsed_repo=parsed_repo,
            metadata=metadata,
            tree=tree,
            ranked_files=ranked_files,
            technologies=[],
            evidence_files_read=0,
            generated_at="",
        )
        if callback:
            callback(
                "structure",
                {
                    "tree": structural.tree_response(),
                    "rankedFiles": structural.ranking_response(),
                },
            )

        def fetch_text(*args):
            return fetch_repo_text_file(*args, session=session)

        with metrics_store.timed("analysis_stack_files"):
            stack_files = collect_stack_evidence(
                parsed_repo.owner,
                parsed_repo.repo,
                metadata.default_branch,
                ranked_files,
                fetcher=fetch_text,
            )
        with metrics_store.timed("analysis_languages"):
            languages = fetch_repo_languages(
                parsed_repo.owner, parsed_repo.repo, session=session
            )
        with metrics_store.timed("analysis_stack_detection"):
            technologies = detect_tech_stack(
                metadata, ranked_files, stack_files, languages
            )

        snapshot = RepoAnalysisSnapshot(
            parsed_repo=parsed_repo,
            metadata=metadata,
            tree=tree,
            ranked_files=ranked_files,
            technologies=technologies,
            evidence_files_read=len(stack_files),
            generated_at=datetime.now(timezone.utc).isoformat(),
        )
        if callback:
            callback("techStack", snapshot.tech_stack_response())
        return snapshot
    finally:
        session.close()
        github_service.set_installation_token(None)


def get_repo_analysis(
    repo_url: str,
    user: AuthenticatedUser | None,
    callback: StageCallback | None = None,
) -> CacheResult[RepoAnalysisSnapshot]:
    parsed_repo = parse_github_repo_url(repo_url)
    access, key = _access_and_key(parsed_repo, user, "core")
    emitted = False

    def emit(stage: str, payload: object) -> None:
        nonlocal emitted
        emitted = True
        if callback:
            callback(stage, payload)

    result = _core_cache.get_or_build(
        key,
        lambda: _build_analysis(parsed_repo, access.token, emit if callback else None),
        background_builder=lambda: _build_analysis(parsed_repo, access.token, None),
    )
    # Builders clear their thread-local token in a finally block. Restore the
    # caller's resolved access so a generation request can immediately collect
    # additional evidence from the same private repository.
    github_service.set_installation_token(access.token)
    metrics_store.increment(**{f"analysis_cache_{result.status}": 1})
    if callback and not emitted:
        _emit_snapshot(result.value, callback)
    logger.info(
        "repository analysis owner=%s repo=%s cache=%s",
        parsed_repo.owner,
        parsed_repo.repo,
        result.status,
    )
    return result


def _build_commit_response(
    parsed_repo: ParsedGitHubRepo,
    token: str | None,
) -> CommitActivityResponse:
    github_service.set_installation_token(token)
    session = requests.Session()
    try:
        with metrics_store.timed("analysis_commit_stats"):
            weeks = fetch_commit_activity(
                parsed_repo.owner, parsed_repo.repo, session=session
            )
        month = build_daily_timeline(weeks)
        year = build_commit_timeline(weeks)

        def timeline(value) -> CommitActivityTimeline:
            return CommitActivityTimeline(
                interval_label=value.interval_label,
                total_commits=value.total_commits,
                range_start=value.range_start,
                range_end=value.range_end,
                buckets=[
                    CommitTimelineBucket(
                        period_start=bucket.period_start,
                        commit_count=bucket.commit_count,
                    )
                    for bucket in value.buckets
                ],
            )

        return CommitActivityResponse(
            owner=parsed_repo.owner,
            repo=parsed_repo.repo,
            normalized_url=parsed_repo.normalized_url,
            ranges=CommitActivityRanges(
                month=timeline(month),
                year=timeline(year),
            ),
        )
    finally:
        session.close()
        github_service.set_installation_token(None)


def get_commit_activity(
    repo_url: str,
    user: AuthenticatedUser | None,
) -> CacheResult[CommitActivityResponse]:
    parsed_repo = parse_github_repo_url(repo_url)
    access, key = _access_and_key(parsed_repo, user, "commit")
    result = _commit_cache.get_or_build(
        key,
        lambda: _build_commit_response(parsed_repo, access.token),
        background_builder=lambda: _build_commit_response(parsed_repo, access.token),
    )
    metrics_store.increment(**{f"commit_cache_{result.status}": 1})
    return result


def reset_analysis_caches() -> None:
    """Clear process-local analysis data for deterministic tests and deployments."""
    _core_cache.clear()
    _commit_cache.clear()
    github_service.set_installation_token(None)
