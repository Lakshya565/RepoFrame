from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routers import generate, github, repo, usage
from app.services.repo_parser import INVALID_REPO_URL_MESSAGE

app = FastAPI(title="RepoFrame API")

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
