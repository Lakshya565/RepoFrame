import unittest
import base64
from unittest.mock import Mock, patch

from requests import RequestException

from app.services.github_service import (
    GITHUB_TOKEN_ENV,
    GitHubCommitActivityError,
    GitHubFileContentError,
    GitHubMetadataError,
    GitHubRateLimitError,
    GitHubTreeError,
    fetch_commit_activity,
    fetch_repo_languages,
    fetch_repo_metadata,
    fetch_rate_limit,
    fetch_repo_text_file,
    fetch_repo_tree,
    reset_conditional_cache,
)


# Small response double that lets service tests exercise parsing and status-code
# handling without making live GitHub API calls.
class FakeResponse:
    def __init__(
        self,
        *,
        status_code: int,
        payload: object | None = None,
        headers: dict[str, str] | None = None,
        json_error: ValueError | None = None,
    ) -> None:
        self.status_code = status_code
        self._payload = payload
        self.headers = headers or {}
        self._json_error = json_error
        self.ok = 200 <= status_code < 300

    def json(self) -> object:
        if self._json_error:
            raise self._json_error

        return self._payload


# Covers GitHub service parsing and error mapping without network access. The
# tests keep GitHub behavior deterministic by injecting fake response objects.
class GitHubServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_conditional_cache()

    def tearDown(self) -> None:
        reset_conditional_cache()

    def test_fetches_repo_metadata(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(
            status_code=200,
            payload={
                "name": "codex",
                "description": "Coding agent",
                "default_branch": "main",
                "stargazers_count": 123,
                "forks_count": 45,
                "language": "TypeScript",
                "html_url": "https://github.com/openai/codex",
            },
        )

        metadata = fetch_repo_metadata("openai", "codex", session=session)

        self.assertEqual(metadata.name, "codex")
        self.assertEqual(metadata.description, "Coding agent")
        self.assertEqual(metadata.default_branch, "main")
        self.assertEqual(metadata.stars, 123)
        self.assertEqual(metadata.forks, 45)
        self.assertEqual(metadata.language, "TypeScript")
        self.assertEqual(metadata.html_url, "https://github.com/openai/codex")

    def test_metadata_reuses_payload_when_etag_returns_not_modified(self) -> None:
        payload = {
            "name": "codex",
            "description": "Coding agent",
            "default_branch": "main",
            "stargazers_count": 123,
            "forks_count": 45,
            "language": "TypeScript",
            "html_url": "https://github.com/openai/codex",
        }
        session = Mock()
        session.get.side_effect = [
            FakeResponse(status_code=200, payload=payload, headers={"ETag": '"v1"'}),
            FakeResponse(status_code=304),
        ]

        first = fetch_repo_metadata("openai", "codex", session=session)
        second = fetch_repo_metadata("openai", "codex", session=session)

        self.assertEqual(first, second)
        self.assertEqual(
            session.get.call_args_list[1].kwargs["headers"]["If-None-Match"],
            '"v1"',
        )

    def test_parses_topics_and_license_from_metadata(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(
            status_code=200,
            payload={
                "name": "codex",
                "description": "Coding agent",
                "default_branch": "main",
                "stargazers_count": 1,
                "forks_count": 2,
                "language": "TypeScript",
                "html_url": "https://github.com/openai/codex",
                "topics": ["cli", "ai", 3, ""],
                "license": {"spdx_id": "MIT", "name": "MIT License"},
            },
        )

        metadata = fetch_repo_metadata("openai", "codex", session=session)

        # Non-string / empty topics are dropped; the SPDX id is preferred.
        self.assertEqual(metadata.topics, ["cli", "ai"])
        self.assertEqual(metadata.license, "MIT")

    def test_metadata_tolerates_missing_topics_and_unrecognized_license(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(
            status_code=200,
            payload={
                "name": "codex",
                "description": None,
                "default_branch": "main",
                "stargazers_count": 0,
                "forks_count": 0,
                "language": None,
                "html_url": "https://github.com/openai/codex",
                # topics absent entirely; license present but unrecognized.
                "license": {"spdx_id": "NOASSERTION", "name": "NOASSERTION"},
            },
        )

        metadata = fetch_repo_metadata("openai", "codex", session=session)

        self.assertEqual(metadata.topics, [])
        self.assertIsNone(metadata.license)

    def test_fetches_language_breakdown(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(
            status_code=200,
            payload={"Java": 500, "C++": 200, "Assembly": 30},
        )

        languages = fetch_repo_languages("openjdk", "jdk", session=session)

        self.assertEqual(languages, {"Java": 500, "C++": 200, "Assembly": 30})
        requested_url = session.get.call_args.args[0]
        self.assertTrue(requested_url.endswith("/repos/openjdk/jdk/languages"))

    def test_language_breakdown_rejects_malformed_entries(self) -> None:
        # Non-int, non-positive, and boolean sizes must be dropped rather than
        # poisoning detection (bools are ints in Python, so they are guarded too).
        session = Mock()
        session.get.return_value = FakeResponse(
            status_code=200,
            payload={"Java": 500, "Bad": "x", "Zero": 0, "Flag": True},
        )

        languages = fetch_repo_languages("openjdk", "jdk", session=session)

        self.assertEqual(languages, {"Java": 500})

    def test_language_breakdown_is_best_effort_on_failure(self) -> None:
        # A failed languages call must not break analysis: it returns {} so
        # detection falls back to the primary language and file signals.
        session = Mock()
        session.get.return_value = FakeResponse(status_code=500)
        self.assertEqual(fetch_repo_languages("openjdk", "jdk", session=session), {})

        session.get.side_effect = RequestException("network failed")
        self.assertEqual(fetch_repo_languages("openjdk", "jdk", session=session), {})

    def test_fetches_commit_activity_weeks(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(
            status_code=200,
            payload=[
                {"week": 1_600_604_800, "total": 4, "days": [0, 1, 1, 0, 1, 1, 0]},
                {"week": 1_600_000_000, "total": 2, "days": [0, 0, 1, 0, 0, 1, 0]},
            ],
        )

        weeks = fetch_commit_activity("openai", "codex", session=session)

        # Sorted oldest-first regardless of GitHub's ordering.
        self.assertEqual([week.week_start for week in weeks], [1_600_000_000, 1_600_604_800])
        self.assertEqual([week.total for week in weeks], [2, 4])
        requested_url = session.get.call_args.args[0]
        self.assertTrue(requested_url.endswith("/repos/openai/codex/stats/commit_activity"))
        self.assertEqual(session.get.call_args.kwargs["timeout"], 20)

    def test_commit_activity_retries_while_computing_then_succeeds(self) -> None:
        # 202 means GitHub is still building the stats cache; a bounded retry should
        # pick up the data once it is ready (sleep is stubbed so the test is instant).
        session = Mock()
        session.get.side_effect = [
            FakeResponse(status_code=202),
            FakeResponse(status_code=200, payload=[{"week": 1_600_000_000, "total": 7}]),
        ]

        weeks = fetch_commit_activity(
            "openai", "codex", session=session, sleep=lambda _seconds: None
        )

        self.assertEqual(len(weeks), 1)
        self.assertEqual(weeks[0].total, 7)
        self.assertEqual(session.get.call_count, 2)

    def test_commit_activity_still_computing_raises_retryable_error(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(status_code=202)

        with self.assertRaises(GitHubCommitActivityError) as ctx:
            fetch_commit_activity(
                "openai", "codex", session=session, sleep=lambda _seconds: None
            )

        self.assertEqual(ctx.exception.status_code, 503)
        self.assertEqual(session.get.call_count, 4)

    def test_commit_activity_empty_repository_returns_no_weeks(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(status_code=204)

        self.assertEqual(fetch_commit_activity("openai", "empty", session=session), [])

    def test_commit_activity_parses_daily_breakdown(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(
            status_code=200,
            payload=[
                {"week": 1_600_000_000, "total": 3, "days": [0, 1, 0, 2, 0, 0, 0]},
            ],
        )

        weeks = fetch_commit_activity("openai", "codex", session=session)

        self.assertEqual(weeks[0].days, (0, 1, 0, 2, 0, 0, 0))

    def test_supports_optional_github_token_header(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(
            status_code=200,
            payload={
                "name": "codex",
                "description": None,
                "default_branch": "main",
                "stargazers_count": 0,
                "forks_count": 0,
                "language": None,
                "html_url": "https://github.com/openai/codex",
            },
        )

        with patch.dict("os.environ", {GITHUB_TOKEN_ENV: "test-token"}):
            fetch_repo_metadata("openai", "codex", session=session)

        headers = session.get.call_args.kwargs["headers"]
        self.assertEqual(headers["Authorization"], "Bearer test-token")

    def test_maps_not_found_to_404(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(status_code=404)

        with self.assertRaises(GitHubMetadataError) as context:
            fetch_repo_metadata("openai", "missing", session=session)

        self.assertEqual(context.exception.status_code, 404)

    def test_maps_rate_limit_to_429(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(
            status_code=403,
            headers={"x-ratelimit-remaining": "0"},
        )

        with self.assertRaises(GitHubMetadataError) as context:
            fetch_repo_metadata("openai", "codex", session=session)

        self.assertEqual(context.exception.status_code, 429)

    def test_maps_network_failure_to_502(self) -> None:
        session = Mock()
        session.get.side_effect = RequestException("network failed")

        with self.assertRaises(GitHubMetadataError) as context:
            fetch_repo_metadata("openai", "codex", session=session)

        self.assertEqual(context.exception.status_code, 502)

    def test_rejects_malformed_payload(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(
            status_code=200,
            payload={"name": "codex"},
        )

        with self.assertRaises(GitHubMetadataError) as context:
            fetch_repo_metadata("openai", "codex", session=session)

        self.assertEqual(context.exception.status_code, 502)

    def test_fetches_recursive_repo_tree(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(
            status_code=200,
            payload={
                "tree": [
                    {
                        "path": "README.md",
                        "type": "blob",
                        "size": 512,
                        "url": "https://api.github.com/tree/readme",
                    },
                    {
                        "path": "src",
                        "type": "tree",
                        "url": "https://api.github.com/tree/src",
                    },
                    {"path": "src/app.py", "type": "blob", "size": 128},
                    {"path": "vendor/tool", "type": "commit"},
                ],
                "truncated": False,
            },
        )

        tree = fetch_repo_tree("openai", "codex", "release/v1", session=session)

        self.assertEqual(tree.total_files, 2)
        self.assertEqual(tree.total_directories, 1)
        self.assertFalse(tree.is_truncated)
        self.assertEqual(tree.files[0].path, "README.md")
        self.assertEqual(tree.files[0].type, "file")
        self.assertEqual(tree.files[0].size, 512)
        self.assertEqual(tree.files[1].type, "directory")
        self.assertEqual(tree.files[2].path, "src/app.py")
        self.assertEqual(tree.files[3].type, "submodule")

        params = session.get.call_args.kwargs["params"]
        self.assertEqual(params, {"recursive": "1"})
        requested_url = session.get.call_args.args[0]
        self.assertTrue(requested_url.endswith("/git/trees/release%2Fv1"))

    def test_normalizes_tree_paths(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(
            status_code=200,
            payload={
                "tree": [
                    {"path": "/src\\app.py", "type": "blob"},
                ],
                "truncated": True,
            },
        )

        tree = fetch_repo_tree("openai", "codex", "main", session=session)

        self.assertEqual(tree.files[0].path, "src/app.py")
        self.assertTrue(tree.is_truncated)

    def test_rejects_malformed_tree_payload(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(
            status_code=200,
            payload={"tree": [{"path": "README.md"}]},
        )

        with self.assertRaises(GitHubTreeError) as context:
            fetch_repo_tree("openai", "codex", "main", session=session)

        self.assertEqual(context.exception.status_code, 502)

    def test_maps_tree_rate_limit_to_429(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(
            status_code=403,
            headers={"x-ratelimit-remaining": "0"},
        )

        with self.assertRaises(GitHubTreeError) as context:
            fetch_repo_tree("openai", "codex", "main", session=session)

        self.assertEqual(context.exception.status_code, 429)

    def test_fetches_text_file_content(self) -> None:
        session = Mock()
        encoded_content = base64.b64encode(b'{"dependencies":{}}').decode("ascii")
        session.get.return_value = FakeResponse(
            status_code=200,
            payload={
                "type": "file",
                "size": 19,
                "encoding": "base64",
                "content": encoded_content,
            },
        )

        file_content = fetch_repo_text_file(
            "openai",
            "codex",
            "package.json",
            "main",
            100,
            session=session,
        )

        self.assertEqual(file_content.path, "package.json")
        self.assertEqual(file_content.content, '{"dependencies":{}}')
        self.assertEqual(file_content.size, 19)
        self.assertEqual(session.get.call_args.kwargs["params"], {"ref": "main"})

    def test_rejects_oversized_text_file_content(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(
            status_code=200,
            payload={
                "type": "file",
                "size": 101,
                "encoding": "base64",
                "content": "",
            },
        )

        with self.assertRaises(GitHubFileContentError) as context:
            fetch_repo_text_file(
                "openai",
                "codex",
                "README.md",
                "main",
                100,
                session=session,
            )

        self.assertEqual(context.exception.status_code, 413)

    def test_fetches_rate_limit_status(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(
            status_code=200,
            payload={
                "resources": {
                    "core": {
                        "limit": 5000,
                        "used": 125,
                        "remaining": 4875,
                        "reset": 1710000000,
                    }
                }
            },
        )

        with patch.dict("os.environ", {GITHUB_TOKEN_ENV: "test-token"}):
            rate_limit = fetch_rate_limit(session=session)

        self.assertEqual(rate_limit.limit, 5000)
        self.assertEqual(rate_limit.used, 125)
        self.assertEqual(rate_limit.remaining, 4875)
        self.assertEqual(rate_limit.reset, 1710000000)
        self.assertEqual(rate_limit.reset_at, "2024-03-09T16:00:00+00:00")
        self.assertTrue(rate_limit.is_authenticated)
        requested_url = session.get.call_args.args[0]
        self.assertTrue(requested_url.endswith("/rate_limit"))

    def test_rejects_malformed_rate_limit_payload(self) -> None:
        session = Mock()
        session.get.return_value = FakeResponse(
            status_code=200,
            payload={"resources": {"core": {"limit": 5000}}},
        )

        with self.assertRaises(GitHubRateLimitError) as context:
            fetch_rate_limit(session=session)

        self.assertEqual(context.exception.status_code, 502)

    def test_maps_rate_limit_network_failure_to_502(self) -> None:
        session = Mock()
        session.get.side_effect = RequestException("network failed")

        with self.assertRaises(GitHubRateLimitError) as context:
            fetch_rate_limit(session=session)

        self.assertEqual(context.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
