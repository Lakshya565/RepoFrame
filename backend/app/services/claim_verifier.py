import json
from collections.abc import Callable
from pathlib import PurePosixPath

from pydantic import ValidationError

from app.config import VERIFY_MAX_ITERATIONS, VERIFY_MAX_TOOL_CALLS
from app.schemas.outputs import GeneratedOutputs
from app.schemas.profile import UserContextInput
from app.schemas.verify import ClaimVerification, ClaimVerificationResult
from app.services.file_content_service import RepoEvidenceCollection
from app.services.llm_client import (
    EMPTY_USAGE,
    AgentCompletionFn,
    AgentStep,
    LLMError,
    TokenUsage,
    ToolCall,
    complete_with_tools,
    openai_agent_completion,
)
from app.services.prompt_format import format_evidence_excerpts, format_user_context
from app.services.token_estimator import estimate_input_tokens

# Phase 12 agentic claim verification. This service owns the bounded agent LOOP:
# it gives the model two read-only tools over the already-selected repo evidence,
# runs turns until the model returns a verdict (or a cap is hit), and parses the
# final JSON. The single model turn and all OpenAI/error/budget plumbing live in
# llm_client; the tools only read in-memory evidence, so the agent can never fetch
# new files or run repo code (the safety bounds Phase 12 requires).

# Snippet bounds for search_evidence so a broad query cannot return a huge, costly
# tool result that balloons the next turn's prompt.
_MAX_SEARCH_MATCHES_PER_FILE = 8
_MAX_SEARCH_LINES = 40
_SNIPPET_MAX_CHARS = 200


# Progress stages the verification run passes through, in display order. These are
# REAL milestones, not a timed animation: the streaming endpoint emits one as each
# is genuinely reached so the UI checklist tracks the agent's actual work.
#   - gathering_evidence: the deterministic repo pipeline rebuilds the evidence
#     bundle (emitted by the router, before the agent starts).
#   - analyzing: the agent's first turn — it reads the writeup + evidence and
#     extracts the discrete claims.
#   - checking: the agent calls a read-only evidence tool (search / read a file);
#     each call carries a human detail of what it is actually inspecting.
#   - compiling: the agent is producing/parsing its final verdict.
# The constants are shared so the router (which owns the evidence stage) and the
# frontend agree on one closed vocabulary.
VERIFY_STAGE_EVIDENCE = "gathering_evidence"
VERIFY_STAGE_ANALYZING = "analyzing"
VERIFY_STAGE_CHECKING = "checking"
VERIFY_STAGE_COMPILING = "compiling"

# A progress sink: called with (stage, detail) as each real milestone is reached.
# detail is a short human description (used for the per-tool-call "checking" lines)
# or None. Optional everywhere — the non-streaming path passes nothing, so the
# whole agent loop runs identically with progress reporting simply turned off.
ProgressFn = Callable[[str, str | None], None]


# Fires a progress event when a sink is attached; a no-op otherwise, so threading
# progress through the loop never changes behavior when no one is listening.
def _emit(progress: ProgressFn | None, stage: str, detail: str | None) -> None:
    if progress is not None:
        progress(stage, detail)


# Turns one tool call into a human "checking" line for the live UI. Reads the
# tool's own arguments so the line reflects what the agent is ACTUALLY doing
# (which term it is searching for, which file it is reading) rather than a generic
# placeholder. Bad/old arguments degrade to a generic phrasing rather than raising.
def _describe_tool_call(call: ToolCall) -> str:
    try:
        arguments = json.loads(call.arguments) if call.arguments else {}
    except json.JSONDecodeError:
        arguments = {}
    if not isinstance(arguments, dict):
        arguments = {}

    if call.name == "search_evidence":
        query = str(arguments.get("query", "")).strip()
        return f"Searching the evidence for: {query}" if query else (
            "Searching the repository evidence"
        )
    if call.name == "read_evidence_file":
        path = str(arguments.get("path", "")).strip()
        return f"Reading {path}" if path else "Reading an evidence file"
    return "Inspecting the repository evidence"


# The two tools the agent may call, in OpenAI function-tool schema form. Both are
# read-only over the selected evidence: search locates terms, read returns one
# file's excerpt. There is deliberately no tool to fetch new files or run code.
_TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "search_evidence",
            "description": (
                "Search the already-selected repository evidence files for a "
                "term or phrase. Returns matching lines with their file path and "
                "line number. Use this to find where a claim is (or is not) backed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The term or phrase to search for.",
                    }
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_evidence_file",
            "description": (
                "Read the selected excerpt of one evidence file by its exact path "
                "(as listed in the available evidence files). Use this to read the "
                "surrounding context after a search."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The exact evidence file path to read.",
                    }
                },
                "required": ["path"],
            },
        },
    },
]


