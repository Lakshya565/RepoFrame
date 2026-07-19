import json
from collections.abc import Callable
from dataclasses import dataclass

from pydantic import ValidationError

from app.config import VERIFY_MAX_ITERATIONS, VERIFY_MAX_TOOL_CALLS
from app.schemas.outputs import GeneratedOutputs
from app.schemas.profile import UserContextInput
from app.schemas.verify import ClaimVerification, ClaimVerificationResult
from app.services.evidence_investigator import EvidenceWorkspace
from app.services.github_service import GitHubFileContentError
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

# The Evidence Investigator owns the bounded model loop and dispatches read-only
# tools against one request-scoped repository workspace. Unlike the former
# in-memory re-query loop, it can discover and read allowlisted files that were not
# part of the initial deterministic evidence bundle.


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

    if call.name == "search_repository":
        query = str(arguments.get("query", "")).strip()
        return f"Searching repository paths for: {query}" if query else (
            "Searching the repository index"
        )
    if call.name == "search_evidence":
        query = str(arguments.get("query", "")).strip()
        return f"Searching gathered evidence for: {query}" if query else (
            "Searching the gathered evidence"
        )
    if call.name == "read_repository_file":
        path = str(arguments.get("path", "")).strip()
        return f"Reading {path}" if path else "Reading a repository file"
    return "Inspecting the repository evidence"


# The investigator's three read-only tools. Path search operates on the safe known
# tree, file reads fetch one exact allowlisted text file, and evidence search covers
# the initial plus newly read content. There is no arbitrary URL, execution, or
# write capability.
_TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "search_repository",
            "description": (
                "Search the known repository file paths and ranking reasons for "
                "files likely to contain missing evidence. This does not read file "
                "contents; use read_repository_file on an exact returned path."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": (
                            "A concise feature, technology, subsystem, or path term."
                        ),
                    }
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_repository_file",
            "description": (
                "Read one exact allowlisted text-file path from the repository. "
                "Reads are cached and bounded. Use only after search_repository "
                "identifies a file needed to settle a claim."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The exact relative path returned by search_repository.",
                    }
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_evidence",
            "description": (
                "Search line content across all evidence read so far, including "
                "the initial bundle and files fetched with read_repository_file."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The exact term or phrase to search for.",
                    }
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
    },
]


# Defines the agent's job, the four status labels, the tool protocol, and the
# strict bound that it may use ONLY the selected evidence and user context. The
# final-answer contract (a single JSON object, no tool calls) is spelled out so the
# loop can detect completion reliably.
_SYSTEM_PROMPT = (
    "You are RepoFrame's Evidence Investigator. You check whether factual claims "
    "in generated project writeups are backed by repository evidence or the "
    "user-provided context.\n\n"
    "The strongest deterministic repository evidence is provided IN FULL below. "
    "Start with it. When it does not settle a repository-verifiable claim, use "
    "search_repository(query) to find candidate paths, read_repository_file(path) "
    "to inspect only the most relevant exact paths, and search_evidence(query) to "
    "search everything read so far. Repository index matches are leads, not "
    "evidence: cite a path only after you have seen its contents.\n\n"
    "Strict rules:\n"
    "- Base every judgment ONLY on file contents returned in the prompt/tools and "
    "the user-provided context. Do not assume or invent missing facts.\n"
    "- Investigate only when the initial evidence leaves a material gap. Do not "
    "re-read files, explore unrelated paths, or search repeatedly for facts only "
    "the user could know.\n"
    "- The user-provided context is itself valid evidence for facts the repository "
    "cannot show (ownership, intent, audience, team size, impact). A claim it backs "
    "is 'supported', cited as 'user context'. Use 'needs_user_confirmation' only "
    "when NEITHER the repo evidence NOR the provided context settles the claim.\n"
    "- The user context may include guardrails (claims to AVOID making). Treat them "
    "as hard constraints: if a generated claim asserts something a guardrail "
    "forbids, mark it 'unsupported' (cite 'user context') and give a "
    "suggestedRevision that removes or softens it, even if the repo evidence might "
    "otherwise support it.\n"
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
    "While evidence tools are available, focus only on gathering missing evidence. "
    "If no tool is needed or the evidence is sufficient, return only "
    "{\"ready\": true} with no tool calls; do not draft the verdict yet.\n\n"
    "When the user explicitly says evidence collection is complete, respond with "
    "ONLY this JSON object and NO tool calls: "
    "{\"verifications\": [{\"claim\": string, \"status\": string, "
    "\"sections\": [string], \"supportingEvidence\": [string], "
    "\"explanation\": string, \"suggestedRevision\": string or null}]}"
)

