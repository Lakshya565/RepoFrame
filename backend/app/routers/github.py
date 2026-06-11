from fastapi import APIRouter, HTTPException

from app.schemas.repo import GitHubRateLimitResponse
from app.services.github_service import GitHubRateLimitError, fetch_rate_limit

router = APIRouter(prefix="/api/github", tags=["github"])


# Exposes GitHub's current core REST API budget without exposing the backend
# token. This helps local development avoid surprise rate-limit failures.
@router.get("/rate-limit", response_model=GitHubRateLimitResponse)
def get_rate_limit() -> GitHubRateLimitResponse:
    try:
        rate_limit = fetch_rate_limit()
    except GitHubRateLimitError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return GitHubRateLimitResponse(
        limit=rate_limit.limit,
        used=rate_limit.used,
        remaining=rate_limit.remaining,
        reset=rate_limit.reset,
        reset_at=rate_limit.reset_at,
        is_authenticated=rate_limit.is_authenticated,
    )
