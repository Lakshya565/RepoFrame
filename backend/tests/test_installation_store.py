import unittest

from app.services.installation_store import (
    InMemoryInstallationRepository,
    InstallationRecord,
)


def _record(
    user: str = "user-1",
    installation: int = 42,
    account: int = 999,
    login: str = "octocat",
    selection: str = "all",
) -> InstallationRecord:
    return InstallationRecord(user, installation, account, login, selection)


# The behavioral contract for the installation mapping, exercised against the
# in-memory implementation (fully offline). The Supabase implementation mirrors it
# and is validated by a manual live smoke.
class InMemoryInstallationRepositoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repo = InMemoryInstallationRepository()

    def test_upsert_and_lookups(self) -> None:
        self.repo.upsert(_record())
        self.assertEqual(self.repo.get_by_user("user-1").installation_id, 42)
        self.assertEqual(self.repo.get_by_installation(42).user_id, "user-1")

    def test_upsert_overwrites_same_user(self) -> None:
        self.repo.upsert(_record(installation=42))
        self.repo.upsert(_record(installation=77, selection="selected"))
        record = self.repo.get_by_user("user-1")
        self.assertEqual(record.installation_id, 77)
        self.assertEqual(record.repo_selection, "selected")

    def test_get_missing_returns_none(self) -> None:
        self.assertIsNone(self.repo.get_by_user("nobody"))
        self.assertIsNone(self.repo.get_by_installation(123))

    def test_delete_by_installation(self) -> None:
        self.repo.upsert(_record())
        self.assertTrue(self.repo.delete_by_installation(42))
        self.assertIsNone(self.repo.get_by_user("user-1"))
        self.assertFalse(self.repo.delete_by_installation(42))

    def test_set_repo_selection(self) -> None:
        self.repo.upsert(_record(selection="all"))
        self.assertTrue(self.repo.set_repo_selection(42, "selected"))
        self.assertEqual(self.repo.get_by_user("user-1").repo_selection, "selected")
        self.assertFalse(self.repo.set_repo_selection(999, "all"))


if __name__ == "__main__":
    unittest.main()