# Ends the investigation phase and asks a tool-free reasoning turn to make the
# actual claim judgments. Keeping this separate is required for Luna on Chat
# Completions: tool-enabled turns must disable reasoning, while this final turn
# can safely use the configured reasoning effort and JSON response mode.
_FINAL_VERDICT_PROMPT = (
    "Evidence collection is complete. Review every generated section, the user "
    "context, the initial repository evidence, and every tool result in this "
    "conversation. Produce the final verification result now. Return ONLY the "
    "JSON object required by the system prompt, with no markdown or commentary."
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
    workspace: EvidenceWorkspace,
    sections: list[str] | None = None,
) -> str:
    tree_note = (
        "GitHub reported a truncated tree; tools may use only paths in the known index."
        if workspace.tree_is_truncated
        else "The repository tree index is complete."
    )
    return (
        "GENERATED OUTPUTS TO VERIFY\n"
        f"{_format_claims(outputs, sections)}\n\n"
        "USER-PROVIDED CONTEXT\n"
        f"{format_user_context(user_context)}\n\n"
        "REPOSITORY SCOPE\n"
        f"{workspace.owner}/{workspace.repo}@{workspace.ref}\n"
        f"{len(workspace.repository_index)} allowlisted paths. {tree_note}\n\n"
        "INITIAL REPOSITORY EVIDENCE (selected files in full)\n"
        f"{format_evidence_excerpts(workspace.initial_evidence, '(no initial evidence files were available)')}"
    )


# Runs one tool call against the request-scoped workspace. Invalid arguments and
# unknown tools become normal tool results so Luna can recover; systemic GitHub
# failures still propagate and stop the run with the correct status.
def _dispatch_tool(workspace: EvidenceWorkspace, call: ToolCall) -> str:
    try:
        arguments = json.loads(call.arguments) if call.arguments else {}
    except json.JSONDecodeError:
        return "Tool arguments were not valid JSON. Provide a JSON object."

    if not isinstance(arguments, dict):
        return "Tool arguments must be a JSON object."

    if call.name == "search_repository":
        return workspace.search_repository(str(arguments.get("query", "")))
    if call.name == "read_repository_file":
        return workspace.read_repository_file(str(arguments.get("path", "")))
    if call.name == "search_evidence":
        return workspace.search_evidence(str(arguments.get("query", "")))
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


# Audit metadata for one bounded investigation. It is returned to the API and also
# attached to partial-failure errors so successful turns are never hidden from
# spend accounting.
@dataclass(frozen=True)
class InvestigationStats:
    model_calls: int
    tool_calls: int
    additional_files_inspected: list[str]


# Typed service result keeps the growing verification metadata explicit instead
# of relying on a positional tuple shared across route and test callers.
@dataclass(frozen=True)
class VerificationRunResult:
    verifications: list[ClaimVerification]
    estimated_input_tokens: int
    usage: TokenUsage
    investigation: InvestigationStats


# A verifier-specific LLMError carrying all spend and investigation state gathered
# before a model, parsing, or systemic GitHub failure ended the run.
class VerificationRunError(LLMError):
    def __init__(
        self,
        message: str,
        status_code: int,
        usage: TokenUsage,
        investigation: InvestigationStats,
    ) -> None:
        super().__init__(
            message,
            status_code,
            usage=usage,
            model_calls=investigation.model_calls,
        )
        self.investigation = investigation


# Builds immutable run metadata from the loop counters and workspace state.
def _investigation_stats(
    workspace: EvidenceWorkspace,
    model_calls: int,
    tool_calls: int,
) -> InvestigationStats:
    return InvestigationStats(
        model_calls=model_calls,
        tool_calls=tool_calls,
        additional_files_inspected=workspace.additional_files_inspected,
    )


# Wraps a failure with the completed-turn usage from both the running total and,
# when present, the just-failed model result (for example a truncated response).
def _verification_error(
    exc: LLMError | GitHubFileContentError,
    workspace: EvidenceWorkspace,
    total_usage: TokenUsage,
    model_calls: int,
    tool_calls: int,
) -> VerificationRunError:
    usage = total_usage
    completed_calls = model_calls
    if isinstance(exc, LLMError):
        usage = usage + exc.usage
        completed_calls += exc.model_calls
    return VerificationRunError(
        str(exc),
        exc.status_code,
        usage,
        _investigation_stats(workspace, completed_calls, tool_calls),
    )


