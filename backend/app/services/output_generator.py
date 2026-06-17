import json

from pydantic import ValidationError

from app.schemas.outputs import GeneratedOutputs, InterviewPrep, InterviewTopic
from app.schemas.profile import ProjectProfile
from app.services.llm_client import CompletionFn, LLMError, complete, openai_completion

# Phase 11 core-output and interview-prep generation. Both consume the structured
# ProjectProfile from Phase 10 (not raw repo evidence), which keeps prompts small
# and the outputs grounded in already-evidenced facts. The actual OpenAI call,
# budgeting, and error handling live in llm_client; this module owns the prompts
# and the section scoping.


# Each requestable section maps to (a) the instruction the model receives and
# (b) the GeneratedOutputs attribute it fills. Driving both the prompt and the
# response filtering from one table keeps the section set defined in a single place.
_SECTION_INSTRUCTIONS = {
    "resumeBullets": (
        "resumeBullets: an array of 3-5 concise, action-oriented resume bullet "
        "strings. Begin each with a strong past-tense verb, keep each to a single "
        "line, and include numbers only when they appear in the profile."
    ),
    "readmeIntro": (
        "readmeIntro: a Markdown string for the top of a README — an H1 title, a "
        "one-line description, a short paragraph on what the project does and why, "
        "and a brief bulleted list of core features."
    ),
    "portfolioBlurb": (
        "portfolioBlurb: a plain-text blurb of 2-4 sentences suitable for a "
        "portfolio project card."
    ),
    "linkedinDescription": (
        "linkedinDescription: a LinkedIn-style project description of 1-2 short "
        "first-person paragraphs."
    ),
}

# Section name -> GeneratedOutputs attribute, used to keep only the requested
# sections after validation (so a scoped regenerate never overwrites others).
_SECTION_ATTR = {
    "resumeBullets": "resume_bullets",
    "readmeIntro": "readme_intro",
    "portfolioBlurb": "portfolio_blurb",
    "linkedinDescription": "linkedin_description",
}

ALL_SECTIONS = tuple(_SECTION_INSTRUCTIONS.keys())


# Grounding + tone rules for the core outputs. The hype-word ban keeps RepoFrame
# reading like a developer tool rather than a generic AI writer (per AGENTS.md).
_OUTPUTS_SYSTEM_PROMPT = (
    "You are RepoFrame's output writer. You turn a structured, evidence-backed "
    "project profile into polished written outputs for resumes, READMEs, and "
    "portfolios. Especially avoid overpromising or using vague terms, and make sure "
    "all of your outputs are grounded in the provided evidence and are ATS-friendly.\n\n"
    "Strict rules:\n"
    "- Use ONLY facts present in the profile below. Never invent features, "
    "metrics, technologies, or outcomes.\n"
    "- Write in clear, specific, developer-tool language. Avoid hype words such "
    "as 'AI magic', 'dream job', 'revolutionary', or 'cutting-edge'.\n"
    "- Produce only the sections requested, using exactly the requested JSON keys.\n\n"
    "Respond with a single valid JSON object containing only the requested keys."
)

_INTERVIEW_SYSTEM_PROMPT = (
    "You are RepoFrame's interview-prep writer. From a structured, evidence-backed "
    "project profile you produce focused technical interview talking points.\n\n"
    "Strict rules:\n"
    "- Use ONLY facts present in the profile. Do not invent details.\n"
    "- Favor the project's real technical challenges, decisions, and highlights.\n"
    "- Keep talking points concrete and concise.\n\n"
    "Respond with a single valid JSON object with one key 'topics': an array of "
    "objects, each with 'question' (a likely interview question string) and "
    "'talkingPoints' (an array of short answer-point strings)."
)


