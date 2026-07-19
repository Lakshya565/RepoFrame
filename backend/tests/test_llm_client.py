import unittest

from app.config import MAX_TOTAL_PROMPT_CHARS
from app.services import llm_client
from app.services.llm_client import (
    AgentStep,
    CompletionResult,
    LLMError,
    TokenUsage,
    _build_agent_kwargs,
    complete,
    complete_with_tools,
)

# A minimal, valid function-tool schema for the agent-kwargs tests.
_TOOL = [
    {
        "type": "function",
        "function": {"name": "noop", "description": "noop", "parameters": {}},
    }
]


# Builds a single-shot completion_fn that returns canned content + usage, so no
# test here contacts the network or spends a token.
def fake_completion(content: str, usage: TokenUsage, finish_reason: str = "stop"):
    return lambda _system, _user: CompletionResult(
        content=content, finish_reason=finish_reason, usage=usage
    )


# Builds an agent_fn that returns one canned AgentStep regardless of input.
def fake_agent(step: AgentStep):
    return lambda _messages, _tools, _choice: step


class TokenUsageTests(unittest.TestCase):
    def test_addition_sums_each_field(self) -> None:
        total = TokenUsage(10, 20, 5, 30) + TokenUsage(1, 2, 3, 6)
        self.assertEqual(total.prompt_tokens, 11)
        self.assertEqual(total.completion_tokens, 22)
        self.assertEqual(total.reasoning_tokens, 8)
        self.assertEqual(total.total_tokens, 36)


class CompleteUsageTests(unittest.TestCase):
    def test_complete_returns_real_usage(self) -> None:
        usage = TokenUsage(100, 40, 12, 140)
        content, estimated, returned = complete(
            "system", "user", completion_fn=fake_completion('{"ok": true}', usage)
        )
        self.assertEqual(content, '{"ok": true}')
        self.assertGreater(estimated, 0)
        # The real post-call usage must flow back unchanged for cost tracking.
        self.assertEqual(returned, usage)

    def test_truncated_response_raises_502(self) -> None:
        with self.assertRaises(LLMError) as ctx:
            complete(
                "system",
                "user",
                completion_fn=fake_completion("{}", TokenUsage(), finish_reason="length"),
            )
        self.assertEqual(ctx.exception.status_code, 502)


class CompleteWithToolsTests(unittest.TestCase):
    def test_returns_step_with_usage(self) -> None:
        step = AgentStep(
            content='{"verifications": []}',
            tool_calls=[],
            finish_reason="stop",
            usage=TokenUsage(50, 10, 0, 60),
        )
        result = complete_with_tools(
            [{"role": "user", "content": "hi"}], [], agent_fn=fake_agent(step)
        )
        self.assertEqual(result.usage.total_tokens, 60)
        self.assertEqual(result.content, '{"verifications": []}')

    def test_truncated_turn_raises_502(self) -> None:
        step = AgentStep(
            content="", tool_calls=[], finish_reason="length", usage=TokenUsage()
        )
        with self.assertRaises(LLMError) as ctx:
            complete_with_tools(
                [{"role": "user", "content": "hi"}], [], agent_fn=fake_agent(step)
            )
        self.assertEqual(ctx.exception.status_code, 502)

    def test_oversized_messages_rejected_before_call(self) -> None:
        # Messages larger than the budget must trip the 413 guard before the
        # (paid) agent function is ever invoked.
        def exploding(_messages, _tools, _choice):
            raise AssertionError("agent_fn should not be called")

        huge = [{"role": "user", "content": "x" * (MAX_TOTAL_PROMPT_CHARS + 1)}]
        with self.assertRaises(LLMError) as ctx:
            complete_with_tools(huge, [], agent_fn=exploding)
        self.assertEqual(ctx.exception.status_code, 413)


# Luna uses the two Chat Completions shapes OpenAI accepts: function-tool turns
# disable reasoning, while tool-free verdict turns restore the configured effort.
# These tests never construct an OpenAI client.
class AgentReasoningEffortTests(unittest.TestCase):
    def test_luna_with_tools_disables_reasoning(self) -> None:
        kwargs = _build_agent_kwargs([], _TOOL, "auto")
        self.assertEqual(kwargs["model"], "gpt-5.6-luna")
        self.assertEqual(kwargs["reasoning_effort"], "none")
        self.assertNotIn("temperature", kwargs)
        self.assertNotIn("response_format", kwargs)

    def test_luna_without_tools_keeps_configured_effort(self) -> None:
        kwargs = _build_agent_kwargs([], [], "auto")
        self.assertEqual(kwargs["model"], "gpt-5.6-luna")
        self.assertEqual(
            kwargs["reasoning_effort"], llm_client.OPENAI_REASONING_EFFORT
        )
        self.assertEqual(kwargs["response_format"], {"type": "json_object"})


if __name__ == "__main__":
    unittest.main()
