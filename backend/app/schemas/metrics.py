from pydantic import BaseModel

# Phase 13 metrics response shapes for the developer view (GET /api/metrics).


# Latency aggregate for one category (llm, backend): how many samples, the average,
# and the worst case, all in milliseconds.
class LatencyMetric(BaseModel):
    count: int = 0
    avg_ms: float = 0.0
    max_ms: float = 0.0


# The full metrics snapshot: cumulative counters keyed by name, and latency
# aggregates keyed by category. Dict-valued so new counters/categories can be
# added in the store without changing the schema.
class MetricsResponse(BaseModel):
    counters: dict[str, int]
    latency: dict[str, LatencyMetric]
