import json

from pydantic import ValidationError

from app.schemas.profile import ProjectProfile, UserContextInput
from app.services.file_content_service import RepoEvidenceCollection
from app.services.github_service import GitHubRepoMetadata
from app.services.llm_client import (
    CompletionFn,
    CompletionResult,  # noqa: F401 - re-exported for callers/tests of this module
    LLMError,
    complete,
    openai_completion,
)
from app.services.tech_stack_detector import DetectedTechnology

# Project-profile generation failures are LLM errors. This alias preserves the
# original public name so existing routes and tests keep importing
# ProfileGenerationError after the shared-client split.
ProfileGenerationError = LLMError


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


# Builds the prompt, then delegates budget enforcement, the (injectable) OpenAI
# call, and truncation/empty guards to the shared llm_client.complete, and finally
# validates the returned JSON against ProjectProfile. Returns the parsed profile
# plus the pre-call token estimate for cost transparency. Failures are mapped to a
# ProfileGenerationError (LLMError) with an appropriate status for the route.
def generate_project_profile(
    metadata: GitHubRepoMetadata,
    technologies: list[DetectedTechnology],
    evidence: RepoEvidenceCollection,
    user_context: UserContextInput,
    completion_fn: CompletionFn = openai_completion,
) -> tuple[ProjectProfile, int]:
    user_prompt = build_profile_prompt(metadata, technologies, evidence, user_context)

    content, estimated_tokens = complete(_SYSTEM_PROMPT, user_prompt, completion_fn)

    # The model is asked for JSON; validate it (parse + schema) so a malformed or
    # off-schema response becomes a clean error instead of leaking half-formed data.
    try:
        profile = ProjectProfile.model_validate_json(content)
    except ValidationError as exc:
        raise ProfileGenerationError(
            "OpenAI response did not match the expected project profile schema.",
            502,
        ) from exc
    except (json.JSONDecodeError, ValueError) as exc:
        raise ProfileGenerationError(
            "OpenAI response was not valid JSON.", 502
        ) from exc

    return profile, estimated_tokens
