import json
import logging
from collections.abc import Callable
from dataclasses import dataclass

from app.config import (
    OPENAI_API_KEY,
    OPENAI_MAX_OUTPUT_TOKENS,
    OPENAI_MAX_RETRIES,
    OPENAI_MODEL,
    OPENAI_REASONING_EFFORT,
    OPENAI_TIMEOUT_SECONDS,
)
from app.services.token_estimator import check_prompt_budget, estimate_input_tokens

# Shared low-level OpenAI client used by every generation service (project
# profile, core outputs, interview prep) and the claim-verification agent.
# Centralizing the call here means all of them get identical safety behavior:
# bounded timeout/retries, reasoning-model parameter handling, budget enforcement,
# truncation detection, real token-usage capture, and a single non-leaky
# error-to-status mapping. Two entry points share that plumbing: complete() for
# single-shot JSON generation, and complete_with_tools() for one turn of the
# tool-calling agent loop (the loop itself lives in the calling service).

logger = logging.getLogger(__name__)


# Actual token usage reported by OpenAI for a single call. Unlike the pre-call
# character-based estimate (token_estimator), these are the real billed counts.
# reasoning_tokens is the slice of completion_tokens spent on hidden reasoning by
# reasoning models (gpt-5.x/o-series) — broken out because it is invisible in the
# answer yet is often the bulk of the cost. __add__ lets callers fold the usage of
# every call in an analysis (e.g. each turn of the verification agent loop) into a
# single running total.
@dataclass(frozen=True)
class TokenUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    reasoning_tokens: int = 0
    total_tokens: int = 0

    def __add__(self, other: "TokenUsage") -> "TokenUsage":
        return TokenUsage(
            prompt_tokens=self.prompt_tokens + other.prompt_tokens,
            completion_tokens=self.completion_tokens + other.completion_tokens,
            reasoning_tokens=self.reasoning_tokens + other.reasoning_tokens,
            total_tokens=self.total_tokens + other.total_tokens,
        )


# A zero-usage value used as the default when no real usage is available (e.g. the
# injected fake completion functions in the offline test suite report nothing).
EMPTY_USAGE = TokenUsage()


