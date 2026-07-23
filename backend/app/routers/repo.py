import asyncio
import json
import logging
import queue
import threading
import time
from collections.abc import AsyncIterator

import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.schemas.repo import (
    CommitActivityResponse,
    RepoFileContentResponse,
    RepoFileRankingResponse,
    RepoMetadataResponse,
    RepoParseRequest,
    RepoParseResponse,
    RepoTreeResponse,
    SelectedFileEvidence,
    SkippedFileEvidence,
    TechStackResponse,
)
from app.services import analysis_service
from app.services.file_content_service import collect_file_evidence
from app.services.github_service import (
    GitHubCommitActivityError,
    GitHubFileContentError,
    GitHubMetadataError,
    GitHubTreeError,
    fetch_repo_text_file,
)
from app.services.auth import AuthenticatedUser, require_user_or_public_demo
from app.services.repo_parser import RepoUrlParseError, parse_github_repo_url

logger = logging.getLogger(__name__)

# Login gate (Phase 15.3): when Supabase is configured, the repo-analysis
# endpoints require a verified user; when unconfigured (local dev), they stay open.
# Applied at the router level so the gate can't be forgotten on a new route. The one
# exception is the public demo repo (config.DEMO_REPO_*): the signed-out product demo
# loads its REAL analysis data live, so require_user_or_public_demo lets anonymous
# reads of that single repo through while every other repo still requires login.
router = APIRouter(
    prefix="/api/repo",
    tags=["repo"],
    dependencies=[Depends(require_user_or_public_demo)],
)


# Returns normalized owner/repo data for a GitHub URL before analysis starts.
# The route stays thin and delegates parsing rules to the repo parser service.
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


# Streams the shared core analysis as soon as each dependency stage completes.
# Work remains synchronous because the GitHub client is requests-based, so a
# worker thread feeds JSON events through a queue without blocking FastAPI's loop.
@router.post("/analysis/stream")
async def stream_repo_analysis(
    request: RepoParseRequest,
    user: AuthenticatedUser | None = Depends(require_user_or_public_demo),
) -> StreamingResponse:
    event_queue: queue.Queue[dict | None] = queue.Queue()

    def emit(payload: dict) -> None:
        event_queue.put(payload)

    def stage_event(stage: str, payload: object) -> None:
        if hasattr(payload, "model_dump"):
            data = payload.model_dump(by_alias=True)
        elif isinstance(payload, dict):
            data = {
                key: value.model_dump(by_alias=True)
                if hasattr(value, "model_dump")
                else value
                for key, value in payload.items()
            }
        else:
            data = payload
        emit({"type": stage, "data": data})

    def run_analysis() -> None:
        started = time.perf_counter()
        try:
            result = analysis_service.get_repo_analysis(
                request.repo_url, user, callback=stage_event
            )
            emit(
                {
                    "type": "complete",
                    "cacheStatus": result.status,
                    "generatedAt": result.value.generated_at,
                    "durationMs": round((time.perf_counter() - started) * 1000, 2),
                }
            )
        except RepoUrlParseError as exc:
            emit(
                {
                    "type": "error",
                    "stage": "metadata",
                    "detail": str(exc),
                    "status": 400,
                    "retryable": False,
                }
            )
        except (GitHubMetadataError, GitHubTreeError, GitHubFileContentError) as exc:
            stage = (
                "metadata"
                if isinstance(exc, GitHubMetadataError)
                else "structure"
                if isinstance(exc, GitHubTreeError)
                else "techStack"
            )
            emit(
                {
                    "type": "error",
                    "stage": stage,
                    "detail": str(exc),
                    "status": exc.status_code,
                    "retryable": exc.status_code >= 500 or exc.status_code == 429,
                }
            )
        except Exception:  # noqa: BLE001 - the stream must always terminate cleanly
            logger.exception("Unexpected error during streamed repository analysis")
            emit(
                {
                    "type": "error",
                    "stage": "analysis",
                    "detail": "Repository analysis failed unexpectedly.",
                    "status": 500,
                    "retryable": True,
                }
            )
        finally:
            event_queue.put(None)

    async def event_source() -> AsyncIterator[str]:
        loop = asyncio.get_running_loop()
        threading.Thread(target=run_analysis, daemon=True).start()
        while True:
            event = await loop.run_in_executor(None, event_queue.get)
            if event is None:
                break
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# Parses the URL, fetches GitHub repo metadata, and shapes it for the frontend.
# Route logic is limited to service orchestration and HTTP error translation.
@router.post("/metadata", response_model=RepoMetadataResponse)
def get_repo_metadata(
    request: RepoParseRequest,
    user: AuthenticatedUser | None = Depends(require_user_or_public_demo),
) -> RepoMetadataResponse:
    try:
        return analysis_service.get_repo_analysis(
            request.repo_url, user
        ).value.metadata_response()
    except RepoUrlParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GitHubMetadataError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except (GitHubTreeError, GitHubFileContentError) as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