# Defines the agent's job, the four status labels, the tool protocol, and the
# strict bound that it may use ONLY the selected evidence and user context. The
# final-answer contract (a single JSON object, no tool calls) is spelled out so the
# loop can detect completion reliably.
_SYSTEM_PROMPT = (
    "You are RepoFrame's claim-verification agent. You check whether the factual "
    "claims in generated project writeups are actually backed by the repository "
    "evidence and the user-provided context.\n\n"
    "The selected repository evidence is provided IN FULL below, under REPOSITORY "
    "EVIDENCE. Read it — it is the primary thing you judge against. Two optional "
    "tools let you re-query it if a file is long: search_evidence(query) finds a "
    "term across the evidence, and read_evidence_file(path) re-shows one file by "
    "its exact path. You do not need the tools to see the evidence; it is already "
    "shown to you.\n\n"
    "Strict rules:\n"
    "- Base every judgment ONLY on the evidence below and the user-provided "
    "context. Do not assume, fetch, or invent anything outside them.\n"
    "- The user-provided context is itself valid evidence for facts the repository "
    "cannot show (ownership, intent, audience, team size, impact). A claim it backs "
    "is 'supported', cited as 'user context'. Use 'needs_user_confirmation' only "
    "when NEITHER the repo evidence NOR the provided context settles the claim.\n"
    "- Identify the discrete factual claims across the generated outputs. Cover "
    "EVERY section shown below — do not stop after the first one, and include "
    "claims that appear only in a prose section (README intro, blurb, LinkedIn).\n"
    "- A fact stated in more than one section is ONE claim: merge the duplicates "
    "into a single entry, and set its 'sections' to the list of section keys "
    "(shown as 'section key: ...') where it appears.\n"
    "- Check each claim against the evidence and context, and assign a status:\n"
    "  - supported: the evidence or context directly backs it.\n"
    "  - partially_supported: some support, but the claim overstates or generalizes.\n"
    "  - needs_user_confirmation: plausible but only the user can confirm it (e.g. "
    "impact numbers, intent, ownership) and the user context does not settle it.\n"
    "  - unsupported: nothing in the evidence or context backs it.\n"
    "- Judge a compound claim (one that bundles several facts, e.g. 'Built with "
    "Python and TypeScript') by its WEAKEST part: if ANY part is unsupported or "
    "overstated, the whole claim is at most 'partially_supported' (or 'unsupported') "
    "— never 'supported'.\n"
    "- List the sources you actually used in supportingEvidence (file paths, or "
    "'user context'). Give a suggestedRevision ONLY for 'partially_supported' or "
    "'unsupported' claims; 'supported' and 'needs_user_confirmation' claims MUST set "
    "suggestedRevision to null. A 'supported' status together with a non-null "
    "suggestedRevision is a contradiction: if a claim needs rewording, it is not "
    "'supported'.\n\n"
    "When every claim is checked, respond with ONLY this JSON object and NO tool "
    "calls: {\"verifications\": [{\"claim\": string, \"status\": string, "
    "\"sections\": [string], \"supportingEvidence\": [string], "
    "\"explanation\": string, \"suggestedRevision\": string or null}]}"
)


# The output tabs in display order, each with its human label and the canonical
# section key the agent must use when tagging which tabs a claim appears in.
_SECTION_LABELS = {
    "resumeBullets": "Resume bullets",
    "readmeIntro": "README intro",
    "portfolioBlurb": "Portfolio blurb",
    "linkedinDescription": "LinkedIn description",
}


# Reads one tab's text from the outputs (resume bullets joined one per line, prose
# sections as-is), or None when that tab has no content.
def _section_text(outputs: GeneratedOutputs, key: str) -> str | None:
    if key == "resumeBullets":
        if not outputs.resume_bullets:
            return None
        return "\n".join(f"  - {bullet}" for bullet in outputs.resume_bullets)
    if key == "readmeIntro":
        return outputs.readme_intro or None
    if key == "portfolioBlurb":
        return outputs.portfolio_blurb or None
    if key == "linkedinDescription":
        return outputs.linkedin_description or None
    return None


# Formats the generated outputs into labeled claim blocks, one per tab that has
# content. Each block names its canonical section key so the agent can tag every
# claim with the tab(s) it appears in. An optional sections list scopes a per-tab
# verification to specific tabs; None means every tab with content.
def _format_claims(
    outputs: GeneratedOutputs, sections: list[str] | None = None
) -> str:
    requested = set(sections) if sections else None
    blocks: list[str] = []
    for key, label in _SECTION_LABELS.items():
        if requested is not None and key not in requested:
            continue
        text = _section_text(outputs, key)
        if text:
            blocks.append(f"{label} (section key: {key}):\n{text}")
    return "\n\n".join(blocks)


