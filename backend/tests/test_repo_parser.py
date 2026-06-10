import re
import unittest

from pydantic import ValidationError

from app.schemas.repo import RepoParseRequest
from app.services.repo_parser import (
    INVALID_REPO_URL_MESSAGE,
    RepoUrlParseError,
    parse_github_repo_url,
)


class RepoParserTests(unittest.TestCase):
    def test_parses_browser_url(self) -> None:
        parsed_repo = parse_github_repo_url("https://github.com/openai/codex")

        self.assertEqual(parsed_repo.owner, "openai")
        self.assertEqual(parsed_repo.repo, "codex")
        self.assertEqual(parsed_repo.normalized_url, "https://github.com/openai/codex")

    def test_parses_https_clone_url(self) -> None:
        parsed_repo = parse_github_repo_url("https://github.com/openai/codex.git")

        self.assertEqual(parsed_repo.owner, "openai")
        self.assertEqual(parsed_repo.repo, "codex")
        self.assertEqual(parsed_repo.normalized_url, "https://github.com/openai/codex")

    def test_rejects_invalid_urls_with_fallback_message(self) -> None:
        invalid_urls = [
            "",
            "not-a-url",
            "http://github.com/openai/codex",
            "https://github.com/openai/codex/tree/main",
            "https://github.com/openai/codex/",
            "https://github.com/openai/codex?tab=readme",
            "https://github.com/openai/codex#readme",
            "https://github.com/openai/codex%0A",
            "https://github.com/openai/codex;rm",
            "https://github.com/openai/codex && rm -rf .",
            "https://github.com:443/openai/codex",
            "https://user@github.com/openai/codex",
            "https://evil.com/openai/codex",
            "git@github.com:openai/codex.git",
            "https://github.com/-bad-owner/codex",
            "https://github.com/openai/.git",
        ]

        for invalid_url in invalid_urls:
            with self.subTest(invalid_url=invalid_url):
                with self.assertRaisesRegex(
                    RepoUrlParseError,
                    re.escape(INVALID_REPO_URL_MESSAGE),
                ):
                    parse_github_repo_url(invalid_url)

    def test_rejects_invalid_request_shapes(self) -> None:
        invalid_payloads = [
            {},
            {"repoUrl": 123},
            {"repoUrl": ""},
            {"repoUrl": "https://github.com/openai/codex", "extra": "value"},
            {"repo_url": "https://github.com/openai/codex"},
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(ValidationError):
                    RepoParseRequest.model_validate(payload)


if __name__ == "__main__":
    unittest.main()
