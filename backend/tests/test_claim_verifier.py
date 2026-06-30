import json
import unittest

from app.schemas.outputs import GeneratedOutputs
from app.schemas.profile import UserContextInput
from app.services.claim_verifier import (
    _read_evidence_file,
    _search_evidence,
    verify_claims,
)
from app.services.file_content_service import (
    RepoEvidenceCollection,
    SelectedFileEvidence,
)
from app.services.llm_client import EMPTY_USAGE, AgentStep, LLMError, TokenUsage, ToolCall


# ---------------------------------------------------------------------------
# Fixtures. Everything is in-memory and the agent function is faked, so no test
# here contacts OpenAI or spends a token. The fake agent is scripted: it returns
# a queue of AgentSteps (a tool call, then a final answer), exactly as the loop
# expects, which lets us exercise the whole loop offline.
# ---------------------------------------------------------------------------
def make_evidence() -> RepoEvidenceCollection:
    files = [
        SelectedFileEvidence(
            path="README.md",
            source_type="readme",
            reason="primary context",
            content="# Demo\n\nBuilt with FastAPI and Next.js.\n",
            original_size=40,
            truncated=False,
            char_count=40,
        ),
        SelectedFileEvidence(
            path="requirements.txt",
            source_type="config",
            reason="dependencies",
            content="fastapi==0.1\nuvicorn==0.1\n",
            original_size=26,
            truncated=False,
            char_count=26,
        ),
    ]
    return RepoEvidenceCollection(
        selected_files=files, skipped_files=[], total_characters=66
    )


def make_outputs() -> GeneratedOutputs:
    return GeneratedOutputs(
        resume_bullets=["Built a FastAPI backend"],
        readme_intro="# Demo\n\nA tool built with FastAPI.",
    )


def final_json() -> str:
    return json.dumps(
        {
            "verifications": [
                {
                    "claim": "Built a FastAPI backend",
                    "status": "supported",
                    "sections": ["resumeBullets"],
                    "supportingEvidence": ["requirements.txt"],
                    "explanation": "fastapi appears in requirements.txt",
                    "suggestedRevision": None,
                }
            ]
        }
    )


# A scripted agent function: pops a pre-built AgentStep per call and records the
# messages/tool_choice it was handed, so tests can assert the loop fed tool
# results back in and forced a final turn when required.
class ScriptedAgent:
    def __init__(self, steps: list[AgentStep]) -> None:
        self._steps = list(steps)
        self.calls: list[dict] = []

    def __call__(self, messages, tools, tool_choice):
        self.calls.append({"messages": list(messages), "tool_choice": tool_choice})
        return self._steps.pop(0)


def exploding_agent(_messages, _tools, _choice):
    raise AssertionError("agent_fn should not be called")


class EvidenceToolTests(unittest.TestCase):
    def test_search_finds_matching_lines(self) -> None:
        result = _search_evidence(make_evidence(), "fastapi")
        self.assertIn("requirements.txt", result)
        self.assertIn("README.md", result)

    def test_search_reports_no_matches(self) -> None:
        self.assertIn("No matches", _search_evidence(make_evidence(), "kubernetes"))

    def test_read_returns_file_content(self) -> None:
        result = _read_evidence_file(make_evidence(), "requirements.txt")
        self.assertIn("fastapi==0.1", result)

    def test_read_tolerates_case(self) -> None:
        # A slightly-off path (wrong case) must still resolve so the agent does
        # not dead-end on a near-miss path.
        result = _read_evidence_file(make_evidence(), "readme.md")
        self.assertIn("Built with FastAPI", result)

    def test_read_missing_path_lists_available(self) -> None:
        result = _read_evidence_file(make_evidence(), "nope.py")
        self.assertIn("No selected evidence file", result)
        self.assertIn("README.md", result)