# Builds the initial user message: the claims to verify (optionally scoped to
# specific tabs), the user context, and the full selected evidence inline (the
# evidence is shown directly so the agent never judges blind; the optional tools
# can also re-query it). User-context and evidence formatting are shared with
# profile generation via prompt_format.
def _build_initial_prompt(
    outputs: GeneratedOutputs,
    user_context: UserContextInput,
    evidence: RepoEvidenceCollection,
    sections: list[str] | None = None,
) -> str:
    return (
        "GENERATED OUTPUTS TO VERIFY\n"
        f"{_format_claims(outputs, sections)}\n\n"
        "USER-PROVIDED CONTEXT\n"
        f"{format_user_context(user_context)}\n\n"
        "REPOSITORY EVIDENCE (the selected files in full; the tools can re-query these)\n"
        f"{format_evidence_excerpts(evidence, '(no evidence files were available)')}"
    )


# search_evidence tool: case-insensitive line search across the selected files,
# bounded so a broad query cannot return an enormous result. Returns matches with
# file path and 1-based line numbers.
def _search_evidence(evidence: RepoEvidenceCollection, query: str) -> str:
    needle = query.strip().lower()
    if not needle:
        return "Provide a non-empty query to search for."

    lines_out: list[str] = []
    for file in evidence.selected_files:
        matches = 0
        for number, line in enumerate(file.content.splitlines(), start=1):
            if needle in line.lower():
                snippet = line.strip()[:_SNIPPET_MAX_CHARS]
                lines_out.append(f"{file.path}:L{number}: {snippet}")
                matches += 1
                if matches >= _MAX_SEARCH_MATCHES_PER_FILE:
                    break
            if len(lines_out) >= _MAX_SEARCH_LINES:
                break
        if len(lines_out) >= _MAX_SEARCH_LINES:
            break

    if not lines_out:
        return f"No matches for '{query}' in the selected evidence."
    return "\n".join(lines_out)


# read_evidence_file tool: returns one selected file's excerpt. Matching is
# tolerant — exact path, else case-insensitive path, else basename — so a slightly
# off path (e.g. "readme.md" vs "README.md") does not dead-end the agent. A genuine
# miss returns the available paths so the model can correct itself rather than fail.
def _read_evidence_file(evidence: RepoEvidenceCollection, path: str) -> str:
    target = path.strip().lower()
    for file in evidence.selected_files:
        if file.path == path or file.path.lower() == target or (
            PurePosixPath(file.path).name.lower() == target
        ):
            return f"{file.path} [{file.source_type}]:\n{file.content}"

    available = "\n".join(f"- {file.path}" for file in evidence.selected_files)
    return (
        f"No selected evidence file at '{path}'. Available paths:\n{available}"
        if available
        else f"No selected evidence file at '{path}'. There is no evidence available."
    )


# Runs one tool call against the in-memory evidence and returns its text result.
# Bad arguments or an unknown tool become a normal tool result (so the model can
# recover) rather than an exception that aborts the run.
def _dispatch_tool(evidence: RepoEvidenceCollection, call: ToolCall) -> str:
    try:
        arguments = json.loads(call.arguments) if call.arguments else {}
    except json.JSONDecodeError:
        return "Tool arguments were not valid JSON. Provide a JSON object."

    if not isinstance(arguments, dict):
        return "Tool arguments must be a JSON object."

    if call.name == "search_evidence":
        return _search_evidence(evidence, str(arguments.get("query", "")))
    if call.name == "read_evidence_file":
        return _read_evidence_file(evidence, str(arguments.get("path", "")))
    return f"Unknown tool '{call.name}'."


# Rebuilds the assistant message that requested tools, in the OpenAI shape, so the
# tool-result messages that follow it stay valid in the conversation history.
def _assistant_tool_call_message(step: AgentStep) -> dict:
    return {
        "role": "assistant",
        "content": step.content or "",
        "tool_calls": [
            {
                "id": call.id,
                "type": "function",
                "function": {"name": call.name, "arguments": call.arguments},
            }
            for call in step.tool_calls
        ],
    }


# Enforces the status/revision invariant the prompt asks for, in case the model
# violates it anyway: a "supported" claim is, by definition, backed exactly as
# written, so it cannot also carry a suggested rewrite. When the model returns
# both — e.g. a compound "Python and TypeScript" claim it backs for one language
# but not the other — the revision flags a real gap, so we trust it and downgrade
# the status to partially_supported, keeping the badge and the advice consistent.
def _reconcile_status(verification: ClaimVerification) -> ClaimVerification:
    has_revision = bool((verification.suggested_revision or "").strip())
    if verification.status == "supported" and has_revision:
        return verification.model_copy(update={"status": "partially_supported"})
    return verification


