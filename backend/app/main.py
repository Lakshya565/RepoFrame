import time

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routers import generate, github, metrics, repo, usage
from app.services import metrics_store
from app.services.repo_parser import INVALID_REPO_URL_MESSAGE

app = FastAPI(title="RepoFrame API")


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
    try:
        response = await call_next(request)
    except Exception:
        if _track_metrics(request.url.path):
            metrics_store.record_request((time.perf_counter() - start) * 1000, 500)
        raise

    if _track_metrics(request.url.path):
        metrics_store.record_request(
            (time.perf_counter() - start) * 1000, response.status_code
        )
    return response

# Local frontend origins are allowed during development; production can narrow this later.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
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
