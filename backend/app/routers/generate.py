import asyncio
import json
import logging
import queue
import threading
from collections import Counter
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.config import OPENAI_MODEL
from app.schemas.outputs import (
    GenerateInterviewPrepRequest,
    GenerateInterviewPrepResponse,
    GenerateOutputsRequest,
    GenerateOutputsResponse,
    ReviseInterviewPrepRequest,
    ReviseOutputRequest,
)
from app.schemas.profile import (
    GenerateProfileRequest,
    GenerateProfileResponse,
    ProfileEvidence,
    ProjectProfile,
)
from app.schemas.usage import UsageTotals
from app.schemas.verify import VerifyClaimsRequest, VerifyClaimsResponse
from app.services import metrics_store, usage_store
from app.services.claim_verifier import (
    VERIFY_STAGE_EVIDENCE,
    verify_claims,
)
from app.services.file_content_service import (
    RepoEvidenceCollection,
    collect_file_evidence,
)
from app.services.file_ranker import rank_important_files
from app.services.github_service import (
    GitHubFileContentError,
    GitHubMetadataError,
    GitHubTreeError,
    fetch_repo_languages,
    fetch_repo_metadata,
    fetch_repo_tree,
)
from app.services.llm_client import LLMError
from app.services.output_generator import (
    generate_core_outputs,
    generate_interview_prep,
    revise_interview_prep,
    revise_output,
)
from app.services.profile_generator import (
    ProfileGenerationError,
    generate_project_profile,
)
from app.services.repo_parser import RepoUrlParseError, parse_github_repo_url
from app.services.tech_stack_detector import (
    collect_stack_evidence,
    detect_tech_stack,
)

router = APIRouter(prefix="/api/generate", tags=["generate"])

logger = logging.getLogger(__name__)


# Generates the Phase 10 structured project profile. The route reuses the same
# deterministic pipeline as the analysis endpoints (parse -> metadata -> tree ->
# rank -> tech stack -> bounded evidence) to assemble grounded inputs, then hands
# them to the profile generator, which enforces the prompt budget and makes the
# single OpenAI call. All scoring, limit, and LLM logic lives in services; the
# route only orchestrates and maps errors to HTTP responses.
@router.post("/profile", response_model=GenerateProfileResponse)
def generate_profile(request: GenerateProfileRequest) -> GenerateProfileResponse:
    try:
        parsed_repo = parse_github_repo_url(request.repo_url)
        metadata = fetch_repo_metadata(parsed_repo.owner, parsed_repo.repo)
        tree = fetch_repo_tree(
            parsed_repo.owner,
            parsed_repo.repo,
            metadata.default_branch,
        )
        ranked_files = rank_important_files(tree.files)

        # Tech-stack detection reads only ranked README/manifest files (Phase 6),
        # tolerating per-file gaps so a missing manifest does not fail the run.
        file_contents = collect_stack_evidence(
            parsed_repo.owner,
            parsed_repo.repo,
            metadata.default_branch,
            ranked_files,
        )
        # The full per-language byte breakdown (best-effort: {} on failure) so the
        # profile is grounded in every meaningful language, not just the top one.
        languages = fetch_repo_languages(parsed_repo.owner, parsed_repo.repo)
        technologies = detect_tech_stack(
            metadata, ranked_files, file_contents, languages
        )

        # Bounded source/README/config evidence (Phase 7) feeds the prompt body.
        evidence = collect_file_evidence(
            parsed_repo.owner,
            parsed_repo.repo,
            metadata.default_branch,
            ranked_files,
        )

        # Prompt construction, budget enforcement, and the OpenAI call all happen
        # inside the generator; it returns the validated profile, the pre-call
        # token estimate, and the real post-call token usage.
        with metrics_store.timed("llm"):
            profile, estimated_input_tokens, usage = generate_project_profile(
                metadata,
                technologies,
                evidence,
                request.user_context,
            )
    except RepoUrlParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GitHubMetadataError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except GitHubTreeError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except GitHubFileContentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except ProfileGenerationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    # Record the real usage to the lifetime ledger (safe: a ledger failure never
    # discards the completed generation).
    usage_store.record(usage)
    # Profile generation is the canonical "analyze a repo" action (Phase 13).
    metrics_store.increment(
        repos_analyzed=1,
        files_scanned=tree.total_files,
        files_selected=len(evidence.selected_files),
    )

    return GenerateProfileResponse(
        owner=parsed_repo.owner,
        repo=parsed_repo.repo,
        normalized_url=parsed_repo.normalized_url,
        default_branch=metadata.default_branch,
        # Re-emit through the response models so the API contract stays explicit
        # rather than passing the internal generator object straight through.
        profile=ProjectProfile(
            project_name=profile.project_name,
            two_sentence_summary=profile.two_sentence_summary,
            problem=profile.problem,
            solution=profile.solution,
            detected_tech_stack=profile.detected_tech_stack,
            core_features=profile.core_features,
            technical_highlights=profile.technical_highlights,
            user_contribution=profile.user_contribution,
            technical_challenges=profile.technical_challenges,
            resume_angles=profile.resume_angles,
            evidence=[
                ProfileEvidence(claim=item.claim, source=item.source)
                for item in profile.evidence
            ],
        ),
        model=OPENAI_MODEL,
        estimated_input_tokens=estimated_input_tokens,
        evidence_file_count=len(evidence.selected_files),
        usage=UsageTotals.from_usage(usage),
    )


