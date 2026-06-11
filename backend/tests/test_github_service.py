import unittest
from unittest.mock import Mock, patch

from requests import RequestException

from app.services.github_service import (
    GITHUB_TOKEN_ENV,
    GitHubMetadataError,
    GitHubRateLimitError,
    GitHubTreeError,
    fetch_repo_metadata,
    fetch_rate_limit,
    fetch_repo_tree,
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
