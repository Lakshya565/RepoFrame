from fastapi import APIRouter, Depends, HTTPException

from app.schemas.repo import (
    CommitActivityRequest,
    CommitActivityResponse,
    CommitTimelineBucket,
    DetectedTechnology,
    RankedRepoFile,
    RepoFileContentResponse,
    RepoFileRankingResponse,
    RepoFile,
    RepoMetadataResponse,
    RepoParseRequest,
    RepoParseResponse,
    RepoTreeResponse,
    SelectedFileEvidence,
    SkippedFileEvidence,
    TechStackEvidence,
    TechStackResponse,
)
from app.services.commit_activity import (
    MIN_ALL_RANGE_WEEKS,
    build_commit_timeline,
    build_daily_timeline,
)
from app.services.file_content_service import collect_file_evidence
from app.services.file_ranker import filter_repo_files, rank_important_files
from app.services.github_service import (
    GitHubCommitActivityError,
    GitHubFileContentError,
    GitHubMetadataError,
    GitHubTreeError,
    fetch_commit_activity,
    fetch_contributor_weeks,
    fetch_repo_languages,
    fetch_repo_metadata,
    fetch_repo_tree,
)
from app.services import repo_access
from app.services.auth import AuthenticatedUser, require_user_or_public_demo
from app.services.repo_parser import RepoUrlParseError, parse_github_repo_url
from app.services.tech_stack_detector import (
    collect_stack_evidence,
    detect_tech_stack,
)

# Login gate (Phase 15.3): when Supabase is configured, the repo-analysis
# endpoints require a verified user; when unconfigured (local dev), they stay open.
# Applied at the router level so the gate can't be forgotten on a new route. The one
# exception is the public demo repo (config.DEMO_REPO_*): the signed-out product demo
# loads its REAL analysis data live, so require_user_or_public_demo lets anonymous
# reads of that single repo through while every other repo still requires login.
router = APIRouter(
    prefix="/api/repo",
    tags=["repo"],
    dependencies=[Depends(require_user_or_public_demo)],
)


# Returns normalized owner/repo data for a GitHub URL before analysis starts.
# The route stays thin and delegates parsing rules to the repo parser service.
@router.post("/parse", response_model=RepoParseResponse)
def parse_repo(request: RepoParseRequest) -> RepoParseResponse:
    try:
        parsed_repo = parse_github_repo_url(request.repo_url)
    except RepoUrlParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return RepoParseResponse(
        owner=parsed_repo.owner,
        repo=parsed_repo.repo,
        normalized_url=parsed_repo.normalized_url,
    )


# Parses the URL, fetches GitHub repo metadata, and shapes it for the frontend.
# Route logic is limited to service orchestration and HTTP error translation.
@router.post("/metadata", response_model=RepoMetadataResponse)
def get_repo_metadata(
    request: RepoParseRequest,
    user: AuthenticatedUser | None = Depends(require_user_or_public_demo),
) -> RepoMetadataResponse:
    try:
        parsed_repo = parse_github_repo_url(request.repo_url)
        repo_access.apply_repo_access(user, parsed_repo.owner, parsed_repo.repo)
        metadata = fetch_repo_metadata(parsed_repo.owner, parsed_repo.repo)
    except RepoUrlParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GitHubMetadataError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return RepoMetadataResponse(
        owner=parsed_repo.owner,
        repo=parsed_repo.repo,
        normalized_url=parsed_repo.normalized_url,
        name=metadata.name,
        description=metadata.description,
        default_branch=metadata.default_branch,
        stars=metadata.stars,
        forks=metadata.forks,
        language=metadata.language,
        html_url=metadata.html_url,
        topics=metadata.topics,
        license=metadata.license,
    )