# Generates the Phase 11 core written outputs (resume bullets, README intro,
# portfolio blurb, LinkedIn description) from an already-generated project
# profile. Accepting the profile in the request body avoids re-running the repo
# pipeline and the profile-generation call. The optional sections list scopes a
# regenerate to one section; all generation logic lives in output_generator.
@router.post("/outputs", response_model=GenerateOutputsResponse)
def generate_outputs(request: GenerateOutputsRequest) -> GenerateOutputsResponse:
    try:
        with metrics_store.timed("llm"):
            outputs, estimated_input_tokens, usage = generate_core_outputs(
                request.profile, request.sections, request.guidance
            )
    except LLMError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    usage_store.record(usage)
    metrics_store.increment(outputs_generated=1)

    return GenerateOutputsResponse(
        outputs=outputs,
        model=OPENAI_MODEL,
        estimated_input_tokens=estimated_input_tokens,
        usage=UsageTotals.from_usage(usage),
    )


# Revises a single output section using the user's current draft plus an optional
# instruction (the feedback-driven "Regenerate"). Returns the same shape as the
# generate endpoint with only the revised section populated, so the frontend can
# merge it without disturbing the other outputs.
@router.post("/outputs/revise", response_model=GenerateOutputsResponse)
def revise_output_endpoint(request: ReviseOutputRequest) -> GenerateOutputsResponse:
    try:
        with metrics_store.timed("llm"):
            outputs, estimated_input_tokens, usage = revise_output(
                request.profile,
                request.section,
                request.current_text,
                request.instruction,
            )
    except LLMError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    usage_store.record(usage)

    return GenerateOutputsResponse(
        outputs=outputs,
        model=OPENAI_MODEL,
        estimated_input_tokens=estimated_input_tokens,
        usage=UsageTotals.from_usage(usage),
    )


# Generates interview talking points from a project profile. Kept on its own
# endpoint because interview prep is opt-in: the frontend only calls this when the
# user explicitly asks, so it never spends tokens as part of the default flow.
@router.post("/interview-prep", response_model=GenerateInterviewPrepResponse)
def generate_interview_prep_endpoint(
    request: GenerateInterviewPrepRequest,
) -> GenerateInterviewPrepResponse:
    try:
        with metrics_store.timed("llm"):
            topics, estimated_input_tokens, usage = generate_interview_prep(
                request.profile, request.guidance
            )
    except LLMError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    usage_store.record(usage)

    return GenerateInterviewPrepResponse(
        topics=topics,
        model=OPENAI_MODEL,
        estimated_input_tokens=estimated_input_tokens,
        usage=UsageTotals.from_usage(usage),
    )


# Revises the existing interview prep using the current topics plus an optional
# instruction (the feedback-driven "Regenerate" for the interview card, matching
# the section reviser). Returns the same shape as the interview-prep generate
# endpoint so the frontend swaps the topics in without any special handling.
@router.post("/interview-prep/revise", response_model=GenerateInterviewPrepResponse)
def revise_interview_prep_endpoint(
    request: ReviseInterviewPrepRequest,
) -> GenerateInterviewPrepResponse:
    try:
        with metrics_store.timed("llm"):
            topics, estimated_input_tokens, usage = revise_interview_prep(
                request.profile, request.current_topics, request.instruction
            )
    except LLMError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    usage_store.record(usage)

    return GenerateInterviewPrepResponse(
        topics=topics,
        model=OPENAI_MODEL,
        estimated_input_tokens=estimated_input_tokens,
        usage=UsageTotals.from_usage(usage),
    )


# Re-runs the deterministic pipeline (parse -> metadata -> tree -> rank -> bounded
# evidence) to rebuild the same already-selected evidence bundle the profile was
# grounded in. Shared by both verify endpoints (one-shot and streaming) so the
# evidence rebuild stays identical. Raises the same domain errors the callers map.
def _gather_verify_evidence(repo_url: str) -> RepoEvidenceCollection:
    parsed_repo = parse_github_repo_url(repo_url)
    metadata = fetch_repo_metadata(parsed_repo.owner, parsed_repo.repo)
    tree = fetch_repo_tree(
        parsed_repo.owner,
        parsed_repo.repo,
        metadata.default_branch,
    )
    ranked_files = rank_important_files(tree.files)
    return collect_file_evidence(
        parsed_repo.owner,
        parsed_repo.repo,
        metadata.default_branch,
        ranked_files,
    )


