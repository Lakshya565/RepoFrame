import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app import config
from app.routers import projects as projects_router
from app.schemas.outputs import GeneratedOutputs, InterviewTopic
from app.schemas.profile import ProjectProfile, UserContextInput
from app.schemas.projects import SaveProjectRequest
from app.schemas.repo import RepoMetadataResponse
from app.schemas.verify import ClaimVerification
from app.services import supabase_client
from app.services.auth import AuthenticatedUser
from app.services.project_store import (
    InMemoryProjectRepository,
    get_project_repository,
)


def _snapshot(
    *,
    owner: str = "octo",
    repo: str = "hello",
    url: str = "https://github.com/octo/hello",
    with_profile: bool = True,
    with_verifications: bool = True,
) -> SaveProjectRequest:
    """A realistic, fully-populated save request used across the storage tests."""
    return SaveProjectRequest(
        owner=owner,
        repo=repo,
        normalized_url=url,
        default_branch="main",
        is_private=False,
        metadata=RepoMetadataResponse(
            owner=owner,
            repo=repo,
            normalized_url=url,
            name=repo,
            description="A demo repo.",
            default_branch="main",
            stars=3,
            forks=1,
            language="Python",
            html_url=url,
            topics=["cli"],
            license="MIT",
        ),
        user_context=UserContextInput(purpose="portfolio", collaboration="solo"),
        profile=(
            ProjectProfile(
                project_name=repo,
                two_sentence_summary="Does a thing. Well.",
                problem="A problem.",
                solution="A solution.",
                detected_tech_stack=["Python"],
                core_features=["feature"],
                technical_highlights=["highlight"],
                user_contribution="Built it.",
                technical_challenges=["challenge"],
                resume_angles=["angle"],
                evidence=[],
            )
            if with_profile
            else None
        ),
        outputs=GeneratedOutputs(
            resume_bullets=["Did X"],
            readme_intro="Intro.",
            portfolio_blurb="Blurb.",
            linkedin_description="Description.",
        ),
        interview_topics=[
            InterviewTopic(question="Why?", talking_points=["Because."]),
        ],
        all_guidance="keep it concise",
        verifications=(
            [ClaimVerification(claim="Did X", status="supported")]
            if with_verifications
            else None
        ),
        verification_model="test-model" if with_verifications else None,
    )


