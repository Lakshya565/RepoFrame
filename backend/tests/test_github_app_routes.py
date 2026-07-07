import datetime
import hashlib
import hmac
import unittest
import warnings
from unittest.mock import patch

import jwt

with warnings.catch_warnings():
    warnings.simplefilter("ignore")
    from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.services import github_app, installation_store, supabase_client
from app.services.github_app import InstallationAccount
from app.services.installation_store import InMemoryInstallationRepository

# In-process checks of the two security-critical GitHub App routes: the ownership
# binding on /install and the HMAC gate on /webhook. The one real network call
# (reading the installation) is mocked, so nothing hits GitHub.
_client = TestClient(app)
_JWT_SECRET = "gh-app-route-secret-at-least-32-bytes-x"
_WEBHOOK_SECRET = "gh-app-webhook-secret"


def _user_token(github_id: str = "999") -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        "sub": "user-1",
        "aud": "authenticated",
        "iat": now,
        "exp": now + datetime.timedelta(hours=1),
        "user_metadata": {"provider_id": github_id},
    }
    return jwt.encode(payload, _JWT_SECRET, algorithm="HS256")


class InstallRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        supabase_client.reset_client()
        self._cfg = [
            patch.object(config, "SUPABASE_URL", "https://ref.supabase.co"),
            patch.object(config, "SUPABASE_SERVICE_ROLE_KEY", "svc"),
            patch.object(config, "SUPABASE_JWT_SECRET", _JWT_SECRET),
            patch.object(config, "GITHUB_APP_ID", "123"),
            patch.object(config, "GITHUB_APP_PRIVATE_KEY", "dummy-key-presence-only"),
        ]
        for p in self._cfg:
            p.start()

    def tearDown(self) -> None:
        for p in self._cfg:
            p.stop()
        supabase_client.reset_client()

    def test_requires_auth(self) -> None:
        response = _client.post("/api/github/install", json={"installationId": 42})
        self.assertEqual(response.status_code, 401)

    def test_ownership_mismatch_rejected(self) -> None:
        # Installation belongs to GitHub account 111, but the user's identity is 999.
        account = InstallationAccount(account_id=111, login="someone", repo_selection="all")
        store = InMemoryInstallationRepository()
        with patch.object(github_app, "get_installation_account", return_value=account), patch.object(
            installation_store, "get_installation_repository", return_value=store
        ):
            response = _client.post(
                "/api/github/install",
                json={"installationId": 42},
                headers={"Authorization": f"Bearer {_user_token('999')}"},
            )
        self.assertEqual(response.status_code, 403)
        # Nothing was stored for the mismatched attempt.
        self.assertIsNone(store.get_by_user("user-1"))

    def test_successful_bind(self) -> None:
        account = InstallationAccount(account_id=999, login="octocat", repo_selection="selected")
        store = InMemoryInstallationRepository()
        with patch.object(github_app, "get_installation_account", return_value=account), patch.object(
            installation_store, "get_installation_repository", return_value=store
        ):
            response = _client.post(
                "/api/github/install",
                json={"installationId": 42},
                headers={"Authorization": f"Bearer {_user_token('999')}"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["accountLogin"], "octocat")
        self.assertEqual(response.json()["repoSelection"], "selected")
        stored = store.get_by_user("user-1")
        self.assertIsNotNone(stored)
        self.assertEqual(stored.installation_id, 42)


class WebhookRouteTests(unittest.TestCase):
    def _sign(self, body: bytes) -> str:
        return "sha256=" + hmac.new(
            _WEBHOOK_SECRET.encode(), body, hashlib.sha256
        ).hexdigest()

    def test_forged_signature_rejected(self) -> None:
        with patch.object(config, "GITHUB_APP_WEBHOOK_SECRET", _WEBHOOK_SECRET):
            response = _client.post(
                "/api/github/webhook",
                content=b'{"action":"deleted"}',
                headers={
                    "X-Hub-Signature-256": "sha256=forged",
                    "X-GitHub-Event": "installation",
                },
            )
        self.assertEqual(response.status_code, 401)

    def test_valid_signature_accepted(self) -> None:
        body = b'{"action":"created"}'
        # Supabase unconfigured → the handler acknowledges without touching the DB,
        # so this isolates the signature check.
        with patch.object(config, "GITHUB_APP_WEBHOOK_SECRET", _WEBHOOK_SECRET), patch.object(
            supabase_client, "is_configured", return_value=False
        ):
            response = _client.post(
                "/api/github/webhook",
                content=body,
                headers={
                    "X-Hub-Signature-256": self._sign(body),
                    "X-GitHub-Event": "installation",
                },
            )
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
