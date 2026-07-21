from app.config import MAX_TOTAL_PROMPT_CHARS

# OpenAI models tokenize roughly one token per four characters for English
# prose and source code. The heuristic intentionally overestimates slightly
# (rounding down char count = more tokens predicted) so budget checks err
# on the conservative side.
#
# Phase 10 integration note: replace this with tiktoken and the encoder that
# matches whichever model is selected, so the pre-call estimate is exact.
# This pre-call check is separate from the post-call usage object returned by
# the OpenAI API (prompt_tokens, completion_tokens, reasoning_tokens, etc.),
# which Phase 13 will use for actual cost tracking. The function signatures
# below are stable so swapping in tiktoken is a one-line change inside
# estimate_input_tokens.

_CHARS_PER_TOKEN = 4


def estimate_input_tokens(char_count: int) -> int:
    """Returns a rough upper-bound token estimate for a given character count."""
    return max(1, char_count // _CHARS_PER_TOKEN)


def check_prompt_budget(
    total_chars: int,
    max_chars: int = MAX_TOTAL_PROMPT_CHARS,
) -> tuple[bool, str]:
    """
    Validates that the complete request context is within the character budget
    before an OpenAI call. Repository evidence is fitted automatically upstream;
    this final guard catches oversized non-evidence context and programming errors.

    Phase 10 integration note: call this at the start of the prompt-generation
    service, before constructing the final prompt string, so oversized payloads
    are rejected before they reach the OpenAI client.
    """
    if total_chars <= max_chars:
        return True, ""

    estimated_tokens = estimate_input_tokens(total_chars)
    return (
        False,
        f"Request context is {total_chars:,} chars (~{estimated_tokens:,} tokens), "
        f"which exceeds the {max_chars:,}-char prompt budget. "
        "Reduce the user-provided or generated context before sending to OpenAI.",
    )
