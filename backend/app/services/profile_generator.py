import json
import logging
from collections.abc import Callable
from dataclasses import dataclass

from pydantic import ValidationError

from app.config import (
    OPENAI_API_KEY,
    OPENAI_MAX_OUTPUT_TOKENS,
    OPENAI_MAX_RETRIES,
    OPENAI_MODEL,
    OPENAI_REASONING_EFFORT,
    OPENAI_TEMPERATURE,
    OPENAI_TIMEOUT_SECONDS,
)
from app.schemas.profile import ProjectProfile, UserContextInput
from app.services.file_content_service import RepoEvidenceCollection
from app.services.github_service import GitHubRepoMetadata
from app.services.tech_stack_detector import DetectedTechnology
from app.services.token_estimator import check_prompt_budget, estimate_input_tokens


# Carries a user-facing generation error plus the HTTP status the route should
# return, mirroring the GitHub service error pattern so routes stay thin.
class ProfileGenerationError(RuntimeError):
    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


logger = logging.getLogger(__name__)


# The raw result of one model call: the response text plus the finish_reason, so
# the caller can tell a complete answer from one truncated at the output-token
# limit. This distinction matters most for reasoning models, where reasoning
# tokens share the same budget as the visible answer.
@dataclass(frozen=True)
class CompletionResult:
    content: str
    finish_reason: str | None = None


# A completion function takes the (system_prompt, user_prompt) pair and returns a
# CompletionResult. Making this injectable lets tests pass a fake, so the test
# suite never touches the network or spends a single token. The default below is
# the real OpenAI call.
CompletionFn = Callable[[str, str], CompletionResult]


# Instructs the model to act as a grounded technical writer that may only use the
# supplied evidence and must answer with a JSON object. The exact key list keeps
# the output aligned with the ProjectProfile schema, and the grounding rules are
# what make RepoFrame evidence-backed rather than a generic AI writer. The word
# "JSON" is required by OpenAI's json_object response format.
_SYSTEM_PROMPT = (
    "You are RepoFrame's project-profile generator. You write accurate, "
    "evidence-backed summaries of software projects for resumes and portfolios.\n\n"
    "Strict rules:\n"
    "- Use ONLY the repository evidence and user-provided context given below. "
    "Do not invent features, metrics, technologies, or claims that the evidence "
    "does not support.\n"
    "- If something cannot be determined from the evidence, omit it rather than "
    "guessing. Leave a list empty instead of padding it.\n"
    "- Prefer concrete, specific statements grounded in real files over generic "
    "marketing language.\n"
    "- For every meaningful claim, add an entry to the evidence array linking the "
    "claim to its source (a file path, 'README', or 'user context').\n\n"
    "Respond with a single valid JSON object and nothing else. Use exactly these "
    "keys: projectName (string), twoSentenceSummary (string), problem (string), "
    "solution (string), detectedTechStack (array of strings), coreFeatures (array "
    "of strings), technicalHighlights (array of strings), userContribution "
    "(string), technicalChallenges (array of strings), resumeAngles (array of "
    "strings), evidence (array of objects each with 'claim' and 'source' strings)."
)


# Formats the user questionnaire answers for the prompt, replacing blanks with an
# explicit "not provided" so the model never treats an empty string as a fact and
# knows which non-repo details it genuinely lacks.
def _format_user_context(user_context: UserContextInput) -> str:
    def value(text: str) -> str:
        stripped = text.strip()
        return stripped if stripped else "(not provided)"

    collaboration = user_context.collaboration or "(not provided)"

    return (
        f"- Project purpose: {value(user_context.purpose)}\n"
        f"- Built solo or as a team: {collaboration}\n"
        f"- User's personal contribution: {value(user_context.contribution)}\n"
        f"- Target user or client: {value(user_context.target_user)}\n"
        f"- Hardest technical part: {value(user_context.hardest_part)}\n"
        f"- Impact or results: {value(user_context.impact)}"
    )


# Renders detected technologies as a compact, evidence-tagged list so the model
# can ground detectedTechStack in what the deterministic Phase 6 detector already
# confirmed, rather than re-guessing the stack from raw files.
def _format_tech_stack(technologies: list[DetectedTechnology]) -> str:
    if not technologies:
        return "(no technologies detected)"

    lines = []
    for tech in technologies:
        sources = ", ".join(sorted({item.source for item in tech.evidence}))
        lines.append(f"- {tech.name} ({tech.category}); evidence: {sources or 'n/a'}")
    return "\n".join(lines)


