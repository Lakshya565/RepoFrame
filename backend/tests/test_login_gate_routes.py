import unittest
import warnings
from unittest.mock import patch

with warnings.catch_warnings():
    # starlette's TestClient warns about httpx; irrelevant to these tests.
    warnings.simplefilter("ignore")
    from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.routers import generate as generate_module
from app.routers import repo as repo_module
from app.services import supabase_client
from app.services.auth import (
    require_user_or_public_demo,
    require_user_when_configured,
)

# End-to-end (in-process) check that the login gate is actually wired onto the live
# analyze/generate routers — not just available as a dependency. Uses the pure
# /api/repo/parse endpoint (URL parsing only: no GitHub, no OpenAI, zero spend) so
# a broken gate can never reach a token-spending handler here.
_client = TestClient(app)
_VALID_BODY = {"repoUrl": "https://github.com/octo/hello"}
# The public demo repo, which the repo router lets anonymous callers read even when
# Supabase is configured (config.DEMO_REPO_* defaults).
_DEMO_BODY = {"repoUrl": "https://github.com/Lakshya565/RepoFrame"}


class LoginGateRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        supabase_client.reset_client()

    def tearDown(self) -> None:
        supabase_client.reset_client()

    def test_open_when_unconfigured(self) -> None:
        # Local dev / self-host: no Supabase => the analyze flow works with no login.
        with patch.object(config, "SUPABASE_URL", ""), patch.object(
            config, "SUPABASE_SERVICE_ROLE_KEY", ""
        ):
            response = _client.post("/api/repo/parse", json=_VALID_BODY)
            self.assertEqual(response.status_code, 200)

    def test_requires_login_when_configured(self) -> None:
        # Production-like: Supabase configured + no token => 401 before any work.
        with patch.object(config, "SUPABASE_URL", "https://ref.supabase.co"), patch.object(
            config, "SUPABASE_SERVICE_ROLE_KEY", "svc"
        ):
            response = _client.post("/api/repo/parse", json=_VALID_BODY)
            self.assertEqual(response.status_code, 401)

    def test_public_demo_repo_allowed_when_configured(self) -> None:
        # Production-like + no token, but the request targets the public demo repo:
        # the repo router lets it through so the signed-out demo can load live data.
        # (/parse does no GitHub/OpenAI work, so this only exercises the gate.)
        with patch.object(config, "SUPABASE_URL", "https://ref.supabase.co"), patch.object(
            config, "SUPABASE_SERVICE_ROLE_KEY", "svc"
        ):
            response = _client.post("/api/repo/parse", json=_DEMO_BODY)
            self.assertEqual(response.status_code, 200)

    def test_both_routers_carry_the_gate(self) -> None:
        # Structural guard: each router declares its login gate at the router level,
        # so it applies to every current and future route (checked without executing
        # handlers). The repo router uses the demo-aware variant; generate stays
        # strict (no public-demo exception — generation must always be logged in).
        repo_deps = [dep.dependency for dep in repo_module.router.dependencies]
        self.assertIn(require_user_or_public_demo, repo_deps)

        generate_deps = [dep.dependency for dep in generate_module.router.dependencies]
        self.assertIn(require_user_when_configured, generate_deps)


if __name__ == "__main__":
    unittest.main()
