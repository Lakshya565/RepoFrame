from fastapi import APIRouter, HTTPException

from app.schemas.repo import (
    RankedRepoFile,
    RepoFileRankingResponse,
    RepoFile,
    RepoMetadataResponse,
    RepoParseRequest,
    RepoParseResponse,
    RepoTreeResponse,
)
from app.services.file_ranker import filter_repo_files, rank_important_files
from app.services.github_service import (
    GitHubMetadataError,
    GitHubTreeError,
    fetch_repo_metadata,
    fetch_repo_tree,
)
from app.services.repo_parser import RepoUrlParseError, parse_github_repo_url

router = APIRouter(prefix="/api/repo", tags=["repo"])


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
def get_repo_metadata(request: RepoParseRequest) -> RepoMetadataResponse:
    try:
        parsed_repo = parse_github_repo_url(request.repo_url)
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
    )


# Fetches the default-branch file tree after resolving repo metadata. The
# metadata call supplies the branch name that GitHub's tree endpoint requires.
@router.post("/tree", response_model=RepoTreeResponse)
def get_repo_tree(request: RepoParseRequest) -> RepoTreeResponse:
    try:
        parsed_repo = parse_github_repo_url(request.repo_url)
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
def get_ranked_repo_files(request: RepoParseRequest) -> RepoFileRankingResponse:
    try:
        parsed_repo = parse_github_repo_url(request.repo_url)
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