# Renders the bounded file evidence as labeled excerpts. The evidence is already
# trimmed to the character limits by collect_file_evidence, so this only needs to
# present it; truncated files are flagged so the model knows the excerpt partial.
def _format_evidence(evidence: RepoEvidenceCollection) -> str:
    if not evidence.selected_files:
        return "(no file evidence available)"

    blocks = []
    for file in evidence.selected_files:
        suffix = " (truncated)" if file.truncated else ""
        blocks.append(
            f"### {file.path} [{file.source_type}]{suffix}\n{file.content}"
        )
    return "\n\n".join(blocks)


# Assembles the full user-side prompt from repo metadata, detected stack, file
# evidence, and user context. Kept separate from the OpenAI call so the prompt
# can be unit-tested and size-checked without any network access.
def build_profile_prompt(
    metadata: GitHubRepoMetadata,
    technologies: list[DetectedTechnology],
    evidence: RepoEvidenceCollection,
    user_context: UserContextInput,
) -> str:
    description = metadata.description or "(no description)"
    language = metadata.language or "(unknown)"

    return (
        "REPOSITORY METADATA\n"
        f"- Name: {metadata.name}\n"
        f"- Description: {description}\n"
        f"- Primary language: {language}\n"
        f"- Stars: {metadata.stars}, Forks: {metadata.forks}\n\n"
        "DETECTED TECH STACK\n"
        f"{_format_tech_stack(technologies)}\n\n"
        "USER-PROVIDED CONTEXT\n"
        f"{_format_user_context(user_context)}\n\n"
        "REPOSITORY FILE EVIDENCE\n"
        f"{_format_evidence(evidence)}"
    )


# Model families whose names begin with these prefixes are reasoning models.
# They reject the `temperature` parameter and instead expose `reasoning_effort`,
# and they bill reasoning tokens against the completion budget.
_REASONING_MODEL_PREFIXES = ("gpt-5", "o1", "o3", "o4")


# True when the configured model is a reasoning model, so request parameters can
# be built to match what that model family accepts.
def _is_reasoning_model(model: str) -> bool:
    return model.lower().startswith(_REASONING_MODEL_PREFIXES)


# Module-level client cache. The OpenAI client maintains an HTTP connection pool,
# so reusing one instance across requests avoids repeated connection/TLS setup.
# It is built lazily (the key may be unset at import time) with explicit timeout
# and retry bounds rather than the SDK's 10-minute default.
_client = None


def _get_client():
    global _client
    if _client is None:
        if not OPENAI_API_KEY:
            raise ProfileGenerationError(
                "OPENAI_API_KEY is not configured on the backend.", 500
            )
        try:
            from openai import OpenAI
        except ImportError as exc:  # pragma: no cover - environment/setup issue
            raise ProfileGenerationError(
                "The openai package is not installed on the backend.", 500
            ) from exc
        _client = OpenAI(
            api_key=OPENAI_API_KEY,
            timeout=OPENAI_TIMEOUT_SECONDS,
            max_retries=OPENAI_MAX_RETRIES,
        )
    return _client


# Builds the create() kwargs for the configured model. json_object forces valid
# JSON (the schema is enforced afterwards by validating against ProjectProfile).
# Reasoning models take `reasoning_effort` (kept low to bound reasoning-token
# cost on this grounded extraction task); other models take `temperature`.
def _build_create_kwargs(system_prompt: str, user_prompt: str) -> dict:
    kwargs: dict = {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "response_format": {"type": "json_object"},
        "max_completion_tokens": OPENAI_MAX_OUTPUT_TOKENS,
    }
    if _is_reasoning_model(OPENAI_MODEL):
        kwargs["reasoning_effort"] = OPENAI_REASONING_EFFORT
    else:
        kwargs["temperature"] = OPENAI_TEMPERATURE
    return kwargs


