import json
import unittest

from app.schemas.outputs import InterviewTopic
from app.schemas.profile import ProfileEvidence, ProjectProfile
from app.services.llm_client import CompletionResult, LLMError
from app.services.output_generator import (
    ALL_SECTIONS,
    generate_core_outputs,
    generate_interview_prep,
    revise_interview_prep,
    revise_output,
)


# A representative profile fixture, the kind Phase 10 produces and Phase 11
# consumes.
def make_profile() -> ProjectProfile:
    return ProjectProfile(
        project_name="RepoFrame",
        two_sentence_summary="A tool. It writes project writeups.",
        problem="Writeups are slow.",
        solution="Automate them from repo evidence.",
        detected_tech_stack=["FastAPI", "Next.js"],
        core_features=["Repo analysis", "Evidence panel"],
        technical_highlights=["Deterministic file ranking"],
        user_contribution="Built the FastAPI backend.",
        technical_challenges=["Bounded evidence selection"],
        resume_angles=["Full-stack developer tool"],
        evidence=[ProfileEvidence(claim="Uses FastAPI", source="requirements.txt")],
    )


# Returns a completion_fn that yields canned content, so no test touches the
# network or spends a token. finish_reason defaults to a normal completion.
def fake_completion(content: str, finish_reason: str = "stop"):
    return lambda _system, _user: CompletionResult(
        content=content, finish_reason=finish_reason
    )


# A full four-section payload the way the model is asked to emit it (camelCase).
def all_outputs_json() -> str:
    return json.dumps(
        {
            "resumeBullets": ["Built X", "Shipped Y"],
            "readmeIntro": "# RepoFrame\n\nTurns repos into writeups.",
            "portfolioBlurb": "A tool that turns repos into writeups.",
            "linkedinDescription": "I built RepoFrame, a developer tool.",
        }
    )