# Runs the bounded Evidence Investigator in two phases. Up to one fewer than the
# configured maximum turns may use read-only tools; the final reserved turn has
# no tool schemas and produces the verdict. This preserves the overall model-call
# bound while using Luna's supported Chat Completions request shapes. Empty
# outputs still short-circuit without a model call.
def verify_claims(
    workspace: EvidenceWorkspace,
    outputs: GeneratedOutputs,
    user_context: UserContextInput,
    sections: list[str] | None = None,
    agent_fn: AgentCompletionFn = openai_agent_completion,
    progress: ProgressFn | None = None,
) -> VerificationRunResult:
    if not _format_claims(outputs, sections):
        return VerificationRunResult(
            verifications=[],
            estimated_input_tokens=0,
            usage=EMPTY_USAGE,
            investigation=_investigation_stats(workspace, 0, 0),
        )

    initial_prompt = _build_initial_prompt(
        outputs,
        user_context,
        workspace,
        sections,
    )
    estimated_tokens = estimate_input_tokens(len(_SYSTEM_PROMPT) + len(initial_prompt))

    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": initial_prompt},
    ]
    total_usage = EMPTY_USAGE
    tool_calls_made = 0
    model_calls_made = 0

    # The first turn is the agent reading the writeup + evidence and pulling out the
    # claims to check; signal it before the call so the UI advances as work starts.
    _emit(progress, VERIFY_STAGE_ANALYZING, None)

    investigation_turns = max(VERIFY_MAX_ITERATIONS - 1, 0)
    for _iteration in range(investigation_turns):
        # Reserve the final model call for the tool-free verdict. Once the tool
        # budget is exhausted, there is no reason to spend another investigation
        # turn.
        if tool_calls_made >= VERIFY_MAX_TOOL_CALLS:
            break
        try:
            step = complete_with_tools(
                messages,
                _TOOL_SCHEMAS,
                "auto",
                agent_fn,
            )
        except LLMError as exc:
            raise _verification_error(
                exc,
                workspace,
                total_usage,
                model_calls_made,
                tool_calls_made,
            ) from exc
        model_calls_made += 1
        total_usage = total_usage + step.usage

        # A turn with tool calls means keep gathering: run each call and append its
        # result, then loop for the model's next turn. Each call emits a "checking"
        # line describing the real evidence lookup.
        if step.tool_calls:
            messages.append(_assistant_tool_call_message(step))
            for call in step.tool_calls:
                if tool_calls_made >= VERIFY_MAX_TOOL_CALLS:
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call.id,
                            "content": (
                                "The tool-call limit is exhausted. Use the evidence "
                                "already gathered and produce the final verdict."
                            ),
                        }
                    )
                    continue

                tool_calls_made += 1
                _emit(
                    progress,
                    VERIFY_STAGE_CHECKING,
                    _describe_tool_call(call),
                )
                try:
                    tool_result = _dispatch_tool(workspace, call)
                except GitHubFileContentError as exc:
                    raise _verification_error(
                        exc,
                        workspace,
                        total_usage,
                        model_calls_made,
                        tool_calls_made,
                    ) from exc
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": tool_result,
                    }
                )
            continue

        # No requested tool means the investigator considers the available
        # evidence sufficient. Its draft content is intentionally ignored; the
        # reserved reasoning turn below owns the authoritative verdict.
        break

    _emit(progress, VERIFY_STAGE_COMPILING, None)
    final_messages = [
        *messages,
        {"role": "user", "content": _FINAL_VERDICT_PROMPT},
    ]
    try:
        final_step = complete_with_tools(
            final_messages,
            [],
            "none",
            agent_fn,
        )
    except LLMError as exc:
        raise _verification_error(
            exc,
            workspace,
            total_usage,
            model_calls_made,
            tool_calls_made,
        ) from exc

    model_calls_made += 1
    total_usage = total_usage + final_step.usage
    try:
        verifications = _parse_verifications(final_step.content)
    except LLMError as exc:
        raise _verification_error(
            exc,
            workspace,
            total_usage,
            model_calls_made,
            tool_calls_made,
        ) from exc

    return VerificationRunResult(
        verifications=verifications,
        estimated_input_tokens=estimated_tokens,
        usage=total_usage,
        investigation=_investigation_stats(
            workspace,
            model_calls_made,
            tool_calls_made,
        ),
    )
