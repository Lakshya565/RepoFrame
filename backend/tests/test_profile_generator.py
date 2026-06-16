import json
import unittest

from app.config import MAX_TOTAL_PROMPT_CHARS
from app.schemas.profile import ProjectProfile, UserContextInput
from app.services.file_content_service import (
    RepoEvidenceCollection,
    SelectedFileEvidence,
)
from app.services.github_service import GitHubRepoMetadata
from app.services.profile_generator import (
    CompletionResult,
    ProfileGenerationError,
    build_profile_prompt,
    generate_project_profile,
)
from app.services.tech_stack_detector import DetectedTechnology, TechStackEvidence


# ---------------------------------------------------------------------------
# Fixtures. Everything here is in-memory; the completion function is faked so no
# test in this module ever contacts OpenAI or spends a token.
# ---------------------------------------------------------------------------
def make_metadata() -> GitHubRepoMetadata:
    return GitHubRepoMetadata(
        name="repoframe",
        description="Turns repos into writeups",
        default_branch="main",
        stars=12,
        forks=3,
        language="Python",
        html_url="https://github.com/acme/repoframe",
    )


def make_technologies() -> list[DetectedTechnology]:
    return [
        DetectedTechnology(
            name="FastAPI",
            category="backend",
            confidence=0.9,
            evidence=[TechStackEvidence(source="requirements.txt", detail="fastapi")],
        )
    ]


def make_evidence(content: str = "print('hello')") -> RepoEvidenceCollection:
    file = SelectedFileEvidence(
        path="app/main.py",
        source_type="source",
        reason="Top-ranked source file.",
        content=content,
        original_size=len(content),
        truncated=False,
        char_count=len(content),
    )
    return RepoEvidenceCollection(
        selected_files=[file], skipped_files=[], total_characters=len(content)
    )


# A complete, schema-valid profile payload the way the model is asked to emit it
# (camelCase keys). Tests tweak/break copies of this to exercise failure paths.
def valid_profile_json() -> str:
    return json.dumps(
        {
            "projectName": "RepoFrame",
            "twoSentenceSummary": "A tool. It does things.",
            "problem": "Writeups are slow.",
            "solution": "Automate them.",
            "detectedTechStack": ["FastAPI", "Python"],
            "coreFeatures": ["Repo analysis"],
            "technicalHighlights": ["File ranking"],
            "userContribution": "Built the backend.",
            "technicalChallenges": ["Bounded evidence"],
            "resumeAngles": ["Full-stack tool"],
            "evidence": [{"claim": "Uses FastAPI", "source": "requirements.txt"}],
        }
    )


# Wraps canned text as a CompletionResult so fakes match the completion_fn
# contract. finish_reason defaults to "stop" (a normal, complete response).
def fake_completion(content: str, finish_reason: str = "stop") -> CompletionResult:
    return CompletionResult(content=content, finish_reason=finish_reason)


# Raises if invoked, used to prove the budget guard short-circuits before any
# (paid) completion call is ever made.
def exploding_completion(system_prompt: str, user_prompt: str) -> CompletionResult:
    raise AssertionError("completion_fn should not be called")


class ProfileGeneratorTests(unittest.TestCase):
    def test_valid_response_parses_into_profile(self) -> None:
        profile, tokens = generate_project_profile(
            make_metadata(),
            make_technologies(),
            make_evidence(),
            UserContextInput(),
            completion_fn=lambda _s, _u: fake_completion(valid_profile_json()),
        )

        self.assertIsInstance(profile, ProjectProfile)
        self.assertEqual(profile.project_name, "RepoFrame")
        self.assertEqual(profile.detected_tech_stack, ["FastAPI", "Python"])
        self.assertEqual(profile.evidence[0].source, "requirements.txt")
        self.assertGreater(tokens, 0)

    def test_malformed_json_raises_502(self) -> None:
        with self.assertRaises(ProfileGenerationError) as ctx:
            generate_project_profile(
                make_metadata(),
                make_technologies(),
                make_evidence(),
                UserContextInput(),
                completion_fn=lambda _s, _u: fake_completion("not json at all"),
            )
        self.assertEqual(ctx.exception.status_code, 502)

    def test_schema_mismatch_raises_502(self) -> None:
        # Valid JSON, but missing required keys -> schema validation failure.
        incomplete = json.dumps({"projectName": "X"})
        with self.assertRaises(ProfileGenerationError) as ctx:
            generate_project_profile(
                make_metadata(),
                make_technologies(),
                make_evidence(),
                UserContextInput(),
                completion_fn=lambda _s, _u: fake_completion(incomplete),
            )
        self.assertEqual(ctx.exception.status_code, 502)

    def test_empty_response_raises_502(self) -> None:
        with self.assertRaises(ProfileGenerationError) as ctx:
            generate_project_profile(
                make_metadata(),
                make_technologies(),
                make_evidence(),
                UserContextInput(),
                completion_fn=lambda _s, _u: fake_completion("   "),
            )
        self.assertEqual(ctx.exception.status_code, 502)

    def test_length_truncated_response_raises_502(self) -> None:
        # Even valid-looking JSON must be rejected when the response was cut off
        # at the output-token limit (finish_reason == "length"), with a message
        # that points at the output-token / reasoning-effort knobs.
        with self.assertRaises(ProfileGenerationError) as ctx:
            generate_project_profile(
                make_metadata(),
                make_technologies(),
                make_evidence(),
                UserContextInput(),
                completion_fn=lambda _s, _u: fake_completion(
                    valid_profile_json(), finish_reason="length"
                ),
            )
        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("OPENAI_MAX_OUTPUT_TOKENS", str(ctx.exception))

    def test_oversized_prompt_rejected_before_completion(self) -> None:
        # Evidence larger than the budget must trip the 413 guard, and the
        # completion function must never run (no tokens spent on oversized input).
        huge = make_evidence("x" * (MAX_TOTAL_PROMPT_CHARS + 1))
        with self.assertRaises(ProfileGenerationError) as ctx:
            generate_project_profile(
                make_metadata(),
                make_technologies(),
                huge,
                UserContextInput(),
                completion_fn=exploding_completion,
            )
        self.assertEqual(ctx.exception.status_code, 413)

    def test_prompt_marks_blank_user_context_as_not_provided(self) -> None:
        prompt = build_profile_prompt(
            make_metadata(),
            make_technologies(),
            make_evidence(),
            UserContextInput(),
        )
        self.assertIn("(not provided)", prompt)
        self.assertIn("FastAPI", prompt)
        self.assertIn("app/main.py", prompt)

    def test_prompt_includes_provided_user_context(self) -> None:
        context = UserContextInput(
            purpose="Help developers",
            collaboration="solo",
            contribution="I built it all",
        )
        prompt = build_profile_prompt(
            make_metadata(), make_technologies(), make_evidence(), context
        )
        self.assertIn("Help developers", prompt)
        self.assertIn("solo", prompt)
        self.assertIn("I built it all", prompt)


if __name__ == "__main__":
    unittest.main()