class OutputGeneratorTests(unittest.TestCase):
    def test_generates_all_sections_by_default(self) -> None:
        outputs, tokens, _ = generate_core_outputs(
            make_profile(), None, completion_fn=fake_completion(all_outputs_json())
        )

        self.assertEqual(outputs.resume_bullets, ["Built X", "Shipped Y"])
        self.assertTrue(outputs.readme_intro)
        self.assertTrue(outputs.portfolio_blurb)
        self.assertTrue(outputs.linkedin_description)
        self.assertGreater(tokens, 0)
        self.assertEqual(len(ALL_SECTIONS), 4)

    def test_scoped_section_returns_only_requested(self) -> None:
        # Even though the fake returns all four keys, a scoped request must keep
        # only the requested one so a regenerate never clobbers other outputs.
        outputs, _, _ = generate_core_outputs(
            make_profile(),
            ["resumeBullets"],
            completion_fn=fake_completion(all_outputs_json()),
        )

        self.assertEqual(outputs.resume_bullets, ["Built X", "Shipped Y"])
        self.assertIsNone(outputs.readme_intro)
        self.assertIsNone(outputs.portfolio_blurb)
        self.assertIsNone(outputs.linkedin_description)

    def test_malformed_json_raises_502(self) -> None:
        with self.assertRaises(LLMError) as ctx:
            generate_core_outputs(
                make_profile(), None, completion_fn=fake_completion("not json")
            )
        self.assertEqual(ctx.exception.status_code, 502)

    def test_truncated_output_raises_502(self) -> None:
        with self.assertRaises(LLMError) as ctx:
            generate_core_outputs(
                make_profile(),
                None,
                completion_fn=fake_completion(all_outputs_json(), finish_reason="length"),
            )
        self.assertEqual(ctx.exception.status_code, 502)

    def test_interview_prep_parses_topics(self) -> None:
        content = json.dumps(
            {
                "topics": [
                    {
                        "question": "Why FastAPI?",
                        "talkingPoints": ["Speed", "Pydantic types"],
                    }
                ]
            }
        )

        topics, tokens, _ = generate_interview_prep(
            make_profile(), completion_fn=fake_completion(content)
        )

        self.assertEqual(len(topics), 1)
        self.assertEqual(topics[0].question, "Why FastAPI?")
        self.assertEqual(topics[0].talking_points, ["Speed", "Pydantic types"])
        self.assertGreater(tokens, 0)

    def test_interview_prep_malformed_json_raises_502(self) -> None:
        with self.assertRaises(LLMError) as ctx:
            generate_interview_prep(
                make_profile(), completion_fn=fake_completion("not json")
            )
        self.assertEqual(ctx.exception.status_code, 502)

    def test_revise_returns_only_the_revised_section(self) -> None:
        # The model returns the one revised section; revise_output keeps only it
        # so the caller can merge without disturbing the other outputs.
        content = json.dumps({"portfolioBlurb": "A tighter, less fluffy blurb."})

        outputs, tokens, _ = revise_output(
            make_profile(),
            "portfolioBlurb",
            current_text="An old, fluffy blurb.",
            instruction="less fluff",
            completion_fn=fake_completion(content),
        )

        self.assertEqual(outputs.portfolio_blurb, "A tighter, less fluffy blurb.")
        self.assertIsNone(outputs.resume_bullets)
        self.assertIsNone(outputs.readme_intro)
        self.assertGreater(tokens, 0)

    def test_revise_works_without_an_instruction(self) -> None:
        # With no instruction, revision is driven purely by the current draft.
        content = json.dumps({"resumeBullets": ["Tightened bullet one"]})

        outputs, _, _ = revise_output(
            make_profile(),
            "resumeBullets",
            current_text="Wordy bullet one",
            instruction="",
            completion_fn=fake_completion(content),
        )

        self.assertEqual(outputs.resume_bullets, ["Tightened bullet one"])

    def test_guidance_is_included_in_the_generation_prompt(self) -> None:
        # The preemptive guidance must reach the model's prompt so it can steer
        # the first result without a follow-up regenerate.
        captured: dict[str, str] = {}

        def capturing(system: str, user: str) -> CompletionResult:
            captured["user"] = user
            return CompletionResult(content=all_outputs_json())

        generate_core_outputs(
            make_profile(),
            ["resumeBullets"],
            guidance="keep them very concise",
            completion_fn=capturing,
        )

        self.assertIn("keep them very concise", captured["user"])
        self.assertIn("ADDITIONAL INSTRUCTIONS", captured["user"])

    def test_empty_guidance_adds_no_instructions_block(self) -> None:
        captured: dict[str, str] = {}

        def capturing(system: str, user: str) -> CompletionResult:
            captured["user"] = user
            return CompletionResult(content=all_outputs_json())

        generate_core_outputs(
            make_profile(), ["resumeBullets"], guidance="", completion_fn=capturing
        )

        self.assertNotIn("ADDITIONAL INSTRUCTIONS", captured["user"])

    def test_revise_malformed_json_raises_502(self) -> None:
        with self.assertRaises(LLMError) as ctx:
            revise_output(
                make_profile(),
                "readmeIntro",
                current_text="draft",
                instruction="",
                completion_fn=fake_completion("not json"),
            )
        self.assertEqual(ctx.exception.status_code, 502)

    def test_revise_interview_returns_revised_topics(self) -> None:
        content = json.dumps(
            {
                "topics": [
                    {
                        "question": "How did you bound the evidence?",
                        "talkingPoints": ["Ranked files", "Capped the prompt"],
                    }
                ]
            }
        )
        current = [
            InterviewTopic(question="Old question", talkingPoints=["Old point"])
        ]

        topics, tokens, _ = revise_interview_prep(
            make_profile(),
            current,
            instruction="focus on the evidence pipeline",
            completion_fn=fake_completion(content),
        )

        self.assertEqual(len(topics), 1)
        self.assertEqual(topics[0].question, "How did you bound the evidence?")
        self.assertEqual(topics[0].talking_points, ["Ranked files", "Capped the prompt"])
        self.assertGreater(tokens, 0)

    def test_revise_interview_includes_current_prep_and_instruction(self) -> None:
        # The current topics and the instruction must both reach the prompt so the
        # revision refines what the user sees rather than starting over.
        captured: dict[str, str] = {}

        def capturing(system: str, user: str) -> CompletionResult:
            captured["user"] = user
            return CompletionResult(
                content=json.dumps(
                    {"topics": [{"question": "Q", "talkingPoints": ["p"]}]}
                )
            )

        revise_interview_prep(
            make_profile(),
            [InterviewTopic(question="Why FastAPI?", talkingPoints=["Speed"])],
            instruction="add a systems-design angle",
            completion_fn=capturing,
        )

        self.assertIn("Why FastAPI?", captured["user"])
        self.assertIn("CURRENT INTERVIEW PREP", captured["user"])
        self.assertIn("add a systems-design angle", captured["user"])

    def test_revise_interview_malformed_json_raises_502(self) -> None:
        with self.assertRaises(LLMError) as ctx:
            revise_interview_prep(
                make_profile(),
                [InterviewTopic(question="Q", talkingPoints=["p"])],
                instruction="",
                completion_fn=fake_completion("not json"),
            )
        self.assertEqual(ctx.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
