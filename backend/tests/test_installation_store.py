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

    def test_one_user_can_hold_multiple_installations(self) -> None:
        self.repo.upsert(_record(installation=42))
        self.repo.upsert(_record(installation=77, selection="selected"))
        records = self.repo.list_by_user("user-1")
        self.assertEqual([record.installation_id for record in records], [42, 77])
        self.assertEqual(records[1].repo_selection, "selected")

    def test_same_installation_can_map_to_multiple_org_members(self) -> None:
        self.repo.upsert(_record(user="user-1", installation=42))
        self.repo.upsert(_record(user="user-2", installation=42))
        self.assertEqual(len(self.repo.list_by_installation(42)), 2)
        self.assertTrue(self.repo.delete_user_installation("user-1", 42))
        self.assertEqual(self.repo.get_by_installation(42).user_id, "user-2")

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