# Returns commit activity as an adaptive-interval timeline for the Analysis-page
# graph, over one of three ranges. "month" and "year" come from one
# /stats/commit_activity call (daily vs weekly grain); "all" sums /stats/contributors
# for full history (and may be truncated to the top 100 contributors). The bucketing
# is a deterministic service so the route stays thin; the stats endpoints' "still
# computing" (202) state surfaces as a 503 the frontend can retry.
@router.post("/commit-activity", response_model=CommitActivityResponse)
def get_repo_commit_activity(
    request: CommitActivityRequest,
    user: AuthenticatedUser | None = Depends(require_user_or_public_demo),
) -> CommitActivityResponse:
    contributors_truncated = False
    try:
        parsed_repo = parse_github_repo_url(request.repo_url)
        repo_access.apply_repo_access(user, parsed_repo.owner, parsed_repo.repo)
        if request.range == "all":
            weeks, contributors_truncated = fetch_contributor_weeks(
                parsed_repo.owner, parsed_repo.repo
            )
            # Floor the window at a full year so young repos don't render a stub.
            timeline = build_commit_timeline(weeks, min_weeks=MIN_ALL_RANGE_WEEKS)
        else:
            weeks = fetch_commit_activity(parsed_repo.owner, parsed_repo.repo)
            timeline = (
                build_daily_timeline(weeks)
                if request.range == "month"
                else build_commit_timeline(weeks)
            )
    except RepoUrlParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GitHubCommitActivityError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return CommitActivityResponse(
        owner=parsed_repo.owner,
        repo=parsed_repo.repo,
        normalized_url=parsed_repo.normalized_url,
        range=request.range,
        interval_label=timeline.interval_label,
        total_commits=timeline.total_commits,
        range_start=timeline.range_start,
        range_end=timeline.range_end,
        contributors_truncated=contributors_truncated,
        buckets=[
            CommitTimelineBucket(
                period_start=bucket.period_start,
                commit_count=bucket.commit_count,
            )
            for bucket in timeline.buckets
        ],
    )


# Fetches the default-branch file tree after resolving repo metadata. The
# metadata call supplies the branch name that GitHub's tree endpoint requires.
@router.post("/tree", response_model=RepoTreeResponse)
def get_repo_tree(
    request: RepoParseRequest,
    user: AuthenticatedUser | None = Depends(require_user_or_public_demo),
) -> RepoTreeResponse:
    try:
        parsed_repo = parse_github_repo_url(request.repo_url)
        repo_access.apply_repo_access(user, parsed_repo.owner, parsed_repo.repo)
        metadata = fetch_repo_metadata(parsed_repo.owner, parsed_repo.repo)
        tree = fetch_repo_tree(
            parsed_repo.owner,
            parsed_repo.repo,
            metadata.default_branch,
        )
    except RepoUrlParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GitHubMetadataError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except GitHubTreeError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return RepoTreeResponse(
        owner=parsed_repo.owner,
        repo=parsed_repo.repo,
        normalized_url=parsed_repo.normalized_url,
        default_branch=metadata.default_branch,
        files=[
            RepoFile(
                path=file.path,
                type=file.type,
                size=file.size,
                url=file.url,
            )
            for file in tree.files
        ],
        total_files=tree.total_files,
        total_directories=tree.total_directories,
        is_truncated=tree.is_truncated,
    )


# Fetches the default-branch tree and returns deterministic Phase 5 file
# selections. The route only orchestrates services and leaves scoring rules in
# file_ranker.py so future phases can reuse the same ranking behavior.
@router.post("/ranked-files", response_model=RepoFileRankingResponse)
def get_ranked_repo_files(
    request: RepoParseRequest,
    user: AuthenticatedUser | None = Depends(require_user_or_public_demo),
) -> RepoFileRankingResponse:
    try:
        parsed_repo = parse_github_repo_url(request.repo_url)
        repo_access.apply_repo_access(user, parsed_repo.owner, parsed_repo.repo)
        metadata = fetch_repo_metadata(parsed_repo.owner, parsed_repo.repo)
        tree = fetch_repo_tree(
            parsed_repo.owner,
            parsed_repo.repo,
            metadata.default_branch,
        )
    except RepoUrlParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GitHubMetadataError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except GitHubTreeError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    rankable_files = filter_repo_files(tree.files)
    ranked_files = rank_important_files(tree.files)

    return RepoFileRankingResponse(
        owner=parsed_repo.owner,
        repo=parsed_repo.repo,
        normalized_url=parsed_repo.normalized_url,
        default_branch=metadata.default_branch,
        ranked_files=[
            RankedRepoFile(
                path=file.path,
                size=file.size,
                importance_score=file.importance_score,
                reasons=file.reasons,
            )
            for file in ranked_files
        ],
        total_files=tree.total_files,
        rankable_files=len(rankable_files),
        returned_files=len(ranked_files),
    )


