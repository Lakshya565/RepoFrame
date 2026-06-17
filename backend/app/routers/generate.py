from fastapi import APIRouter, HTTPException

from app.config import OPENAI_MODEL
from app.schemas.outputs import (
    GenerateInterviewPrepRequest,
    GenerateInterviewPrepResponse,
    GenerateOutputsRequest,
    GenerateOutputsResponse,
    ReviseOutputRequest,
)
from app.schemas.profile import (
    GenerateProfileRequest,
    GenerateProfileResponse,
    ProfileEvidence,
    ProjectProfile,
)
from app.services.file_content_service import collect_file_evidence
from app.services.file_ranker import rank_important_files
from app.services.github_service import (
    GitHubFileContentError,
    GitHubMetadataError,
    GitHubTreeError,
    fetch_repo_metadata,
    fetch_repo_text_file,
    fetch_repo_tree,
)
from app.services.llm_client import LLMError
from app.services.output_generator import (
    generate_core_outputs,
    generate_interview_prep,
    revise_output,
)
from app.services.profile_generator import (
    ProfileGenerationError,
    generate_project_profile,
)
from app.services.repo_parser import RepoUrlParseError, parse_github_repo_url
from app.services.tech_stack_detector import (
    MAX_STACK_EVIDENCE_FILE_SIZE_BYTES,
    detect_tech_stack,
    select_stack_evidence_files,
)

router = APIRouter(prefix="/api/generate", tags=["generate"])


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
        stack_evidence_files = select_stack_evidence_files(ranked_files)
        file_contents = []
        for file in stack_evidence_files:
            try:
                file_contents.append(
                    fetch_repo_text_file(
                        parsed_repo.owner,
                        parsed_repo.repo,
                        file.path,
                        metadata.default_branch,
                        MAX_STACK_EVIDENCE_FILE_SIZE_BYTES,
                    )
                )
            except GitHubFileContentError as exc:
                if exc.status_code not in {404, 413, 415}:
                    raise

        technologies = detect_tech_stack(metadata, ranked_files, file_contents)

        # Bounded source/README/config evidence (Phase 7) feeds the prompt body.
        evidence = collect_file_evidence(
            parsed_repo.owner,
            parsed_repo.repo,
            metadata.default_branch,
            ranked_files,
        )

        # Prompt construction, budget enforcement, and the OpenAI call all happen
        # inside the generator; it returns the validated profile and the pre-call
        # token estimate used for cost transparency.
        profile, estimated_input_tokens = generate_project_profile(
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
    )


# Generates the Phase 11 core written outputs (resume bullets, README intro,
# portfolio blurb, LinkedIn description) from an already-generated project
# profile. Accepting the profile in the request body avoids re-running the repo
# pipeline and the profile-generation call. The optional sections list scopes a
# regenerate to one section; all generation logic lives in output_generator.
@router.post("/outputs", response_model=GenerateOutputsResponse)
def generate_outputs(request: GenerateOutputsRequest) -> GenerateOutputsResponse:
    try:
        outputs, estimated_input_tokens = generate_core_outputs(
            request.profile, request.sections, request.guidance
        )
    except LLMError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return GenerateOutputsResponse(
        outputs=outputs,
        model=OPENAI_MODEL,
        estimated_input_tokens=estimated_input_tokens,
    )


# Revises a single output section using the user's current draft plus an optional
# instruction (the feedback-driven "Regenerate"). Returns the same shape as the
# generate endpoint with only the revised section populated, so the frontend can
# merge it without disturbing the other outputs.
@router.post("/outputs/revise", response_model=GenerateOutputsResponse)
def revise_output_endpoint(request: ReviseOutputRequest) -> GenerateOutputsResponse:
    try:
        outputs, estimated_input_tokens = revise_output(
            request.profile,
            request.section,
            request.current_text,
            request.instruction,
        )
    except LLMError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return GenerateOutputsResponse(
        outputs=outputs,
        model=OPENAI_MODEL,
        estimated_input_tokens=estimated_input_tokens,
    )


# Generates interview talking points from a project profile. Kept on its own
# endpoint because interview prep is opt-in: the frontend only calls this when the
# user explicitly asks, so it never spends tokens as part of the default flow.
@router.post("/interview-prep", response_model=GenerateInterviewPrepResponse)
def generate_interview_prep_endpoint(
    request: GenerateInterviewPrepRequest,
) -> GenerateInterviewPrepResponse:
    try:
        topics, estimated_input_tokens = generate_interview_prep(
            request.profile, request.guidance
        )
    except LLMError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return GenerateInterviewPrepResponse(
        topics=topics,
        model=OPENAI_MODEL,
        estimated_input_tokens=estimated_input_tokens,
    )