# Carries a user-facing generation error plus the HTTP status a route should
# return. Completed-but-unusable responses preserve their usage so an agent loop
# can account for the successful API request before surfacing the failure.
class LLMError(RuntimeError):
    def __init__(
        self,
        message: str,
        status_code: int,
        usage: TokenUsage = EMPTY_USAGE,
        model_calls: int = 0,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.usage = usage
        self.model_calls = model_calls


# The raw result of one model call: response text, finish_reason (so callers can
# distinguish a complete answer from one truncated at the output-token limit,
# common with reasoning models), and the real token usage for cost tracking.
@dataclass(frozen=True)
class CompletionResult:
    content: str
    finish_reason: str | None = None
    usage: TokenUsage = EMPTY_USAGE


# A completion function takes the (system_prompt, user_prompt) pair and returns a
# CompletionResult. Making this injectable lets tests pass a fake, so the test
# suite never touches the network or spends a single token. The default is the
# real OpenAI call below.
CompletionFn = Callable[[str, str], CompletionResult]


# Module-level client cache. The OpenAI client maintains an HTTP connection pool,
# so reusing one instance across requests avoids repeated connection/TLS setup.
# It is built lazily (the key may be unset at import time) with explicit timeout
# and retry bounds rather than the SDK's 10-minute default.
_client = None


def _get_client():
    global _client
    if _client is None:
        if not OPENAI_API_KEY:
            raise LLMError("OPENAI_API_KEY is not configured on the backend.", 500)
        try:
            from openai import OpenAI
        except ImportError as exc:  # pragma: no cover - environment/setup issue
            raise LLMError(
                "The openai package is not installed on the backend.", 500
            ) from exc
        _client = OpenAI(
            api_key=OPENAI_API_KEY,
            timeout=OPENAI_TIMEOUT_SECONDS,
            max_retries=OPENAI_MAX_RETRIES,
        )
    return _client


# Builds Luna's create() kwargs. json_object forces valid JSON (the schema is
# enforced afterwards by validating against a Pydantic model).
def _build_create_kwargs(system_prompt: str, user_prompt: str) -> dict:
    return {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "response_format": {"type": "json_object"},
        "max_completion_tokens": OPENAI_MAX_OUTPUT_TOKENS,
        "reasoning_effort": OPENAI_REASONING_EFFORT,
    }


# Issues one chat-completion request and maps every transport/API failure to a
# specific, non-leaky LLMError status. openai (client + error types) is imported
# lazily so the rest of the app and the whole test suite work without the package
# installed or a key configured. Shared by the single-shot and tool-calling paths
# so error handling stays identical for both.
def _create_chat_completion(**kwargs):
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
        raise LLMError(
            "The openai package is not installed on the backend.", 500
        ) from exc

    try:
        return client.chat.completions.create(**kwargs)
    except APITimeoutError as exc:
        raise LLMError("The request to OpenAI timed out. Please try again.", 504) from exc
    except RateLimitError as exc:
        raise LLMError(
            "OpenAI's rate limit was reached. Please retry in a moment.", 429
        ) from exc
    except AuthenticationError as exc:
        logger.error("OpenAI rejected the backend credentials: %s", exc)
        raise LLMError("The backend's OpenAI credentials were rejected.", 500) from exc
    except APIConnectionError as exc:
        raise LLMError("Could not reach OpenAI. Please try again.", 503) from exc
    except BadRequestError as exc:
        # Malformed request or a parameter the chosen model does not support.
        logger.error("OpenAI rejected the request: %s", exc)
        raise LLMError("OpenAI rejected the generation request.", 502) from exc
    except Exception as exc:  # noqa: BLE001 - last-resort guard for any SDK error
        logger.exception("Unexpected error during OpenAI generation")
        raise LLMError("Generation failed due to an unexpected error.", 502) from exc


# The default completion function: the only place that actually contacts OpenAI
# and spends tokens for single-shot JSON generation (profile, outputs, interview).
def openai_completion(system_prompt: str, user_prompt: str) -> CompletionResult:
    response = _create_chat_completion(
        **_build_create_kwargs(system_prompt, user_prompt)
    )
    choice = response.choices[0]
    return CompletionResult(
        content=choice.message.content or "",
        finish_reason=choice.finish_reason,
        usage=_usage_from_response(response),
    )


# Reads the real token counts off an OpenAI response into our TokenUsage shape.
# The SDK may omit usage or the reasoning-token detail (older models, streaming),
# so every field is read defensively and defaults to zero rather than failing a
# successful generation over missing accounting data.
def _usage_from_response(response) -> TokenUsage:
    usage = getattr(response, "usage", None)
    if usage is None:
        return EMPTY_USAGE

    details = getattr(usage, "completion_tokens_details", None)
    reasoning = getattr(details, "reasoning_tokens", 0) if details else 0

    return TokenUsage(
        prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
        completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
        reasoning_tokens=reasoning or 0,
        total_tokens=getattr(usage, "total_tokens", 0) or 0,
    )


# Enforces the input budget BEFORE any paid call, runs the (injectable) completion
# function, and guards against truncated or empty output. Returns the raw JSON
# text, the pre-call token estimate, and the real post-call token usage; callers
# validate the text against their own Pydantic schema and surface the usage for
# cost tracking. Centralizing this keeps every generator's safety identical.
def complete(
    system_prompt: str,
    user_prompt: str,
    completion_fn: CompletionFn = openai_completion,
) -> tuple[str, int, TokenUsage]:
    total_chars = len(system_prompt) + len(user_prompt)
    within_budget, reason = check_prompt_budget(total_chars)
    if not within_budget:
        raise LLMError(reason, 413)

    result = completion_fn(system_prompt, user_prompt)

    # A response truncated at the output-token limit yields partial/empty JSON.
    # Surface a precise, actionable error instead of a misleading "invalid JSON".
    if result.finish_reason == "length":
        raise LLMError(
            "The model response was cut off at the output token limit. Increase "
            "OPENAI_MAX_OUTPUT_TOKENS (and/or lower OPENAI_REASONING_EFFORT) and "
            "try again.",
            502,
            usage=result.usage,
            model_calls=1,
        )

    if not result.content.strip():
        raise LLMError(
            "OpenAI returned an empty response.",
            502,
            usage=result.usage,
            model_calls=1,
        )

    return result.content, estimate_input_tokens(total_chars), result.usage


# ── Tool-calling (agent) path ────────────────────────────────────────────────
# Used by the Phase 12 claim-verification agent. Unlike the single-shot path, the
# model runs in a loop: it may ask to call evidence tools, see the results, and
# decide what to do next before answering. This module owns ONE model turn; the
# loop, the tools, and their dispatch live in the calling service (claim_verifier)
# so the agent's behavior stays out of the low-level client.


# One tool call the model wants the caller to run. `arguments` is the raw JSON
# string the model produced; the caller parses and validates it before acting.
@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: str


# The result of one agent turn: free-text content (the final answer when there are
# no tool calls), any tool calls the model wants run next, the finish_reason, and
# the turn's token usage so the loop can sum spend across every turn.
@dataclass(frozen=True)
class AgentStep:
    content: str | None
    tool_calls: list[ToolCall]
    finish_reason: str | None
    usage: TokenUsage


# An agent completion function takes the running message list, the tool schemas,
# and a tool_choice, and returns one AgentStep. Injectable so tests drive the loop
# with a scripted fake (tool call -> result -> final answer) without any network.
AgentCompletionFn = Callable[..., AgentStep]


# Builds Luna kwargs for either an investigation or verdict turn. Chat
# Completions rejects function tools when Luna reasoning is enabled, so every
# tool-enabled turn uses reasoning_effort="none". Tool-free turns restore the
# configured effort and request JSON mode for the final evidence judgment.
def _build_agent_kwargs(
    messages: list[dict], tools: list[dict], tool_choice: str
) -> dict:
    kwargs: dict = {
        "model": OPENAI_MODEL,
        "messages": messages,
        "max_completion_tokens": OPENAI_MAX_OUTPUT_TOKENS,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = tool_choice
        kwargs["reasoning_effort"] = "none"
    else:
        kwargs["response_format"] = {"type": "json_object"}
        kwargs["reasoning_effort"] = OPENAI_REASONING_EFFORT
    return kwargs


# The default agent completion function: contacts OpenAI for one tool-calling turn
# and normalizes the response into an AgentStep.
def openai_agent_completion(
    messages: list[dict], tools: list[dict], tool_choice: str = "auto"
) -> AgentStep:
    response = _create_chat_completion(
        **_build_agent_kwargs(messages, tools, tool_choice)
    )
    choice = response.choices[0]
    message = choice.message
    tool_calls = [
        ToolCall(
            id=call.id,
            name=call.function.name,
            arguments=call.function.arguments or "",
        )
        for call in (message.tool_calls or [])
    ]
    return AgentStep(
        content=message.content,
        tool_calls=tool_calls,
        finish_reason=choice.finish_reason,
        usage=_usage_from_response(response),
    )


# Counts the serialized messages, tool schemas, and tool-call arguments because
# all of them consume context across agent turns.
def agent_request_chars(messages: list[dict], tools: list[dict]) -> int:
    return len(json.dumps({"messages": messages, "tools": tools}, ensure_ascii=False))


# Runs one agent turn through the same safety gate as the single-shot path: the
# input budget is checked BEFORE the paid call, and a turn truncated at the output
# limit becomes a clear error. The loop itself (dispatching tool calls, appending
# results, enforcing the iteration/tool caps) lives in the caller.
def complete_with_tools(
    messages: list[dict],
    tools: list[dict],
    tool_choice: str = "auto",
    agent_fn: AgentCompletionFn = openai_agent_completion,
) -> AgentStep:
    total_chars = agent_request_chars(messages, tools)
    within_budget, reason = check_prompt_budget(total_chars)
    if not within_budget:
        raise LLMError(reason, 413)

    step = agent_fn(messages, tools, tool_choice)

    if step.finish_reason == "length":
        raise LLMError(
            "The model response was cut off at the output token limit. Increase "
            "OPENAI_MAX_OUTPUT_TOKENS (and/or lower OPENAI_REASONING_EFFORT) and "
            "try again.",
            502,
            usage=step.usage,
            model_calls=1,
        )

    return step
