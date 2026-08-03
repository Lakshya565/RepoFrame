import unittest
from unittest.mock import patch

from app import config
from app.services import (
    github_app,
    github_authorization_store,
    github_oauth,
    github_service,
    installation_store,
    repo_access,
    supabase_client,
)
from app.services.auth import AuthenticatedUser
from app.services.github_app import InstallationToken
from app.services.installation_store import InstallationRecord


# The installation token flows to every GitHub fetch through _build_headers, so the
# header logic is the single thing to verify for the plumbing.
class BuildHeadersTokenTests(unittest.TestCase):
    def tearDown(self) -> None:
        github_service.set_installation_token(None)

    def test_installation_token_takes_precedence(self) -> None:
        github_service.set_installation_token("ghs_installation")
        try:
            headers = github_service._build_headers()
            self.assertEqual(headers["Authorization"], "Bearer ghs_installation")
        finally:
            github_service.set_installation_token(None)

    def test_no_token_falls_back_to_pat(self) -> None:
        github_service.set_installation_token(None)
        with patch.dict("os.environ", {"GITHUB_TOKEN": "pat_value"}):
            headers = github_service._build_headers()
            self.assertEqual(headers["Authorization"], "Bearer pat_value")


# resolve_installation_token: use a token only when the user has an installation
# that actually grants the requested repo; otherwise the public path (None).
class ResolveInstallationTokenTests(unittest.TestCase):
    def setUp(self) -> None:
        repo_access.reset_access_cache()
        self.user = AuthenticatedUser(user_id="u1", github_id="999")
        self._cfg = [
            patch.object(config, "GITHUB_APP_ID", "123"),
            patch.object(config, "GITHUB_APP_PRIVATE_KEY", "key"),
            patch.object(config, "SUPABASE_URL", "https://ref.supabase.co"),
            patch.object(config, "SUPABASE_SERVICE_ROLE_KEY", "svc"),
            patch.object(github_oauth, "is_configured", return_value=True),
        ]
        for p in self._cfg:
            p.start()

    def tearDown(self) -> None:
        repo_access.reset_access_cache()
        for p in self._cfg:
            p.stop()

    def _with_installation(self, record: InstallationRecord | None):
        store = installation_store.InMemoryInstallationRepository()
        if record is not None:
            store.upsert(record)
        authorization_store = (
            github_authorization_store.InMemoryGitHubAuthorizationRepository()
        )
        return (
            patch.object(
                installation_store, "get_installation_repository", return_value=store
            ),
            patch.object(
                github_authorization_store,
                "get_github_authorization_repository",
                return_value=authorization_store,
            ),
        )

    def test_none_when_no_user(self) -> None:
        self.assertIsNone(resolve_none := repo_access.resolve_installation_token(None, "o", "r"))

    def test_none_when_app_unconfigured(self) -> None:
        with patch.object(config, "GITHUB_APP_ID", ""):
            self.assertIsNone(
                repo_access.resolve_installation_token(self.user, "o", "r")
            )

    def test_none_when_no_installation(self) -> None:
        installation_patch, authorization_patch = self._with_installation(None)
        with installation_patch, authorization_patch, patch.object(
            github_oauth, "get_valid_access_token", return_value="ghu_user"
        ):
            self.assertIsNone(
                repo_access.resolve_installation_token(self.user, "octo", "repo")
            )

    def test_token_when_repo_in_installation(self) -> None:
        record = InstallationRecord("u1", 42, 999, "octo", "selected")
        installation_patch, authorization_patch = self._with_installation(record)
        with installation_patch, authorization_patch, patch.object(
            github_oauth, "get_valid_access_token", return_value="ghu_user"
        ), patch.object(
            github_oauth,
            "list_user_installation_repositories",
            return_value=frozenset({"octo/repo"}),
        ), patch.object(
            github_app, "mint_installation_token", return_value=InstallationToken("ghs_x", "")
        ):
            token = repo_access.resolve_installation_token(self.user, "octo", "repo")
        self.assertEqual(token, "ghs_x")

    def test_reuses_unexpired_token_and_repository_list(self) -> None:
        record = InstallationRecord("u1", 42, 999, "octo", "selected")
        installation_patch, authorization_patch = self._with_installation(record)
        with installation_patch, authorization_patch, patch.object(
            github_oauth, "get_valid_access_token", return_value="ghu_user"
        ), patch.object(
            github_app,
            "mint_installation_token",
            return_value=InstallationToken("ghs_x", ""),
        ) as mint, patch.object(
            github_oauth,
            "list_user_installation_repositories",
            return_value=frozenset({"octo/repo"}),
        ) as list_repositories:
            first = repo_access.resolve_installation_token(
                self.user, "octo", "repo"
            )
            second = repo_access.resolve_installation_token(
                self.user, "octo", "repo"
            )

        self.assertEqual(first, "ghs_x")
        self.assertEqual(second, "ghs_x")
        mint.assert_called_once_with(42)
        list_repositories.assert_called_once_with("ghu_user", 42)

    def test_none_when_repo_not_in_installation(self) -> None:
        record = InstallationRecord("u1", 42, 999, "octo", "selected")
        installation_patch, authorization_patch = self._with_installation(record)
        with installation_patch, authorization_patch, patch.object(
            github_oauth, "get_valid_access_token", return_value="ghu_user"
        ), patch.object(
            github_oauth,
            "list_user_installation_repositories",
            return_value=frozenset({"octo/other"}),
        ), patch.object(
            github_app, "mint_installation_token", return_value=InstallationToken("ghs_x", "")
        ):
            token = repo_access.resolve_installation_token(self.user, "octo", "repo")
        self.assertIsNone(token)


if __name__ == "__main__":
    unittest.main()