# Renders the structured profile into a compact, labeled block for the prompt.
# The evidence links are included so grounded claims can carry into the outputs.
def _profile_to_prompt(profile: ProjectProfile) -> str:
    def bullets(items: list[str]) -> str:
        return "\n".join(f"  - {item}" for item in items) if items else "  - (none)"

    evidence = (
        "\n".join(f"  - {e.claim} (source: {e.source})" for e in profile.evidence)
        if profile.evidence
        else "  - (none)"
    )

    return (
        f"Project name: {profile.project_name}\n"
        f"Summary: {profile.two_sentence_summary}\n"
        f"Problem: {profile.problem}\n"
        f"Solution: {profile.solution}\n"
        f"Tech stack: {', '.join(profile.detected_tech_stack) or '(none)'}\n"
        f"Core features:\n{bullets(profile.core_features)}\n"
        f"Technical highlights:\n{bullets(profile.technical_highlights)}\n"
        f"User contribution: {profile.user_contribution}\n"
        f"Technical challenges:\n{bullets(profile.technical_challenges)}\n"
        f"Resume angles:\n{bullets(profile.resume_angles)}\n"
        f"Supporting evidence:\n{evidence}"
    )


# Builds the user prompt for core-output generation, listing only the requested
# sections so the model returns exactly those keys.
def _build_outputs_prompt(profile: ProjectProfile, sections: list[str]) -> str:
    requested = "\n".join(f"- {_SECTION_INSTRUCTIONS[section]}" for section in sections)
    return (
        "PROJECT PROFILE\n"
        f"{_profile_to_prompt(profile)}\n\n"
        "GENERATE THESE SECTIONS\n"
        f"{requested}"
    )


# Removes duplicates while preserving order, defaulting to all sections when the
# request does not scope them.
def _normalize_sections(sections: list[str] | None) -> list[str]:
    if not sections:
        return list(ALL_SECTIONS)

    ordered: list[str] = []
    for section in sections:
        if section not in ordered:
            ordered.append(section)
    return ordered


# Generates the requested core outputs from a project profile in one model call.
# Validates the JSON against GeneratedOutputs, then returns only the requested
# sections so a scoped regenerate never clobbers untouched outputs. Returns the
# outputs plus the pre-call token estimate for cost transparency.
def generate_core_outputs(
    profile: ProjectProfile,
    sections: list[str] | None = None,
    completion_fn: CompletionFn = openai_completion,
) -> tuple[GeneratedOutputs, int]:
    requested = _normalize_sections(sections)
    user_prompt = _build_outputs_prompt(profile, requested)

    content, estimated_tokens = complete(
        _OUTPUTS_SYSTEM_PROMPT, user_prompt, completion_fn
    )

    try:
        outputs = GeneratedOutputs.model_validate_json(content)
    except ValidationError as exc:
        raise LLMError(
            "OpenAI response did not match the expected outputs schema.", 502
        ) from exc
    except (json.JSONDecodeError, ValueError) as exc:
        raise LLMError("OpenAI response was not valid JSON.", 502) from exc

    # Keep only the requested sections; everything else stays null in the result.
    filtered = {
        _SECTION_ATTR[section]: getattr(outputs, _SECTION_ATTR[section])
        for section in requested
    }
    return GeneratedOutputs(**filtered), estimated_tokens


# Generates technical interview talking points from a project profile. Called only
# when the user explicitly opts in (a separate endpoint/action), so interview prep
# never spends tokens by default.
def generate_interview_prep(
    profile: ProjectProfile,
    completion_fn: CompletionFn = openai_completion,
) -> tuple[list[InterviewTopic], int]:
    user_prompt = "PROJECT PROFILE\n" + _profile_to_prompt(profile)

    content, estimated_tokens = complete(
        _INTERVIEW_SYSTEM_PROMPT, user_prompt, completion_fn
    )

    try:
        prep = InterviewPrep.model_validate_json(content)
    except ValidationError as exc:
        raise LLMError(
            "OpenAI response did not match the expected interview-prep schema.", 502
        ) from exc
    except (json.JSONDecodeError, ValueError) as exc:
        raise LLMError("OpenAI response was not valid JSON.", 502) from exc

    return prep.topics, estimated_tokens