# The behavioral contract every ProjectRepository must meet, exercised against the
# in-memory implementation (fully offline). The Supabase implementation is expected
# to match this contract and is validated by a manual live smoke.
class InMemoryProjectRepositoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repo = InMemoryProjectRepository()
        self.user = "user-1"

    def test_save_then_get_round_trips_every_field(self) -> None:
        snapshot = _snapshot()
        saved = self.repo.save(self.user, snapshot)
        loaded = self.repo.get(self.user, saved.id)

        self.assertIsNotNone(loaded)
        assert loaded is not None
        # Identity + full content survive the round trip unchanged.
        self.assertEqual(loaded.normalized_url, snapshot.normalized_url)
        self.assertEqual(loaded.metadata, snapshot.metadata)
        self.assertEqual(loaded.user_context, snapshot.user_context)
        self.assertEqual(loaded.profile, snapshot.profile)
        self.assertEqual(loaded.outputs, snapshot.outputs)
        self.assertEqual(loaded.interview_topics, snapshot.interview_topics)
        self.assertEqual(loaded.all_guidance, snapshot.all_guidance)
        self.assertEqual(loaded.verifications, snapshot.verifications)
        self.assertEqual(loaded.verification_model, snapshot.verification_model)

    def test_resave_same_repo_upserts_in_place(self) -> None:
        first = self.repo.save(self.user, _snapshot())
        second = self.repo.save(
            self.user, _snapshot(repo="hello", url="https://github.com/octo/hello")
        )
        # Same id (upsert, not duplicate) and creation time preserved.
        self.assertEqual(first.id, second.id)
        self.assertEqual(first.created_at, second.created_at)
        self.assertEqual(len(self.repo.list_for_user(self.user)), 1)

    def test_list_is_scoped_and_newest_first(self) -> None:
        self.repo.save(self.user, _snapshot(repo="a", url="https://github.com/octo/a"))
        self.repo.save(self.user, _snapshot(repo="b", url="https://github.com/octo/b"))
        summaries = self.repo.list_for_user(self.user)
        self.assertEqual(len(summaries), 2)
        # Most recently saved is first.
        self.assertEqual(summaries[0].repo, "b")

    def test_cross_user_isolation(self) -> None:
        mine = self.repo.save(self.user, _snapshot())
        # Another user cannot see, load, or delete my project.
        self.assertEqual(self.repo.list_for_user("user-2"), [])
        self.assertIsNone(self.repo.get("user-2", mine.id))
        self.assertFalse(self.repo.delete("user-2", mine.id))
        # And mine is untouched.
        self.assertIsNotNone(self.repo.get(self.user, mine.id))

    def test_delete_removes_and_frees_the_url(self) -> None:
        saved = self.repo.save(self.user, _snapshot())
        self.assertTrue(self.repo.delete(self.user, saved.id))
        self.assertIsNone(self.repo.get(self.user, saved.id))
        # Deleting again is a no-op (already gone).
        self.assertFalse(self.repo.delete(self.user, saved.id))
        # The URL is free again, so re-saving creates a fresh row.
        resaved = self.repo.save(self.user, _snapshot())
        self.assertNotEqual(resaved.id, saved.id)

    def test_get_missing_returns_none(self) -> None:
        self.assertIsNone(self.repo.get(self.user, "does-not-exist"))

    def test_save_without_optional_content(self) -> None:
        # A project saved right after analysis (no profile/verification yet).
        snapshot = _snapshot(with_profile=False, with_verifications=False)
        saved = self.repo.save(self.user, snapshot)
        loaded = self.repo.get(self.user, saved.id)
        assert loaded is not None
        self.assertIsNone(loaded.profile)
        self.assertIsNone(loaded.verifications)


# The route handlers, called directly with an injected fake user + in-memory store
# (the same objects FastAPI would inject), so the thin-route logic is covered
# offline without a running server or a database.
class ProjectRouteHandlerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repo = InMemoryProjectRepository()
        self.user = AuthenticatedUser(user_id="user-1", github_id="42")

    def test_save_and_get(self) -> None:
        saved = projects_router.save_project(
            _snapshot(), user=self.user, repository=self.repo
        )
        fetched = projects_router.get_project(
            saved.id, user=self.user, repository=self.repo
        )
        self.assertEqual(fetched.id, saved.id)

    def test_list(self) -> None:
        projects_router.save_project(_snapshot(), user=self.user, repository=self.repo)
        listed = projects_router.list_projects(user=self.user, repository=self.repo)
        self.assertEqual(len(listed), 1)

    def test_get_missing_raises_404(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            projects_router.get_project("nope", user=self.user, repository=self.repo)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_delete_missing_raises_404(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            projects_router.delete_project("nope", user=self.user, repository=self.repo)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_delete_success_returns_none(self) -> None:
        saved = projects_router.save_project(
            _snapshot(), user=self.user, repository=self.repo
        )
        result = projects_router.delete_project(
            saved.id, user=self.user, repository=self.repo
        )
        self.assertIsNone(result)

    def test_another_user_cannot_get_my_project(self) -> None:
        saved = projects_router.save_project(
            _snapshot(), user=self.user, repository=self.repo
        )
        other = AuthenticatedUser(user_id="user-2")
        with self.assertRaises(HTTPException) as ctx:
            projects_router.get_project(saved.id, user=other, repository=self.repo)
        self.assertEqual(ctx.exception.status_code, 404)


# The unconfigured guard: with Supabase unset, the repository dependency refuses
# cleanly (503) instead of trying to build a client against empty settings.
class ProjectRepositoryFactoryTests(unittest.TestCase):
    def test_unconfigured_raises_503(self) -> None:
        supabase_client.reset_client()
        with patch.object(config, "SUPABASE_URL", ""), patch.object(
            config, "SUPABASE_SERVICE_ROLE_KEY", ""
        ):
            with self.assertRaises(HTTPException) as ctx:
                get_project_repository()
            self.assertEqual(ctx.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
