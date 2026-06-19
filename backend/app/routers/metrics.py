from fastapi import APIRouter

from app.schemas.metrics import MetricsResponse
from app.services import metrics_store

router = APIRouter(prefix="/api", tags=["metrics"])


# Developer view of the Phase 13 operational and claim-quality metrics: repos
# analyzed, files scanned/selected, outputs generated, claim verification counts
# by status, request/error counts, and LLM/backend latency. Tokens are reported
# separately by GET /api/usage/total. The route stays thin: metrics_store owns the
# numbers.
@router.get("/metrics", response_model=MetricsResponse)
def get_metrics() -> MetricsResponse:
    return MetricsResponse(**metrics_store.snapshot())
