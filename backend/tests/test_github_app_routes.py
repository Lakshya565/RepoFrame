import datetime
import hashlib
import hmac
import unittest
import warnings
from unittest.mock import patch

import jwt
from cryptography.fernet import Fernet

with warnings.catch_warnings():
    warnings.simplefilter("ignore")
    from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.services import (
    github_app,
    github_connections,
    installation_store,
    supabase_client,
)
from app.services.github_app import InstallationAccount
from app.services.installation_store import (
    InMemoryInstallationRepository,
    InstallationRecord,
)

_client = TestClient(app)
_JWT_SECRET = "gh-app-route-secret-at-least-32-bytes-x"
_WEBHOOK_SECRET = "gh-app-webhook-secret"
_FERNET_KEY = Fernet.generate_key().decode()


def _user_token(github_id: str = "999") -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    return jwt.encode(
        {
            "sub": "user-1",
            "aud": "authenticated",
            "iat": now,
            "exp": now + datetime.timedelta(hours=1),
            "user_metadata": {"provider_id": github_id},
        },
        _JWT_SECRET,
        algorithm="HS256",
    )


class LegacyInstallRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        supabase_client.reset_client()
        self._cfg = [
            patch.object(config, "SUPABASE_URL", "https://ref.supabase.co"),
            patch.object(config, "SUPABASE_SERVICE_ROLE_KEY", "svc"),
            patch.object(config, "SUPABASE_JWT_SECRET", _JWT_SECRET),
            patch.object(config, "GITHUB_APP_ID", "123"),
            patch.object(config, "GITHUB_APP_PRIVATE_KEY", "dummy-key-presence-only"),
        ]
        for item in self._cfg:
            item.start()

    def tearDown(self) -> None:
        for item in self._cfg:
            item.stop()
        supabase_client.reset_client()

    def test_requires_auth(self) -> None:
        response = _client.post("/api/github/install", json={"installationId": 42})
        self.assertEqual(response.status_code, 401)

    def test_ownership_mismatch_rejected(self) -> None:
        account = InstallationAccount(111, "someone", "all")
        store = InMemoryInstallationRepository()
        with patch.object(
            github_app, "get_installation_account", return_value=account
        ), patch.object(
            installation_store, "get_installation_repository", return_value=store
        ):
            response = _client.post(
                "/api/github/install",
                json={"installationId": 42},
                headers={"Authorization": f"Bearer {_user_token()}"},
            )
        self.assertEqual(response.status_code, 403)
        self.assertIsNone(store.get_by_user("user-1"))

    def test_successful_personal_bind(self) -> None:
        account = InstallationAccount(999, "octocat", "selected")
        store = InMemoryInstallationRepository()
        with patch.object(
            github_app, "get_installation_account", return_value=account
        ), patch.object(
            installation_store, "get_installation_repository", return_value=store
        ):
            response = _client.post(
                "/api/github/install",
                json={"installationId": 42},
                headers={"Authorization": f"Bearer {_user_token()}"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["accountLogin"], "octocat")
        self.assertEqual(store.get_by_user("user-1").installation_id, 42)


class OAuthInstallRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self._cfg = [
            patch.object(config, "SUPABASE_URL", "https://ref.supabase.co"),
            patch.object(config, "SUPABASE_SERVICE_ROLE_KEY", "svc"),
            patch.object(config, "SUPABASE_JWT_SECRET", _JWT_SECRET),
            patch.object(config, "GITHUB_APP_ID", "123"),
            patch.object(config, "GITHUB_APP_PRIVATE_KEY", "key"),
            patch.object(config, "GITHUB_APP_CLIENT_ID", "client"),
            patch.object(config, "GITHUB_APP_CLIENT_SECRET", "secret"),
            patch.object(config, "GITHUB_APP_SLUG", "repoframe"),
            patch.object(
                config,
                "GITHUB_APP_STATE_SECRET",
                "state-secret-that-is-definitely-over-32-bytes",
            ),
            patch.object(
                config,
                "GITHUB_USER_TOKEN_ENCRYPTION_KEY",
                _FERNET_KEY,
            ),
        ]
        for item in self._cfg:
            item.start()

    def tearDown(self) -> None:
        for item in self._cfg:
            item.stop()

    def test_start_requires_auth(self) -> None:
        response = _client.post(
            "/api/github/install/start", json={"returnTo": "/saved"}
        )
        self.assertEqual(response.status_code, 401)

    def test_start_returns_pkce_authorization_url(self) -> None:
        response = _client.post(
            "/api/github/install/start",
            json={"returnTo": "/saved"},
            headers={"Authorization": f"Bearer {_user_token()}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("github.com/login/oauth/authorize", response.json()["authorizationUrl"])
        self.assertTrue(response.json()["state"])
        self.assertTrue(response.json()["codeVerifier"])

    def test_force_install_returns_install_picker(self) -> None:
        response = _client.post(
            "/api/github/install/start",
            json={"returnTo": "/saved", "forceInstall": True},
            headers={"Authorization": f"Bearer {_user_token()}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(
            "github.com/apps/repoframe/installations/new",
            response.json()["installUrl"],
        )
        self.assertIsNone(response.json()["codeVerifier"])

    def test_connections_include_personal_and_organization_installs(self) -> None:
        state = github_connections.ConnectionState(
            status="connected",
            installations=(
                InstallationRecord("user-1", 10, 999, "octo", "selected"),
                InstallationRecord(
                    "user-1",
                    20,
                    777,
                    "octo-org",
                    "all",
                    account_type="Organization",
                ),
            ),
        )
        with patch.object(
            github_connections, "get_connection_state", return_value=state
        ):
            response = _client.get(
                "/api/github/connections",
                headers={"Authorization": f"Bearer {_user_token()}"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["installations"]), 2)
        self.assertEqual(
            response.json()["installations"][1]["accountType"], "Organization"
        )

    def test_complete_returns_safe_destination(self) -> None:
        state = github_connections.ConnectionState(
            status="connected",
            installations=(
                InstallationRecord("user-1", 10, 999, "octo", "all"),
            ),
        )
        with patch.object(
            github_connections,
            "complete_install",
            return_value=github_connections.CompletedConnection(state, "/saved"),
        ):
            response = _client.post(
                "/api/github/install/complete",
                json={"code": "one-time-code", "state": "signed-state"},
                headers={"Authorization": f"Bearer {_user_token()}"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["returnTo"], "/saved")


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
        with patch.object(
            config, "GITHUB_APP_WEBHOOK_SECRET", _WEBHOOK_SECRET
        ), patch.object(supabase_client, "is_configured", return_value=False):
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
