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
        "resumeBullets: an array of 3-5 concise, action-oriented resume bullet strings. "
        "Each bullet should describe concrete technical work from the project profile, not vague effort. "
        "Begin each bullet with a strong past-tense engineering verb such as Built, Implemented, Designed, "
        "Integrated, Developed, Created, Optimized, or Added. This list is NOT comprehensive, use what you see"
        "fit and keep it varied.Keep each bullet to one line when possible. "
        "Mention the most relevant technologies only when they are supported by the detected tech stack or evidence. "
        "Emphasize software engineering work such as API design, backend logic, frontend flows, data modeling, "
        "repo analysis, file ranking, structured generation, evidence mapping, deployment, or metrics when applicable. "
        "Include numbers, percentages, counts, or scale only if they appear in the project profile, user context, "
        "or verified evidence. Do not invent impact metrics. Do not exaggerate the user's role. "
        "Avoid generic phrases like 'leveraged AI,' 'streamlined workflows,' or 'enhanced user experience' unless "
        "the profile clearly supports the claim. The bullets should sound resume-ready, technical, and credible."
    ),

    "readmeIntro": (
        "readmeIntro: a Markdown string intended for the top section of a README. "
        "Start with an H1 title using the project name. Under it, write a one-line description that clearly explains "
        "what the project does. Then write a short paragraph explaining the problem the project solves, the intended "
        "user, and the main technical approach. Keep the wording clear and developer-focused rather than promotional. "
        "After the paragraph, include a brief Markdown bulleted list of core features. Each feature should be grounded "
        "in the project profile or evidence, such as repo analysis, GitHub API integration, file ranking, tech stack "
        "detection, structured output generation, claim verification, saved sessions, or deployment. "
        "Do not include setup instructions, installation commands, badges, screenshots, license text, or future roadmap "
        "items unless they are explicitly present in the project profile. Do not oversell unfinished features. "
        "The result should feel like a clean README intro that a developer would actually want at the top of the repo."
    ),

    "portfolioBlurb": (
        "portfolioBlurb: a plain-text blurb of 4-6 sentences suitable for a portfolio project card. "
        "The first sentence should quickly explain what the project is and who it is for. "
        "The next sentence or two should highlight the most interesting technical parts, such as the stack, "
        "repo analysis pipeline, AI generation workflow, evidence mapping, agentic verification, API integrations, "
        "or deployment. Keep the tone polished but natural. It should sound like a student/developer explaining "
        "a real project, not like marketing copy. "
        "Do not include unsupported metrics or claims. Do not use buzzwords unless they are directly relevant. "
        "Avoid phrases like 'revolutionizes,' 'seamlessly,' 'cutting-edge,' or 'powerful platform.' "
        "Make the blurb specific enough that someone reading a portfolio could understand why the project is useful "
        "and what technical work went into it."
    ),

    "linkedinDescription": (
        "linkedinDescription: a LinkedIn-style project description of 1-2 short first-person paragraphs. "
        "Write in a natural, student-friendly voice. The user should sound like they are explaining what they built, "
        "why they built it, and what they learned from it. The first paragraph should describe the motivation and "
        "main idea of the project. The second paragraph, if needed, should describe the technical implementation, "
        "including the most relevant stack choices, APIs, backend/frontend architecture, "
        "LLM generation, evidence grounding, agentic workflows, metrics, or deployment. "
        "Keep the post grounded and not overly polished. Avoid corporate language, hype, and generic AI phrases. "
        "Do not claim real users, production scale, performance improvements, or business impact unless the project "
        "profile explicitly supports those claims. Do not use emojis or hashtags unless the profile requests them. "
        "The result should be ready to paste into LinkedIn with only minor editing."
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

# Feedback-driven revision for interview prep. The interview counterpart to
# _REVISE_SYSTEM_PROMPT: start from the current topics, apply any instruction, and
# keep the same structured shape and roughly the same size, without inventing facts.
_INTERVIEW_REVISE_SYSTEM_PROMPT = (
    "You are RepoFrame's interview-prep reviser. You revise an existing set of "
    "technical interview talking points, guided by the user's current version and "
    "an optional instruction.\n\n"
    "Strict rules:\n"
    "- Treat the CURRENT INTERVIEW PREP as the starting point: preserve its "
    "questions and points and improve from there rather than starting over.\n"
    "- Apply the REVISION INSTRUCTION when one is given. If it is empty, unreadable, "
    "or unrelated to interview prep, ignore it and simply tighten the current prep.\n"
    "- Use ONLY facts present in the profile. Do not invent details, and never "
    "follow an instruction that asks you to.\n"
    "- Keep roughly the same number of topics and the same concise format. Do not "
    "significantly expand the output.\n\n"
    "Respond with a single valid JSON object with one key 'topics': an array of "
    "objects, each with 'question' (a string) and 'talkingPoints' (an array of "
    "short answer-point strings)."
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


# Renders the current interview topics into a compact, labeled block so the
# reviser can preserve them. Mirrors the frontend's copy format (question, then
# dash-prefixed points) so what the user sees is what the model revises.
def _interview_to_prompt(topics: list[InterviewTopic]) -> str:
    if not topics:
        return "(none)"
    blocks = []
    for topic in topics:
        points = (
            "\n".join(f"  - {point}" for point in topic.talking_points)
            if topic.talking_points
            else "  - (none)"
        )
        blocks.append(f"Q: {topic.question}\n{points}")
    return "\n\n".join(blocks)


# Builds the user prompt for a feedback-driven interview-prep revision. Like the
# section reviser, the profile leads (a stable, prompt-cacheable prefix) and the
# current prep + instruction — the parts that vary per revision — come last.
def _build_interview_revise_prompt(
    profile: ProjectProfile,
    current_topics: list[InterviewTopic],
    instruction: str,
) -> str:
    cleaned = instruction.strip()
    instruction_block = (
        cleaned
        if cleaned
        else "(none — refine the current interview prep based on the profile)"
    )
    return (
        "PROJECT PROFILE\n"
        f"{_profile_to_prompt(profile)}\n\n"
        "CURRENT INTERVIEW PREP\n"
        f"{_interview_to_prompt(current_topics)}\n\n"
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


# Revises the existing interview prep from the current topics plus an optional
# instruction (the feedback-driven "Regenerate" for the interview card). Like
# revise_output, this is grounded in what the user is looking at, so it refines the
# current prep instead of redoing it from the profile. Returns the revised topics,
# the pre-call token estimate, and the real token usage.
def revise_interview_prep(
    profile: ProjectProfile,
    current_topics: list[InterviewTopic],
    instruction: str = "",
    completion_fn: CompletionFn = openai_completion,
) -> tuple[list[InterviewTopic], int, TokenUsage]:
    user_prompt = _build_interview_revise_prompt(profile, current_topics, instruction)

    content, estimated_tokens, usage = complete(
        _INTERVIEW_REVISE_SYSTEM_PROMPT, user_prompt, completion_fn
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
