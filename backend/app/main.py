import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import config
from app.routers import generate, github, github_app, metrics, projects, repo, usage
from app.services import metrics_store
from app.services.repo_parser import INVALID_REPO_URL_MESSAGE

app = FastAPI(title="RepoFrame API")
logger = logging.getLogger(__name__)


# True for API requests we want in the backend-latency/error metrics — excludes the
# metrics endpoint itself (so reading metrics never inflates them) and non-/api
# paths like /health.
def _track_metrics(path: str) -> bool:
    return path.startswith("/api/") and path != "/api/metrics"


# Records backend latency, request count, and server-error count for every tracked
# API request (Phase 13). An unhandled exception is counted as a 500 before it
# propagates to FastAPI's error handling.
@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start = time.perf_counter()
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    try:
        response = await call_next(request)
    except Exception:
        if _track_metrics(request.url.path):
            metrics_store.record_request((time.perf_counter() - start) * 1000, 500)
        raise

    elapsed_ms = (time.perf_counter() - start) * 1000
    if _track_metrics(request.url.path):
        metrics_store.record_request(elapsed_ms, response.status_code)
        logger.info(
            "api_request request_id=%s method=%s path=%s status=%s duration_ms=%.2f cf_ray=%s",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            request.headers.get("CF-Ray", ""),
        )
    response.headers["X-Request-ID"] = request_id
    response.headers["Server-Timing"] = f"app;dur={elapsed_ms:.2f}"
    return response

# Allowed browser origins. Defaults to the local dev frontend; production sets
# CORS_ALLOW_ORIGINS to the deployed frontend origin(s). See config.py.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Lightweight health check used to confirm the FastAPI process is alive without
# touching GitHub or any future external services.
@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(repo.router)
app.include_router(github.router)
app.include_router(generate.router)
app.include_router(usage.router)
app.include_router(metrics.router)
app.include_router(projects.router)
app.include_router(github_app.router)


# Returns the same friendly URL error for malformed repo request payloads. This
# keeps validation errors consistent with parser errors from explicit routes.
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _request,
    _exc: RequestValidationError,
) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"detail": INVALID_REPO_URL_MESSAGE},
    )