# Reuses Phase 5 ranked files to detect the repository stack. Phase 6 reads only
# ranked README and manifest/config files; broad source-content fetching belongs
# to the bounded evidence pipeline in Phase 7.
@router.post("/tech-stack", response_model=TechStackResponse)
def get_repo_tech_stack(
    request: RepoParseRequest,
    user: AuthenticatedUser | None = Depends(require_user_or_public_demo),
) -> TechStackResponse:
    try:
        parsed_repo = parse_github_repo_url(request.repo_url)
        repo_access.apply_repo_access(user, parsed_repo.owner, parsed_repo.repo)
        metadata = fetch_repo_metadata(parsed_repo.owner, parsed_repo.repo)
        tree = fetch_repo_tree(
            parsed_repo.owner,
            parsed_repo.repo,
            metadata.default_branch,
        )
        ranked_files = rank_important_files(tree.files)
        # Fetches the bounded README/manifest set and tolerates per-file gaps;
        # the service owns the fetch-and-skip logic so this route stays thin.
        file_contents = collect_stack_evidence(
            parsed_repo.owner,
            parsed_repo.repo,
            metadata.default_branch,
            ranked_files,
        )
        # The full per-language byte breakdown (best-effort: {} on failure) so the
        # detected stack reflects every meaningful language, not just the top one.
        languages = fetch_repo_languages(parsed_repo.owner, parsed_repo.repo)
    except RepoUrlParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GitHubMetadataError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except GitHubTreeError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except GitHubFileContentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    technologies = detect_tech_stack(metadata, ranked_files, file_contents, languages)

    return TechStackResponse(
        owner=parsed_repo.owner,
        repo=parsed_repo.repo,
        normalized_url=parsed_repo.normalized_url,
        default_branch=metadata.default_branch,
        technologies=[
            DetectedTechnology(
                name=technology.name,
                category=technology.category,
                confidence=technology.confidence,
                evidence=[
                    TechStackEvidence(
                        source=evidence.source,
                        detail=evidence.detail,
                        path=evidence.path,
                    )
                    for evidence in technology.evidence
                ],
            )
            for technology in technologies
        ],
        evidence_files_read=len(file_contents),
    )


# Reuses Phase 5 rankings to fetch bounded README, config, and top source file
# contents for later AI steps. The route only orchestrates services and maps
# errors; all selection and limit logic lives in file_content_service so future
# phases can reuse the same safe evidence bundle.
@router.post("/file-contents", response_model=RepoFileContentResponse)
def get_repo_file_contents(
    request: RepoParseRequest,
    user: AuthenticatedUser | None = Depends(require_user_or_public_demo),
) -> RepoFileContentResponse:
    try:
        parsed_repo = parse_github_repo_url(request.repo_url)
        repo_access.apply_repo_access(user, parsed_repo.owner, parsed_repo.repo)
        metadata = fetch_repo_metadata(parsed_repo.owner, parsed_repo.repo)
        tree = fetch_repo_tree(
            parsed_repo.owner,
            parsed_repo.repo,
            metadata.default_branch,
        )
        ranked_files = rank_important_files(tree.files)
        evidence = collect_file_evidence(
            parsed_repo.owner,
            parsed_repo.repo,
            metadata.default_branch,
            ranked_files,
        )
    except RepoUrlParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GitHubMetadataError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except GitHubTreeError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except GitHubFileContentError as exc:
        # The evidence service skips tolerable per-file failures itself, so any
        # error that reaches here is systemic (rate limit, auth, upstream).
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return RepoFileContentResponse(
        owner=parsed_repo.owner,
        repo=parsed_repo.repo,
        normalized_url=parsed_repo.normalized_url,
        default_branch=metadata.default_branch,
        selected_files=[
            SelectedFileEvidence(
                path=file.path,
                source_type=file.source_type,
                reason=file.reason,
                content=file.content,
                original_size=file.original_size,
                truncated=file.truncated,
                char_count=file.char_count,
            )
            for file in evidence.selected_files
        ],
        skipped_files=[
            SkippedFileEvidence(
                path=file.path,
                source_type=file.source_type,
                reason=file.reason,
            )
            for file in evidence.skipped_files
        ],
        selected_count=len(evidence.selected_files),
        skipped_count=len(evidence.skipped_files),
        total_characters=evidence.total_characters,
    )
