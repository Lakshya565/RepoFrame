import unittest
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from app.services import analysis_service, repo_access
from app.services.auth import AuthenticatedUser
from app.services.github_service import (
    GitHubRepoFile,
    GitHubRepoMetadata,
    GitHubRepoTree,
)


class AnalysisServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        analysis_service.reset_analysis_caches()

    def tearDown(self) -> None:
        analysis_service.reset_analysis_caches()

    def _patch_pipeline(self):
        metadata = GitHubRepoMetadata(
            name="demo",
            description="Demo repository",
            default_branch="main",
            stars=2,
            forks=1,
            language="Python",
            html_url="https://github.com/acme/demo",
        )
        tree = GitHubRepoTree(
            files=[GitHubRepoFile("README.md", "file", 20, None)],
            total_files=1,
            total_directories=0,
            is_truncated=False,
        )
        return (
            patch.object(
                analysis_service.repo_access,
                "resolve_repo_access",
                return_value=repo_access.RepoAccess(None, None),
            ),
            patch.object(
                analysis_service, "fetch_repo_metadata", return_value=metadata
            ),
            patch.object(analysis_service, "fetch_repo_tree", return_value=tree),
            patch.object(
                analysis_service, "collect_stack_evidence", return_value=[]
            ),
            patch.object(analysis_service, "fetch_repo_languages", return_value={}),
            patch.object(analysis_service, "detect_tech_stack", return_value=[]),
        )

    def test_core_pipeline_emits_in_order_and_reuses_cache(self) -> None:
        events: list[str] = []
        patches = self._patch_pipeline()
        mocks = [item.start() for item in patches]
        try:
            first = analysis_service.get_repo_analysis(
                "https://github.com/acme/demo",
                None,
                callback=lambda stage, _payload: events.append(stage),
            )
            second_events: list[str] = []
            second = analysis_service.get_repo_analysis(
                "https://github.com/acme/demo",
                None,
                callback=lambda stage, _payload: second_events.append(stage),
            )
        finally:
            for item in reversed(patches):
                item.stop()

        self.assertEqual(first.status, "miss")
        self.assertEqual(second.status, "hit")
        self.assertEqual(events, ["metadata", "structure", "techStack"])
        self.assertEqual(second_events, ["metadata", "structure", "techStack"])
        self.assertEqual(mocks[1].call_count, 1)
        self.assertEqual(mocks[2].call_count, 1)

    def test_private_cache_is_isolated_by_user_and_installation(self) -> None:
        users = [
            AuthenticatedUser(user_id="u1", github_id="1"),
            AuthenticatedUser(user_id="u2", github_id="2"),
        ]
        patches = self._patch_pipeline()
        mocks = [item.start() for item in patches[1:]]
        try:
            with patch.object(
                analysis_service.repo_access,
                "resolve_repo_access",
                side_effect=[
                    repo_access.RepoAccess("token-one", 11),
                    repo_access.RepoAccess("token-two", 22),
                ],
            ):
                first = analysis_service.get_repo_analysis(
                    "https://github.com/acme/demo", users[0]
                )
                second = analysis_service.get_repo_analysis(
                    "https://github.com/acme/demo", users[1]
                )
        finally:
            for item in reversed(patches[1:]):
                item.stop()

        self.assertEqual(first.status, "miss")
        self.assertEqual(second.status, "miss")
        self.assertEqual(mocks[0].call_count, 2)

    def test_single_flight_shares_one_concurrent_build(self) -> None:
        cache = analysis_service._SingleFlightCache[str](max_entries=2)
        started = threading.Event()
        release = threading.Event()
        build_count = 0

        def build() -> str:
            nonlocal build_count
            build_count += 1
            started.set()
            release.wait(timeout=2)
            return "snapshot"

        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(cache.get_or_build, "repo", build)
            self.assertTrue(started.wait(timeout=1))
            second = pool.submit(cache.get_or_build, "repo", build)
            time.sleep(0.05)
            release.set()
            results = [first.result(timeout=2), second.result(timeout=2)]

        self.assertEqual(build_count, 1)
        self.assertEqual({result.status for result in results}, {"miss", "shared"})

    def test_stale_entry_returns_immediately_and_refreshes_in_background(self) -> None:
        cache = analysis_service._SingleFlightCache[str](max_entries=2)
        cache.get_or_build("repo", lambda: "old")
        refreshed = threading.Event()

        def refresh() -> str:
            refreshed.set()
            return "new"

        with patch.object(analysis_service, "FRESH_SECONDS", 0), patch.object(
            analysis_service, "STALE_SECONDS", 60
        ):
            result = cache.get_or_build(
                "repo", lambda: "unused", background_builder=refresh
            )

        self.assertEqual(result.status, "stale")
        self.assertEqual(result.value, "old")
        self.assertTrue(refreshed.wait(timeout=1))


if __name__ == "__main__":
    unittest.main()
