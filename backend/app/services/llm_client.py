import logging
from collections.abc import Callable
from dataclasses import dataclass

from app.config import (
    OPENAI_API_KEY,
    OPENAI_MAX_OUTPUT_TOKENS,
    OPENAI_MAX_RETRIES,
    OPENAI_MODEL,
    OPENAI_REASONING_EFFORT,
    OPENAI_TEMPERATURE,
    OPENAI_TIMEOUT_SECONDS,
)
from app.services.token_estimator import check_prompt_budget, estimate_input_tokens

# Shared low-level OpenAI client used by every generation service (project
# profile, core outputs, interview prep). Centralizing the call here means all
# generators get identical safety behavior: bounded timeout/retries, reasoning-
# model parameter handling, budget enforcement, truncation detection, and a
# single non-leaky error-to-status mapping.

logger = logging.getLogger(__name__)


# Carries a user-facing generation error plus the HTTP status a route should
# return, mirroring the GitHub service error pattern so routes stay thin.
class LLMError(RuntimeError):
    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


# The raw result of one model call: response text plus finish_reason, so callers
# can distinguish a complete answer from one truncated at the output-token limit
# (common with reasoning models, whose reasoning tokens share that budget).
@dataclass(frozen=True)
class CompletionResult:
    content: str
    finish_reason: str | None = None


# A completion function takes the (system_prompt, user_prompt) pair and returns a
# CompletionResult. Making this injectable lets tests pass a fake, so the test
# suite never touches the network or spends a single token. The default is the
# real OpenAI call below.
CompletionFn = Callable[[str, str], CompletionResult]


# Model families whose names begin with these prefixes are reasoning models. They
# reject `temperature` (use `reasoning_effort` instead) and bill reasoning tokens
# against the completion budget.
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


# Builds the create() kwargs for the configured model. json_object forces valid
# JSON (the schema is enforced afterwards by validating against a Pydantic model).
# Reasoning models take `reasoning_effort`; other models take `temperature`.
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
# configured. Transport/API errors map to specific, non-leaky statuses; raw
# exception detail is logged server-side rather than returned to the client.
def openai_completion(system_prompt: str, user_prompt: str) -> CompletionResult:
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
        response = client.chat.completions.create(
            **_build_create_kwargs(system_prompt, user_prompt)
        )
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

    choice = response.choices[0]
    return CompletionResult(
        content=choice.message.content or "",
        finish_reason=choice.finish_reason,
    )


# Enforces the input budget BEFORE any paid call, runs the (injectable) completion
# function, and guards against truncated or empty output. Returns the raw JSON
# text plus the pre-call token estimate; callers validate the text against their
# own Pydantic schema. Centralizing this keeps every generator's safety identical.
def complete(
    system_prompt: str,
    user_prompt: str,
    completion_fn: CompletionFn = openai_completion,
) -> tuple[str, int]:
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
        )

    if not result.content.strip():
        raise LLMError("OpenAI returned an empty response.", 502)

    return result.content, estimate_input_tokens(total_chars)