# Fetches GitHub's last-year statistics once and derives both supported timelines.
# Returning the pair together makes the frontend's 1M/1Y toggle local and instant.
@router.post("/commit-activity", response_model=CommitActivityResponse)
def get_repo_commit_activity(
    request: RepoParseRequest,
    user: AuthenticatedUser | None = Depends(require_user_or_public_demo),
) -> CommitActivityResponse:
    try:
        return analysis_service.get_commit_activity(request.repo_url, user).value
    except RepoUrlParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GitHubCommitActivityError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


# Fetches the default-branch file tree after resolving repo metadata. The
# metadata call supplies the branch name that GitHub's tree endpoint requires.
@router.post("/tree", response_model=RepoTreeResponse)
def get_repo_tree(
    request: RepoParseRequest,
    user: AuthenticatedUser | None = Depends(require_user_or_public_demo),
) -> RepoTreeResponse:
    try:
        return analysis_service.get_repo_analysis(
            request.repo_url, user
        ).value.tree_response()
    except RepoUrlParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GitHubMetadataError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except GitHubTreeError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    except GitHubFileContentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


# Fetches the default-branch tree and returns deterministic file selections. The
# route only orchestrates services; file_ranker.py owns the scoring rules.
@router.post("/ranked-files", response_model=RepoFileRankingResponse)
def get_ranked_repo_files(
    request: RepoParseRequest,
    user: AuthenticatedUser | None = Depends(require_user_or_public_demo),
) -> RepoFileRankingResponse:
    try:
        return analysis_service.get_repo_analysis(
            request.repo_url, user
        ).value.ranking_response()
    except RepoUrlParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GitHubMetadataError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except GitHubTreeError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    except GitHubFileContentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


# Reuses Phase 5 ranked files to detect the repository stack. Phase 6 reads only
# ranked README and manifest/config files; broad source-content fetching belongs
# to the bounded evidence pipeline in Phase 7.
@router.post("/tech-stack", response_model=TechStackResponse)
def get_repo_tech_stack(
    request: RepoParseRequest,
    user: AuthenticatedUser | None = Depends(require_user_or_public_demo),
) -> TechStackResponse:
    try:
        return analysis_service.get_repo_analysis(
            request.repo_url, user
        ).value.tech_stack_response()
    except RepoUrlParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GitHubMetadataError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except GitHubTreeError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except GitHubFileContentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc



# Reuses Phase 5 rankings to fetch bounded README, config, and top source file
# contents for later AI steps. The route only orchestrates services and maps
# errors; all selection and limit logic lives in file_content_service so future
# phases can reuse the same safe evidence bundle.
@router.post("/file-contents", response_model=RepoFileContentResponse)
def get_repo_file_contents(
    request: RepoParseRequest,
    user: AuthenticatedUser | None = Depends(require_user_or_public_demo),
) -> RepoFileContentResponse:
    try:
        snapshot = analysis_service.get_repo_analysis(request.repo_url, user).value
        parsed_repo = snapshot.parsed_repo
        metadata = snapshot.metadata
        session = requests.Session()
        try:
            evidence = collect_file_evidence(
                parsed_repo.owner,
                parsed_repo.repo,
                metadata.default_branch,
                snapshot.ranked_files,
                fetcher=lambda *args: fetch_repo_text_file(*args, session=session),
            )
        finally:
            session.close()
    except RepoUrlParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GitHubMetadataError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except GitHubTreeError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except GitHubFileContentError as exc:
        # The evidence service skips tolerable per-file failures itself, so any
        # error that reaches here is systemic (rate limit, auth, upstream).
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return RepoFileContentResponse(
        owner=parsed_repo.owner,
        repo=parsed_repo.repo,
        normalized_url=parsed_repo.normalized_url,
        default_branch=metadata.default_branch,
        selected_files=[
            SelectedFileEvidence(
                path=file.path,
                source_type=file.source_type,
                reason=file.reason,
                content=file.content,
                original_size=file.original_size,
                truncated=file.truncated,
                char_count=file.char_count,
            )
            for file in evidence.selected_files
        ],
        skipped_files=[
            SkippedFileEvidence(
                path=file.path,
                source_type=file.source_type,
                reason=file.reason,
            )
            for file in evidence.skipped_files
        ],
        selected_count=len(evidence.selected_files),
        skipped_count=len(evidence.skipped_files),
        total_characters=evidence.total_characters,
    )
