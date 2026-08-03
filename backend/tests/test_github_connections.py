import unittest
from unittest.mock import patch

from app.services import (
    github_authorization_store,
    github_connections,
    github_oauth,
    installation_store,
)
from app.services.auth import AuthenticatedUser
from app.services.installation_store import InstallationRecord


class GitHubConnectionServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.installations = installation_store.InMemoryInstallationRepository()
        self.authorizations = (
            github_authorization_store.InMemoryGitHubAuthorizationRepository()
        )
        self.user = AuthenticatedUser("user-1", github_id="999")
        self._stores = [
            patch.object(
                installation_store,
                "get_installation_repository",
                return_value=self.installations,
            ),
            patch.object(
                github_authorization_store,
                "get_github_authorization_repository",
                return_value=self.authorizations,
            ),
        ]
        for item in self._stores:
            item.start()

    def tearDown(self) -> None:
        for item in self._stores:
            item.stop()

    def test_complete_syncs_multiple_installations_and_removes_stale_rows(self) -> None:
        self.installations.upsert(
            InstallationRecord("user-1", 5, 5, "old-org", "all")
        )
        token = github_oauth.GitHubUserToken("ghu_access", None, None, None)
        visible = [
            github_oauth.UserInstallation(10, 999, "octo", "User", "selected", ""),
            github_oauth.UserInstallation(
                20,
                777,
                "octo-org",
                "Organization",
                "all",
                "https://github.com/organizations/octo-org/settings/installations/20",
            ),
        ]
        with patch.object(
            github_oauth,
            "read_install_state",
            return_value=github_oauth.InstallState("/saved", None),
        ), patch.object(github_oauth, "exchange_code", return_value=token), patch.object(
            github_oauth,
            "get_github_user",
            return_value=github_oauth.GitHubUser(999, "octo"),
        ), patch.object(
            github_oauth, "list_user_installations", return_value=visible
        ), patch.object(github_oauth, "save_authorization") as save:
            completed = github_connections.complete_install(
                self.user, "code", "state"
            )

        self.assertEqual(completed.return_to, "/saved")
        self.assertEqual(completed.connection.status, "connected")
        self.assertEqual(
            {
                record.installation_id
                for record in completed.connection.installations
            },
            {10, 20},
        )
        self.assertIsNone(self.installations.get_by_installation(5))
        self.assertEqual(
            self.installations.get_by_installation(20).account_type,
            "Organization",
        )
        save.assert_called_once()

    def test_mismatched_github_identity_is_rejected_before_storage(self) -> None:
        token = github_oauth.GitHubUserToken("ghu_access", None, None, None)
        with patch.object(
            github_oauth,
            "read_install_state",
            return_value=github_oauth.InstallState("/", None),
        ), patch.object(github_oauth, "exchange_code", return_value=token), patch.object(
            github_oauth,
            "get_github_user",
            return_value=github_oauth.GitHubUser(123, "other"),
        ), patch.object(github_oauth, "save_authorization") as save:
            with self.assertRaises(github_oauth.GitHubOAuthError):
                github_connections.complete_install(self.user, "code", "state")
        save.assert_not_called()

    def test_authorized_user_without_installation_continues_to_picker(self) -> None:
        token = github_oauth.GitHubUserToken("ghu_access", None, None, None)
        with patch.object(
            github_oauth,
            "read_install_state",
            return_value=github_oauth.InstallState("/", None),
        ), patch.object(github_oauth, "exchange_code", return_value=token), patch.object(
            github_oauth,
            "get_github_user",
            return_value=github_oauth.GitHubUser(999, "octo"),
        ), patch.object(
            github_oauth, "list_user_installations", return_value=[]
        ), patch.object(github_oauth, "save_authorization"), patch.object(
            github_oauth, "create_install_state", return_value="next-state"
        ), patch.object(
            github_oauth,
            "build_install_url",
            return_value="https://github.com/apps/repoframe/installations/new",
        ):
            completed = github_connections.complete_install(
                self.user, "code", "state"
            )

        self.assertEqual(completed.connection.status, "not_connected")
        self.assertEqual(completed.next_state, "next-state")
        self.assertIn("installations/new", completed.next_url)


if __name__ == "__main__":
    unittest.main()
