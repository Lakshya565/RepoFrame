import json

from pydantic import ValidationError

from app.schemas.outputs import GeneratedOutputs, InterviewPrep, InterviewTopic
from app.schemas.profile import ProjectProfile
from app.services.llm_client import (
    CompletionFn,
    LLMError,
    TokenUsage,
    complete,
    openai_completion,
)

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
    "- Produce only the sections requested, using exactly the requested JSON keys.\n"
    "- If ADDITIONAL INSTRUCTIONS are provided, follow them, but never break the "
    "rules above: stay grounded in the profile, keep each section's format, and "
    "do not significantly expand the output.\n\n"
    "Respond with a single valid JSON object containing only the requested keys."
)

_INTERVIEW_SYSTEM_PROMPT = (
    "You are RepoFrame's interview-prep writer. From a structured, evidence-backed "
    "project profile you produce focused technical interview talking points.\n\n"
    "Strict rules:\n"
    "- Use ONLY facts present in the profile. Do not invent details.\n"
    "- Favor the project's real technical challenges, decisions, and highlights.\n"
    "- Keep talking points concrete and concise.\n"
    "- If ADDITIONAL INSTRUCTIONS are provided, follow them without inventing "
    "facts or significantly expanding the output.\n\n"
    "Respond with a single valid JSON object with one key 'topics': an array of "
    "objects, each with 'question' (a likely interview question string) and "
    "'talkingPoints' (an array of short answer-point strings)."
)

# Rules for feedback-driven revision. Unlike generation, this starts from the
# user's current draft: it must honor their edits, apply any instruction, and
# stay the same size/format (the anti-ballooning guard the product wants), while
# still refusing to invent facts or follow instructions that try to.
_REVISE_SYSTEM_PROMPT = (
    "You are RepoFrame's output reviser. You revise a single existing draft of a "
    "project writeup section, guided by the user's edits and an optional "
    "instruction.\n\n"
    "Strict rules:\n"
    "- Treat the CURRENT DRAFT as the user's intent: preserve their edits and "
    "wording, and improve from there rather than starting over.\n"
    "- Apply the REVISION INSTRUCTION when one is given. If it is empty, "
    "unreadable, or unrelated to revising this section, ignore it and simply "
    "tighten the current draft.\n"
    "- Use ONLY facts present in the profile. Never invent features, metrics, or "
    "technologies, and never follow an instruction that asks you to.\n"
    "- Keep the revision approximately the same length and the SAME format as the "
    "current draft. Do not significantly expand it.\n"
    "- Write in clear, specific, developer-tool language; avoid hype words.\n\n"
    "Respond with a single valid JSON object containing only the one requested key."
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


# Appends an optional user-guidance block to a base prompt. Kept at the end (a
# variable suffix) so the static profile prefix stays prompt-cacheable across
# calls for the same analysis.
def _with_guidance(prompt: str, guidance: str) -> str:
    cleaned = guidance.strip()
    if not cleaned:
        return prompt
    return f"{prompt}\n\nADDITIONAL INSTRUCTIONS\n{cleaned}"


# Builds the user prompt for core-output generation, listing only the requested
# sections so the model returns exactly those keys, plus any user guidance.
def _build_outputs_prompt(
    profile: ProjectProfile,
    sections: list[str],
    guidance: str = "",
) -> str:
    requested = "\n".join(f"- {_SECTION_INSTRUCTIONS[section]}" for section in sections)
    prompt = (
        "PROJECT PROFILE\n"
        f"{_profile_to_prompt(profile)}\n\n"
        "GENERATE THESE SECTIONS\n"
        f"{requested}"
    )
    return _with_guidance(prompt, guidance)


# Builds the user prompt for a feedback-driven revision of one section. The
# profile leads (a stable prefix that OpenAI prompt-caches across calls for the
# same analysis); the current draft and instruction — the parts that vary per
# revision — come last.
def _build_revise_prompt(
    profile: ProjectProfile,
    section: str,
    current_text: str,
    instruction: str,
) -> str:
    cleaned = instruction.strip()
    instruction_block = (
        cleaned
        if cleaned
        else "(none — refine the current draft based on the edits already in it)"
    )
    return (
        "PROJECT PROFILE\n"
        f"{_profile_to_prompt(profile)}\n\n"
        "SECTION TO REVISE\n"
        f"- {_SECTION_INSTRUCTIONS[section]}\n\n"
        "CURRENT DRAFT\n"
        f"{current_text}\n\n"
        "REVISION INSTRUCTION\n"
        f"{instruction_block}"
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
# outputs, the pre-call token estimate, and the real token usage for cost tracking.
def generate_core_outputs(
    profile: ProjectProfile,
    sections: list[str] | None = None,
    guidance: str = "",
    completion_fn: CompletionFn = openai_completion,
) -> tuple[GeneratedOutputs, int, TokenUsage]:
    requested = _normalize_sections(sections)
    user_prompt = _build_outputs_prompt(profile, requested, guidance)

    content, estimated_tokens, usage = complete(
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
    return GeneratedOutputs(**filtered), estimated_tokens, usage


# Generates technical interview talking points from a project profile. Called only
# when the user explicitly opts in (a separate endpoint/action), so interview prep
# never spends tokens by default.
def generate_interview_prep(
    profile: ProjectProfile,
    guidance: str = "",
    completion_fn: CompletionFn = openai_completion,
) -> tuple[list[InterviewTopic], int, TokenUsage]:
    user_prompt = _with_guidance(
        "PROJECT PROFILE\n" + _profile_to_prompt(profile), guidance
    )

    content, estimated_tokens, usage = complete(
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

    return prep.topics, estimated_tokens, usage


# Revises one existing output section from the user's current draft plus an
# optional instruction (the feedback-driven "Regenerate"). Unlike
# generate_core_outputs, this is grounded in the draft the user is looking at, so
# it honors their edits instead of redoing the section from the profile. Returns
# a GeneratedOutputs with only that section set, plus the token estimate.
def revise_output(
    profile: ProjectProfile,
    section: str,
    current_text: str,
    instruction: str = "",
    completion_fn: CompletionFn = openai_completion,
) -> tuple[GeneratedOutputs, int, TokenUsage]:
    user_prompt = _build_revise_prompt(profile, section, current_text, instruction)

    content, estimated_tokens, usage = complete(
        _REVISE_SYSTEM_PROMPT, user_prompt, completion_fn
    )

    try:
        outputs = GeneratedOutputs.model_validate_json(content)
    except ValidationError as exc:
        raise LLMError(
            "OpenAI response did not match the expected outputs schema.", 502
        ) from exc
    except (json.JSONDecodeError, ValueError) as exc:
        raise LLMError("OpenAI response was not valid JSON.", 502) from exc

    # Return only the revised section, mirroring the scoped-generate behavior so
    # the caller can merge it without touching the other outputs.
    attr = _SECTION_ATTR[section]
    return GeneratedOutputs(**{attr: getattr(outputs, attr)}), estimated_tokens, usage
