import unittest
from unittest.mock import Mock, patch

from requests import RequestException

from app.services.github_service import (
    GITHUB_TOKEN_ENV,
    GitHubMetadataError,
    fetch_repo_metadata,
)


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


if __name__ == "__main__":
    unittest.main()