# Records claim-quality metrics (Phase 13): how many claims were checked and the
# breakdown by verification status. Shared by both verify endpoints.
def _record_claim_metrics(verifications: list) -> None:
    status_counts = Counter(item.status for item in verifications)
    metrics_store.increment(
        claims_verified=len(verifications),
        claims_supported=status_counts["supported"],
        claims_partially_supported=status_counts["partially_supported"],
        claims_needs_confirmation=status_counts["needs_user_confirmation"],
        claims_unsupported=status_counts["unsupported"],
    )


# Phase 12 agentic claim verification. Rebuilds the evidence bundle, then hands it
# plus the generated outputs to the bounded verification agent. Like interview prep
# this is opt-in: the frontend calls it only when the user clicks "Verify claims",
# so it never spends tokens in the default flow. The agent loop, tools, and caps
# live in claim_verifier. This is the one-shot variant (the whole result at once);
# /verify/stream below runs the same work but streams real progress as it goes.
@router.post("/verify", response_model=VerifyClaimsResponse)
def verify_claims_endpoint(request: VerifyClaimsRequest) -> VerifyClaimsResponse:
    try:
        evidence = _gather_verify_evidence(request.repo_url)
        with metrics_store.timed("llm"):
            verifications, estimated_input_tokens, usage = verify_claims(
                evidence, request.outputs, request.user_context, request.sections
            )
    except RepoUrlParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GitHubMetadataError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except GitHubTreeError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except GitHubFileContentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    usage_store.record(usage)
    _record_claim_metrics(verifications)

    return VerifyClaimsResponse(
        verifications=verifications,
        model=OPENAI_MODEL,
        estimated_input_tokens=estimated_input_tokens,
        usage=UsageTotals.from_usage(usage),
    )


# Streaming counterpart to /verify. Runs the IDENTICAL work (rebuild evidence, then
# the bounded agent loop) but emits Server-Sent Events as each real milestone is
# reached, so the UI checklist tracks the agent's actual progress instead of a timed
# guess. Events are one JSON object per SSE `data:` frame:
#   - {"type": "progress", "stage": <stage>, "detail": <str|null>}  as work happens
#   - {"type": "result", ...VerifyClaimsResponse}                   on success
#   - {"type": "error", "detail": <str>, "status": <int>}          on failure
# The success payload is exactly the /verify response shape, so the client reuses
# the same parsing. Still opt-in: nothing runs until the user presses the button.
#
# The pipeline and OpenAI SDK are synchronous/blocking, so the work runs on a worker
# thread that pushes events into a queue; the async generator drains the queue onto
# the response without blocking the event loop. usage/metrics are recorded on the
# worker exactly as the one-shot endpoint does.
@router.post("/verify/stream")
async def verify_claims_stream_endpoint(
    request: VerifyClaimsRequest,
) -> StreamingResponse:
    event_queue: queue.Queue = queue.Queue()

    def emit(payload: dict) -> None:
        event_queue.put(payload)

    def run_verification() -> None:
        try:
            # The evidence rebuild is the first real stage; signal it before the
            # (blocking) GitHub work so the checklist lights up immediately.
            emit({"type": "progress", "stage": VERIFY_STAGE_EVIDENCE, "detail": None})
            evidence = _gather_verify_evidence(request.repo_url)

            def on_progress(stage: str, detail: str | None) -> None:
                emit({"type": "progress", "stage": stage, "detail": detail})

            with metrics_store.timed("llm"):
                verifications, estimated_input_tokens, usage = verify_claims(
                    evidence,
                    request.outputs,
                    request.user_context,
                    request.sections,
                    progress=on_progress,
                )

            usage_store.record(usage)
            _record_claim_metrics(verifications)

            response = VerifyClaimsResponse(
                verifications=verifications,
                model=OPENAI_MODEL,
                estimated_input_tokens=estimated_input_tokens,
                usage=UsageTotals.from_usage(usage),
            )
            emit({"type": "result", **response.model_dump(by_alias=True)})
        except RepoUrlParseError as exc:
            emit({"type": "error", "detail": str(exc), "status": 400})
        except (
            GitHubMetadataError,
            GitHubTreeError,
            GitHubFileContentError,
            LLMError,
        ) as exc:
            emit({"type": "error", "detail": str(exc), "status": exc.status_code})
        except Exception:  # noqa: BLE001 - last-resort guard so the stream always ends
            logger.exception("Unexpected error during streamed claim verification")
            emit(
                {
                    "type": "error",
                    "detail": "Verification failed due to an unexpected error.",
                    "status": 500,
                }
            )
        finally:
            # Sentinel: tells the async generator the worker is done.
            event_queue.put(None)

    async def event_source() -> AsyncIterator[str]:
        loop = asyncio.get_running_loop()
        worker = threading.Thread(target=run_verification, daemon=True)
        worker.start()
        while True:
            # Block for the next event on a threadpool slot so the event loop stays
            # free to flush already-queued frames to the client.
            event = await loop.run_in_executor(None, event_queue.get)
            if event is None:
                break
            yield f"data: {json.dumps(event)}\n\n"

    # text/event-stream + no buffering so each frame reaches the browser as emitted.
    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
