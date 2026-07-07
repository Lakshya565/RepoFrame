import hashlib
import hmac
import unittest
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app import config
from app.services import github_app
from app.services.github_app import GitHubAppError

# Covers the GitHub App service fully offline: a throwaway RSA key stands in for the
# real App key, and every network call goes through an injected fake — no real
# GitHub, no tokens. Generate the key once (RSA keygen is slow) and reuse it.
_PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_PRIVATE_PEM = _PRIVATE_KEY.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8,
    serialization.NoEncryption(),
).decode()
_PUBLIC_PEM = _PRIVATE_KEY.public_key().public_bytes(
    serialization.Encoding.PEM,
    serialization.PublicFormat.SubjectPublicKeyInfo,
)


def fake_request(status: int, body: dict):
    """Build a fake request callable that always returns the given (status, body)."""

    def _request(method, url, headers=None, json_body=None):
        return status, body

    return _request


class GitHubAppServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        github_app.reset_private_key_cache()
        self._cfg = [
            patch.object(config, "GITHUB_APP_ID", "123456"),
            patch.object(config, "GITHUB_APP_PRIVATE_KEY", _PRIVATE_PEM),
            patch.object(config, "GITHUB_APP_PRIVATE_KEY_PATH", ""),
        ]
        for p in self._cfg:
            p.start()

    def tearDown(self) -> None:
        for p in self._cfg:
            p.stop()
        github_app.reset_private_key_cache()

    def test_is_configured(self) -> None:
        self.assertTrue(github_app.is_configured())
        with patch.object(config, "GITHUB_APP_ID", ""):
            self.assertFalse(github_app.is_configured())

    def test_create_app_jwt_is_valid_rs256(self) -> None:
        token = github_app.create_app_jwt()
        claims = jwt.decode(token, _PUBLIC_PEM, algorithms=["RS256"])
        self.assertEqual(claims["iss"], "123456")
        # Token lifetime (iat→exp) must be within GitHub's 10-minute ceiling.
        self.assertLessEqual(claims["exp"] - claims["iat"], 600)
        self.assertGreater(claims["exp"], claims["iat"])

    def test_get_installation_account(self) -> None:
        body = {
            "account": {"id": 999, "login": "octocat"},
            "repository_selection": "selected",
        }
        account = github_app.get_installation_account(42, request=fake_request(200, body))
        self.assertEqual(account.account_id, 999)
        self.assertEqual(account.login, "octocat")
        self.assertEqual(account.repo_selection, "selected")

    def test_get_installation_account_errors_on_bad_response(self) -> None:
        with self.assertRaises(GitHubAppError):
            github_app.get_installation_account(42, request=fake_request(404, {}))
        with self.assertRaises(GitHubAppError):
            github_app.get_installation_account(42, request=fake_request(200, {}))

    def test_mint_installation_token(self) -> None:
        body = {"token": "ghs_secret", "expires_at": "2026-07-06T01:00:00Z"}
        token = github_app.mint_installation_token(42, request=fake_request(201, body))
        self.assertEqual(token.token, "ghs_secret")
        self.assertEqual(token.expires_at, "2026-07-06T01:00:00Z")

    def test_mint_installation_token_errors(self) -> None:
        with self.assertRaises(GitHubAppError):
            github_app.mint_installation_token(42, request=fake_request(403, {}))

    def test_list_installation_repositories(self) -> None:
        body = {"repositories": [{"full_name": "octocat/hello"}]}
        repos = github_app.list_installation_repositories(
            "ghs_secret", request=fake_request(200, body)
        )
        self.assertEqual(len(repos), 1)
        self.assertEqual(repos[0]["full_name"], "octocat/hello")

    def test_list_installation_repositories_errors(self) -> None:
        with self.assertRaises(GitHubAppError):
            github_app.list_installation_repositories(
                "ghs_secret", request=fake_request(401, {})
            )


class WebhookSignatureTests(unittest.TestCase):
    _SECRET = "webhook-secret-value"

    def _sign(self, body: bytes) -> str:
        return "sha256=" + hmac.new(
            self._SECRET.encode(), body, hashlib.sha256
        ).hexdigest()

    def test_valid_signature_accepted(self) -> None:
        body = b'{"action":"created"}'
        with patch.object(config, "GITHUB_APP_WEBHOOK_SECRET", self._SECRET):
            self.assertTrue(
                github_app.verify_webhook_signature(body, self._sign(body))
            )

    def test_wrong_signature_rejected(self) -> None:
        body = b'{"action":"created"}'
        with patch.object(config, "GITHUB_APP_WEBHOOK_SECRET", self._SECRET):
            self.assertFalse(
                github_app.verify_webhook_signature(body, "sha256=deadbeef")
            )
            # Signature computed over a DIFFERENT body must not verify.
            self.assertFalse(
                github_app.verify_webhook_signature(b'{"action":"deleted"}', self._sign(body))
            )

    def test_missing_header_or_secret_rejected(self) -> None:
        body = b"{}"
        with patch.object(config, "GITHUB_APP_WEBHOOK_SECRET", self._SECRET):
            self.assertFalse(github_app.verify_webhook_signature(body, None))
            self.assertFalse(github_app.verify_webhook_signature(body, "md5=abc"))
        # No secret configured → fail closed even with a present header.
        with patch.object(config, "GITHUB_APP_WEBHOOK_SECRET", ""):
            self.assertFalse(
                github_app.verify_webhook_signature(body, self._sign(body))
            )


if __name__ == "__main__":
    unittest.main()