class VerifyClaimsTests(unittest.TestCase):
    def test_no_claims_short_circuits_without_calling_model(self) -> None:
        # Empty outputs must never spend a token: the agent function is never run.
        verifications, estimated, usage = verify_claims(
            make_evidence(),
            GeneratedOutputs(),
            UserContextInput(),
            agent_fn=exploding_agent,
        )
        self.assertEqual(verifications, [])
        self.assertEqual(estimated, 0)
        self.assertEqual(usage, EMPTY_USAGE)

    def test_initial_prompt_includes_evidence_content(self) -> None:
        # The fix for "everything unsupported": the agent must receive the actual
        # evidence content up front, not just a manifest of file names, so it can
        # judge README-backed claims even if it never calls a tool.
        agent = ScriptedAgent(
            [
                AgentStep(
                    content=final_json(),
                    tool_calls=[],
                    finish_reason="stop",
                    usage=TokenUsage(10, 10, 0, 20),
                )
            ]
        )
        verify_claims(
            make_evidence(), make_outputs(), UserContextInput(), agent_fn=agent
        )

        initial_user_message = agent.calls[0]["messages"][1]["content"]
        # README body and a manifest file's contents are both present inline.
        self.assertIn("Built with FastAPI and Next.js", initial_user_message)
        self.assertIn("fastapi==0.1", initial_user_message)

    def test_all_present_sections_are_in_the_prompt(self) -> None:
        # Every generated tab must reach the prompt (labeled with its section key)
        # so the agent covers all of them, not just the resume bullets.
        agent = ScriptedAgent(
            [
                AgentStep(
                    content=final_json(),
                    tool_calls=[],
                    finish_reason="stop",
                    usage=TokenUsage(10, 10, 0, 20),
                )
            ]
        )
        verify_claims(
            make_evidence(), make_outputs(), UserContextInput(), agent_fn=agent
        )

        prompt = agent.calls[0]["messages"][1]["content"]
        self.assertIn("section key: resumeBullets", prompt)
        self.assertIn("section key: readmeIntro", prompt)

    def test_section_scope_limits_claims_to_requested_tab(self) -> None:
        # A per-tab run must include only the requested tab's text, so the agent
        # checks just that tab.
        agent = ScriptedAgent(
            [
                AgentStep(
                    content=final_json(),
                    tool_calls=[],
                    finish_reason="stop",
                    usage=TokenUsage(10, 10, 0, 20),
                )
            ]
        )
        verify_claims(
            make_evidence(),
            make_outputs(),
            UserContextInput(),
            sections=["readmeIntro"],
            agent_fn=agent,
        )

        prompt = agent.calls[0]["messages"][1]["content"]
        self.assertIn("section key: readmeIntro", prompt)
        self.assertIn("A tool built with FastAPI", prompt)  # README intro text
        # The resume-bullets tab must be excluded when scoping to README only.
        self.assertNotIn("section key: resumeBullets", prompt)
        self.assertNotIn("Built a FastAPI backend", prompt)  # resume bullet text

    def test_tool_call_then_final_parses_and_sums_usage(self) -> None:
        agent = ScriptedAgent(
            [
                AgentStep(
                    content=None,
                    tool_calls=[
                        ToolCall("call_1", "search_evidence", '{"query": "fastapi"}')
                    ],
                    finish_reason="tool_calls",
                    usage=TokenUsage(100, 10, 0, 110),
                ),
                AgentStep(
                    content=final_json(),
                    tool_calls=[],
                    finish_reason="stop",
                    usage=TokenUsage(120, 30, 5, 150),
                ),
            ]
        )

        verifications, estimated, usage = verify_claims(
            make_evidence(), make_outputs(), UserContextInput(), agent_fn=agent
        )

        self.assertEqual(len(verifications), 1)
        self.assertEqual(verifications[0].status, "supported")
        self.assertEqual(verifications[0].sections, ["resumeBullets"])
        self.assertEqual(verifications[0].supporting_evidence, ["requirements.txt"])
        self.assertGreater(estimated, 0)
        # Usage is summed across both turns.
        self.assertEqual(usage.total_tokens, 260)
        self.assertEqual(usage.reasoning_tokens, 5)

        # The second turn must have received the tool result from the first turn.
        second_turn_messages = agent.calls[1]["messages"]
        self.assertTrue(
            any(message.get("role") == "tool" for message in second_turn_messages)
        )

    def test_caps_force_a_final_answer(self) -> None:
        # A "stubborn" agent that keeps calling tools while allowed must still
        # finish: the loop forces tool_choice="none" on the final turn, and this
        # agent answers with JSON when tools are disallowed.
        def stubborn_agent(_messages, _tools, tool_choice):
            if tool_choice == "none":
                return AgentStep(
                    content=final_json(),
                    tool_calls=[],
                    finish_reason="stop",
                    usage=TokenUsage(1, 1, 0, 2),
                )
            return AgentStep(
                content=None,
                tool_calls=[ToolCall("c", "search_evidence", '{"query": "x"}')],
                finish_reason="tool_calls",
                usage=TokenUsage(1, 1, 0, 2),
            )

        verifications, _, usage = verify_claims(
            make_evidence(), make_outputs(), UserContextInput(), agent_fn=stubborn_agent
        )
        self.assertEqual(len(verifications), 1)
        self.assertGreater(usage.total_tokens, 0)

    def test_supported_with_revision_is_downgraded(self) -> None:
        # A "supported" verdict that also carries a suggestedRevision is internally
        # inconsistent (a claim backed as written needs no rewrite). The loop must
        # reconcile it to partially_supported so the badge agrees with the advice —
        # the exact contradiction seen on compound "Python and TypeScript" claims.
        inconsistent = json.dumps(
            {
                "verifications": [
                    {
                        "claim": "Utilized Python and TypeScript",
                        "status": "supported",
                        "sections": ["resumeBullets"],
                        "supportingEvidence": ["package.json"],
                        "explanation": "TypeScript is present; Python is not evidenced.",
                        "suggestedRevision": "Drop Python; only TypeScript is shown.",
                    }
                ]
            }
        )
        agent = ScriptedAgent(
            [
                AgentStep(
                    content=inconsistent,
                    tool_calls=[],
                    finish_reason="stop",
                    usage=TokenUsage(10, 10, 0, 20),
                )
            ]
        )
        verifications, _, _ = verify_claims(
            make_evidence(), make_outputs(), UserContextInput(), agent_fn=agent
        )
        self.assertEqual(verifications[0].status, "partially_supported")
        # The revision is preserved — it carries the real signal.
        self.assertEqual(
            verifications[0].suggested_revision,
            "Drop Python; only TypeScript is shown.",
        )

    def test_progress_reports_real_stages(self) -> None:
        # The streaming path threads a progress sink through the loop. It must fire
        # analyzing once up front, a checking line per real tool call (carrying what
        # the agent actually searched for), and compiling before the verdict — so
        # the UI checklist tracks genuine work, not a timer.
        agent = ScriptedAgent(
            [
                AgentStep(
                    content=None,
                    tool_calls=[
                        ToolCall("call_1", "search_evidence", '{"query": "fastapi"}')
                    ],
                    finish_reason="tool_calls",
                    usage=TokenUsage(100, 10, 0, 110),
                ),
                AgentStep(
                    content=final_json(),
                    tool_calls=[],
                    finish_reason="stop",
                    usage=TokenUsage(120, 30, 5, 150),
                ),
            ]
        )
        events: list[tuple[str, str | None]] = []
        verify_claims(
            make_evidence(),
            make_outputs(),
            UserContextInput(),
            agent_fn=agent,
            progress=lambda stage, detail: events.append((stage, detail)),
        )

        stages = [stage for stage, _ in events]
        self.assertEqual(stages[0], "analyzing")
        self.assertIn("checking", stages)
        self.assertEqual(stages[-1], "compiling")
        # The checking line reflects the agent's actual query.
        checking_details = [detail for stage, detail in events if stage == "checking"]
        self.assertTrue(any("fastapi" in (d or "") for d in checking_details))

    def test_no_progress_sink_runs_silently(self) -> None:
        # Omitting the sink must not change behavior: the loop still returns a result
        # and never raises for the missing callback (the one-shot path relies on it).
        agent = ScriptedAgent(
            [
                AgentStep(
                    content=final_json(),
                    tool_calls=[],
                    finish_reason="stop",
                    usage=TokenUsage(10, 10, 0, 20),
                )
            ]
        )
        verifications, _, _ = verify_claims(
            make_evidence(), make_outputs(), UserContextInput(), agent_fn=agent
        )
        self.assertEqual(len(verifications), 1)

    def test_malformed_final_answer_raises_502(self) -> None:
        agent = ScriptedAgent(
            [
                AgentStep(
                    content="this is not json",
                    tool_calls=[],
                    finish_reason="stop",
                    usage=TokenUsage(10, 10, 0, 20),
                )
            ]
        )
        with self.assertRaises(LLMError) as ctx:
            verify_claims(
                make_evidence(), make_outputs(), UserContextInput(), agent_fn=agent
            )
        self.assertEqual(ctx.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