# The default completion function: the only place that actually contacts OpenAI
# and spends tokens. openai (client + error types) is imported lazily so the rest
# of the app and the whole test suite work without the package installed or a key
# configured. Transport/API errors are mapped to specific, non-leaky statuses;
# raw exception detail is logged server-side rather than returned to the client.
def _openai_completion(system_prompt: str, user_prompt: str) -> CompletionResult:
    client = _get_client()

    try:
        from openai import (
            APIConnectionError,
            APITimeoutError,
            AuthenticationError,
            BadRequestError,
            RateLimitError,
        )
    except ImportError as exc:  # pragma: no cover - environment/setup issue
        raise ProfileGenerationError(
            "The openai package is not installed on the backend.", 500
        ) from exc

    try:
        response = client.chat.completions.create(
            **_build_create_kwargs(system_prompt, user_prompt)
        )
    except APITimeoutError as exc:
        raise ProfileGenerationError(
            "The request to OpenAI timed out. Please try again.", 504
        ) from exc
    except RateLimitError as exc:
        raise ProfileGenerationError(
            "OpenAI's rate limit was reached. Please retry in a moment.", 429
        ) from exc
    except AuthenticationError as exc:
        logger.error("OpenAI rejected the backend credentials: %s", exc)
        raise ProfileGenerationError(
            "The backend's OpenAI credentials were rejected.", 500
        ) from exc
    except APIConnectionError as exc:
        raise ProfileGenerationError(
            "Could not reach OpenAI. Please try again.", 503
        ) from exc
    except BadRequestError as exc:
        # Malformed request or a parameter the chosen model does not support.
        logger.error("OpenAI rejected the request: %s", exc)
        raise ProfileGenerationError(
            "OpenAI rejected the profile generation request.", 502
        ) from exc
    except Exception as exc:  # noqa: BLE001 - last-resort guard for any SDK error
        logger.exception("Unexpected error during OpenAI profile generation")
        raise ProfileGenerationError(
            "Profile generation failed due to an unexpected error.", 502
        ) from exc

    choice = response.choices[0]
    return CompletionResult(
        content=choice.message.content or "",
        finish_reason=choice.finish_reason,
    )


# Builds the prompt, enforces the input-size budget BEFORE spending anything,
# calls the (injectable) completion function, and validates the returned JSON
# against ProjectProfile. Returns the parsed profile plus the pre-call token
# estimate so the route can report cost transparency. Any failure is mapped to a
# ProfileGenerationError with an appropriate status for the route to surface.
def generate_project_profile(
    metadata: GitHubRepoMetadata,
    technologies: list[DetectedTechnology],
    evidence: RepoEvidenceCollection,
    user_context: UserContextInput,
    completion_fn: CompletionFn = _openai_completion,
) -> tuple[ProjectProfile, int]:
    user_prompt = build_profile_prompt(metadata, technologies, evidence, user_context)

    # Guard the prompt budget before any paid call. The combined system+user
    # prompt size is checked, not just the file evidence, so scaffolding text and
    # formatted context count toward the ceiling too.
    total_chars = len(_SYSTEM_PROMPT) + len(user_prompt)
    within_budget, reason = check_prompt_budget(total_chars)
    if not within_budget:
        raise ProfileGenerationError(reason, 413)

    result = completion_fn(_SYSTEM_PROMPT, user_prompt)

    # A response truncated at the output-token limit yields partial or empty JSON.
    # Surface a precise, actionable error instead of a misleading "invalid JSON".
    # This is especially likely with reasoning models, whose reasoning tokens
    # share the max_completion_tokens budget with the visible answer.
    if result.finish_reason == "length":
        raise ProfileGenerationError(
            "The model response was cut off at the output token limit. Increase "
            "OPENAI_MAX_OUTPUT_TOKENS (and/or lower OPENAI_REASONING_EFFORT) and "
            "try again.",
            502,
        )

    if not result.content.strip():
        raise ProfileGenerationError("OpenAI returned an empty response.", 502)

    # The model is asked for JSON; validate it twice over (parse + schema) so a
    # malformed or off-schema response becomes a clean error instead of leaking
    # half-formed data to the frontend.
    try:
        profile = ProjectProfile.model_validate_json(result.content)
    except ValidationError as exc:
        raise ProfileGenerationError(
            "OpenAI response did not match the expected project profile schema.",
            502,
        ) from exc
    except (json.JSONDecodeError, ValueError) as exc:
        raise ProfileGenerationError(
            "OpenAI response was not valid JSON.", 502
        ) from exc

    return profile, estimate_input_tokens(total_chars)
