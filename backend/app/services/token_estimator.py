from app.config import MAX_TOTAL_PROMPT_CHARS

# OpenAI models tokenize roughly one token per four characters for English
# prose and source code. The heuristic intentionally overestimates slightly
# (rounding down char count = more tokens predicted) so budget checks err
# on the conservative side.
#
# This conservative pre-call estimate is separate from the exact post-call usage
# reported by OpenAI and persisted by usage_store. The character budget remains
# the hard safety boundary even if model tokenization changes.

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

    Callers run this final guard immediately before an OpenAI request so oversized
    non-evidence context is rejected without spending tokens.
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
