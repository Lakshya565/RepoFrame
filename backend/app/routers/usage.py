from fastapi import APIRouter

from app.schemas.usage import LifetimeUsageResponse
from app.services import usage_store

router = APIRouter(prefix="/api/usage", tags=["usage"])


# Returns the persistent lifetime token totals RepoFrame's backend has recorded.
# The frontend shows this as a running project-spend badge so the user never has
# to open the OpenAI dashboard. The route stays thin: usage_store owns the ledger.
@router.get("/total", response_model=LifetimeUsageResponse)
def get_usage_total() -> LifetimeUsageResponse:
    totals = usage_store.get_total()
    return LifetimeUsageResponse(
        prompt_tokens=totals.prompt_tokens,
        completion_tokens=totals.completion_tokens,
        reasoning_tokens=totals.reasoning_tokens,
        total_tokens=totals.total_tokens,
        runs=totals.runs,
        model_calls=totals.model_calls,
    )
