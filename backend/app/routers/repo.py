from fastapi import APIRouter, HTTPException

from app.schemas.repo import RepoParseRequest, RepoParseResponse
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
