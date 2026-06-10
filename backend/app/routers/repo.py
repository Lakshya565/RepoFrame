from fastapi import APIRouter, HTTPException

from app.schemas.repo import RepoMetadataResponse, RepoParseRequest, RepoParseResponse
from app.services.github_service import GitHubMetadataError, fetch_repo_metadata
from app.services.repo_parser import RepoUrlParseError, parse_github_repo_url

router = APIRouter(prefix="/api/repo", tags=["repo"])


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