# Extracts the JSON object from the model's final message and validates it against
# ClaimVerificationResult. Tolerates the model wrapping the JSON in markdown fences
# or stray prose by falling back to the outermost {...} block. Each parsed claim is
# passed through _reconcile_status so an internally inconsistent verdict cannot
# reach the UI.
def _parse_verifications(content: str | None) -> list[ClaimVerification]:
    text = (content or "").strip()
    if not text:
        raise LLMError("The verification agent returned an empty result.", 502)

    for candidate in (text, _extract_json_object(text)):
        if candidate is None:
            continue
        try:
            verifications = ClaimVerificationResult.model_validate_json(
                candidate
            ).verifications
        except (ValidationError, ValueError):
            continue
        return [_reconcile_status(verification) for verification in verifications]

    raise LLMError(
        "The verification agent did not return a valid result.", 502
    )


# Returns the substring from the first '{' to the last '}', or None if there is no
# brace pair — a cheap way to recover JSON wrapped in fences or commentary.
def _extract_json_object(text: str) -> str | None:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return None
    return text[start : end + 1]


# Runs the bounded verification agent over the already-selected evidence and the
# generated outputs. Loops up to VERIFY_MAX_ITERATIONS model turns: on each turn
# the model may call the evidence tools (capped by VERIFY_MAX_TOOL_CALLS in total),
# and the loop feeds the results back; the final allowed turn (or the turn after
# the tool budget is spent) forces a no-tools answer so the run always ends with a
# verdict. Returns the verifications, the initial-prompt token estimate, and the
# token usage summed across every turn. An optional sections list scopes a per-tab
# verification to specific output tabs (None = every tab with content). When there
# are no claims to check, it short-circuits without any OpenAI call so it never
# spends tokens for nothing. An optional progress sink is called as each real stage
# (analyzing -> per-tool-call checking -> compiling) is reached, so a streaming
# caller can drive a live UI; passing nothing runs the loop identically but silent.
def verify_claims(
    evidence: RepoEvidenceCollection,
    outputs: GeneratedOutputs,
    user_context: UserContextInput,
    sections: list[str] | None = None,
    agent_fn: AgentCompletionFn = openai_agent_completion,
    progress: ProgressFn | None = None,
) -> tuple[list[ClaimVerification], int, TokenUsage]:
    if not _format_claims(outputs, sections):
        return [], 0, EMPTY_USAGE

    initial_prompt = _build_initial_prompt(outputs, user_context, evidence, sections)
    estimated_tokens = estimate_input_tokens(len(_SYSTEM_PROMPT) + len(initial_prompt))

    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": initial_prompt},
    ]
    total_usage = EMPTY_USAGE
    tool_calls_made = 0

    # The first turn is the agent reading the writeup + evidence and pulling out the
    # claims to check; signal it before the call so the UI advances as work starts.
    _emit(progress, VERIFY_STAGE_ANALYZING, None)

    for iteration in range(VERIFY_MAX_ITERATIONS):
        # Force a final, no-tools answer on the last allowed turn or once the tool
        # budget is exhausted, so the loop cannot end without a verdict.
        force_final = (
            iteration == VERIFY_MAX_ITERATIONS - 1
            or tool_calls_made >= VERIFY_MAX_TOOL_CALLS
        )
        # A forced-final turn IS the verdict turn, so surface "compiling" before it
        # (that is where a reasoning model spends the verdict-generation time).
        if force_final:
            _emit(progress, VERIFY_STAGE_COMPILING, None)
        tool_choice = "none" if force_final else "auto"

        step = complete_with_tools(messages, _TOOL_SCHEMAS, tool_choice, agent_fn)
        total_usage = total_usage + step.usage

        # A turn with tool calls (and tools still allowed) means keep gathering: run
        # each call and append its result, then loop for the model's next turn. Each
        # call emits a "checking" line describing the real evidence lookup.
        if step.tool_calls and not force_final:
            messages.append(_assistant_tool_call_message(step))
            for call in step.tool_calls:
                tool_calls_made += 1
                _emit(progress, VERIFY_STAGE_CHECKING, _describe_tool_call(call))
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": _dispatch_tool(evidence, call),
                    }
                )
            continue

        # Otherwise this is the final answer: signal compiling (no-op if a forced
        # turn already did) and parse the verdict.
        _emit(progress, VERIFY_STAGE_COMPILING, None)
        return _parse_verifications(step.content), estimated_tokens, total_usage

    # Unreachable in practice (the last turn forces a final answer), but guards
    # against a future change to the loop bounds.
    raise LLMError("The verification agent did not converge on a result.", 502)
