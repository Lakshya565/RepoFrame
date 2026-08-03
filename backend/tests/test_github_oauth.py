import unittest
from unittest.mock import patch

from cryptography.fernet import Fernet

from app import config
from app.services import github_oauth
from app.services.github_authorization_store import (
    InMemoryGitHubAuthorizationRepository,
)


def fake_request(status: int, body: dict):
    def request(method, url, headers=None, data=None):
        return status, body

    return request


class GitHubOAuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self._patches = [
            patch.object(config, "GITHUB_APP_CLIENT_ID", "client-id"),
            patch.object(config, "GITHUB_APP_CLIENT_SECRET", "client-secret"),
            patch.object(config, "GITHUB_APP_SLUG", "repoframe"),
            patch.object(
                config,
                "GITHUB_APP_STATE_SECRET",
                "state-secret-that-is-definitely-over-32-bytes",
            ),
            patch.object(
                config,
                "GITHUB_USER_TOKEN_ENCRYPTION_KEY",
                Fernet.generate_key().decode(),
            ),
        ]
        for item in self._patches:
            item.start()

    def tearDown(self) -> None:
        for item in self._patches:
            item.stop()

    def test_configuration_rejects_invalid_encryption_key(self) -> None:
        self.assertTrue(github_oauth.is_configured())
        with patch.object(config, "GITHUB_USER_TOKEN_ENCRYPTION_KEY", "invalid"):
            self.assertFalse(github_oauth.is_configured())

    def test_state_binds_user_and_local_return_path(self) -> None:
        state = github_oauth.create_install_state("user-1", "/saved")
        self.assertEqual(
            github_oauth.read_install_state(state, "user-1").return_to,
            "/saved",
        )
        with self.assertRaises(github_oauth.GitHubOAuthError):
            github_oauth.read_install_state(state, "user-2")

    def test_state_rejects_external_redirect(self) -> None:
        state = github_oauth.create_install_state("user-1", "https://bad.example")
        self.assertEqual(
            github_oauth.read_install_state(state, "user-1").return_to,
            "/",
        )

    def test_authorization_start_binds_pkce_verifier(self) -> None:
        start = github_oauth.create_authorization_start("user-1", "/saved")
        self.assertIn("github.com/login/oauth/authorize", start.authorization_url)
        state = github_oauth.read_install_state(start.state, "user-1")
        github_oauth.validate_code_verifier(state, start.code_verifier)
        with self.assertRaises(github_oauth.GitHubOAuthError):
            github_oauth.validate_code_verifier(state, "wrong-verifier")

    def test_exchange_code_parses_expiring_token(self) -> None:
        token = github_oauth.exchange_code(
            "code",
            request=fake_request(
                200,
                {
                    "access_token": "ghu_access",
                    "expires_in": 28800,
                    "refresh_token": "ghr_refresh",
                    "refresh_token_expires_in": 15897600,
                },
            ),
        )
        self.assertEqual(token.access_token, "ghu_access")
        self.assertEqual(token.refresh_token, "ghr_refresh")
        self.assertIsNotNone(token.access_expires_at)

    def test_lists_personal_and_organization_installations(self) -> None:
        installations = github_oauth.list_user_installations(
            "ghu_access",
            request=fake_request(
                200,
                {
                    "installations": [
                        {
                            "id": 10,
                            "account": {"id": 1, "login": "octo", "type": "User"},
                            "repository_selection": "selected",
                            "html_url": "https://github.com/settings/installations/10",
                        },
                        {
                            "id": 20,
                            "account": {
                                "id": 2,
                                "login": "octo-org",
                                "type": "Organization",
                            },
                            "repository_selection": "all",
                            "html_url": "https://github.com/organizations/octo-org/settings/installations/20",
                        },
                    ]
                },
            ),
        )
        self.assertEqual([item.account_type for item in installations], ["User", "Organization"])

    def test_tokens_are_encrypted_at_rest_and_decrypted_for_use(self) -> None:
        repository = InMemoryGitHubAuthorizationRepository()
        token = github_oauth.GitHubUserToken("ghu_access", None, None, None)
        record = github_oauth.save_authorization(repository, "user-1", 99, token)
        self.assertNotIn("ghu_access", record.access_token_ciphertext)
        self.assertEqual(
            github_oauth.get_valid_access_token(repository, "user-1"),
            "ghu_access",
        )


if __name__ == "__main__":
    unittest.main()
