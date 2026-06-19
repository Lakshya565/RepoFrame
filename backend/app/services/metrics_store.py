import threading
import time
from contextlib import contextmanager
from typing import Iterator

# Phase 13 operational + claim-quality metrics. A lightweight in-memory store of
# cumulative counters and latency aggregates behind a small record/snapshot
# interface, surfaced by a developer view (GET /api/metrics).
#
# In-memory on purpose: these are high-frequency, since-process-start numbers
# (every request touches the backend-latency aggregate), and the Phase 13 spec
# explicitly allows an in-memory store. They reset on restart. Token usage is NOT
# here — it is tracked persistently by usage_store (Phase 12). When metrics move to
# Supabase (Phase 15), this module is swapped behind the same interface.

# Counter names, initialized to 0 so the metrics view always shows the full set
# even before anything has happened.
_COUNTER_NAMES = (
    "repos_analyzed",
    "files_scanned",
    "files_selected",
    "outputs_generated",
    "claims_verified",
    "claims_supported",
    "claims_partially_supported",
    "claims_needs_confirmation",
    "claims_unsupported",
    "requests",
    "errors",
)

# Latency aggregates kept per category (count + running total + max → average and
# worst-case without storing every sample).
_LATENCY_CATEGORIES = ("llm", "backend")

_lock = threading.Lock()
_counters: dict[str, int] = {}
_latency: dict[str, dict[str, float]] = {}


def _fresh_counters() -> dict[str, int]:
    return {name: 0 for name in _COUNTER_NAMES}


def _fresh_latency() -> dict[str, dict[str, float]]:
    return {
        category: {"count": 0, "total_ms": 0.0, "max_ms": 0.0}
        for category in _LATENCY_CATEGORIES
    }


# Clears all metrics back to zero. Called once at import to initialize, and by
# tests for isolation.
def reset() -> None:
    with _lock:
        _counters.clear()
        _counters.update(_fresh_counters())
        _latency.clear()
        _latency.update(_fresh_latency())


reset()


# Adds to one or more named counters, e.g. increment(repos_analyzed=1,
# files_scanned=42). Unknown names are tolerated (created on first use) so callers
# never crash a request over a metric.
def increment(**deltas: int) -> None:
    with _lock:
        for name, delta in deltas.items():
            _counters[name] = _counters.get(name, 0) + delta


# Records one latency sample (milliseconds) for a category, updating its count,
# running total, and max.
def record_latency(category: str, elapsed_ms: float) -> None:
    with _lock:
        bucket = _latency.setdefault(
            category, {"count": 0, "total_ms": 0.0, "max_ms": 0.0}
        )
        bucket["count"] += 1
        bucket["total_ms"] += elapsed_ms
        bucket["max_ms"] = max(bucket["max_ms"], elapsed_ms)


# Times the wrapped block and records its latency under `category`. Records even if
# the block raises, so a slow failing call is still measured.
@contextmanager
def timed(category: str) -> Iterator[None]:
    start = time.perf_counter()
    try:
        yield
    finally:
        record_latency(category, (time.perf_counter() - start) * 1000)


# Records one finished HTTP request: counts it, adds its backend latency, and
# counts a server error (5xx). Used by the metrics middleware.
def record_request(elapsed_ms: float, status_code: int) -> None:
    increment(requests=1, errors=1 if status_code >= 500 else 0)
    record_latency("backend", elapsed_ms)


# Returns a read-only view of the metrics for the endpoint: the raw counters plus,
# per latency category, the count, average, and max in milliseconds.
def snapshot() -> dict:
    with _lock:
        counters = dict(_counters)
        latency = {}
        for category, bucket in _latency.items():
            count = int(bucket["count"])
            latency[category] = {
                "count": count,
                "avg_ms": round(bucket["total_ms"] / count, 2) if count else 0.0,
                "max_ms": round(bucket["max_ms"], 2),
            }
    return {"counters": counters, "latency": latency}
