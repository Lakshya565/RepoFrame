from dataclasses import dataclass
from typing import Protocol

from app.services import supabase_client

# Storage for the Supabase-user ↔ GitHub-App-installation mapping (Phase 15.4).
# This is the ONLY thing RepoFrame persists about repo access: a non-secret
# installation_id, the GitHub account it belongs to (for the ownership check), and
# the repo-selection scope. No token is ever stored — installation tokens are
# minted per request (github_app.py) and discarded.
#
# Same shape as project_store: a Protocol with an in-memory fake (tests) and a
# Supabase implementation (production). The table is service-role-only (RLS denies
# all client roles), so this is never reachable from the frontend directly.


# One stored mapping row.
@dataclass(frozen=True)
class InstallationRecord:
    user_id: str
    installation_id: int
    github_account_id: int
    account_login: str
    repo_selection: str  # 'all' | 'selected'


# The store contract. Lookups exist both by user (the install/analyze paths) and by
# installation_id (the webhook, which only knows the installation).
class InstallationRepository(Protocol):
    def upsert(self, record: InstallationRecord) -> InstallationRecord: ...

    def get_by_user(self, user_id: str) -> InstallationRecord | None: ...

    def get_by_installation(
        self, installation_id: int
    ) -> InstallationRecord | None: ...

    def delete_by_installation(self, installation_id: int) -> bool: ...

    def set_repo_selection(
        self, installation_id: int, repo_selection: str
    ) -> bool: ...


# In-memory implementation for the offline test suite.
class InMemoryInstallationRepository:
    def __init__(self) -> None:
        # Keyed by user_id (one installation per user, matching the table's PK).
        self._by_user: dict[str, InstallationRecord] = {}

    def upsert(self, record: InstallationRecord) -> InstallationRecord:
        self._by_user[record.user_id] = record
        return record

    def get_by_user(self, user_id: str) -> InstallationRecord | None:
        return self._by_user.get(user_id)

    def get_by_installation(
        self, installation_id: int
    ) -> InstallationRecord | None:
        for record in self._by_user.values():
            if record.installation_id == installation_id:
                return record
        return None

    def delete_by_installation(self, installation_id: int) -> bool:
        for user_id, record in list(self._by_user.items()):
            if record.installation_id == installation_id:
                del self._by_user[user_id]
                return True
        return False

    def set_repo_selection(
        self, installation_id: int, repo_selection: str
    ) -> bool:
        for user_id, record in self._by_user.items():
            if record.installation_id == installation_id:
                self._by_user[user_id] = InstallationRecord(
                    user_id=record.user_id,
                    installation_id=record.installation_id,
                    github_account_id=record.github_account_id,
                    account_login=record.account_login,
                    repo_selection=repo_selection,
                )
                return True
        return False


# Supabase-backed implementation. Validated by a manual live smoke (the user_id FK
# needs a real auth.users row); the in-memory tests lock the contract.
class SupabaseInstallationRepository:
    _TABLE = "user_installations"

    def upsert(self, record: InstallationRecord) -> InstallationRecord:
        client = supabase_client.get_client()
        client.table(self._TABLE).upsert(
            {
                "user_id": record.user_id,
                "installation_id": record.installation_id,
                "github_account_id": record.github_account_id,
                "account_login": record.account_login,
                "repo_selection": record.repo_selection,
            },
            on_conflict="user_id",
        ).execute()
        return record

    def get_by_user(self, user_id: str) -> InstallationRecord | None:
        client = supabase_client.get_client()
        result = (
            client.table(self._TABLE).select("*").eq("user_id", user_id).execute()
        )
        return _record_from_row(result.data[0]) if result.data else None

    def get_by_installation(
        self, installation_id: int
    ) -> InstallationRecord | None:
        client = supabase_client.get_client()
        result = (
            client.table(self._TABLE)
            .select("*")
            .eq("installation_id", installation_id)
            .execute()
        )
        return _record_from_row(result.data[0]) if result.data else None

    def delete_by_installation(self, installation_id: int) -> bool:
        client = supabase_client.get_client()
        result = (
            client.table(self._TABLE)
            .delete()
            .eq("installation_id", installation_id)
            .execute()
        )
        return bool(result.data)

    def set_repo_selection(
        self, installation_id: int, repo_selection: str
    ) -> bool:
        client = supabase_client.get_client()
        result = (
            client.table(self._TABLE)
            .update({"repo_selection": repo_selection})
            .eq("installation_id", installation_id)
            .execute()
        )
        return bool(result.data)


def _record_from_row(row: dict) -> InstallationRecord:
    return InstallationRecord(
        user_id=row["user_id"],
        installation_id=int(row["installation_id"]),
        github_account_id=int(row["github_account_id"]),
        account_login=row.get("account_login") or "",
        repo_selection=row.get("repo_selection") or "all",
    )


def get_installation_repository() -> InstallationRepository:
    """The production (Supabase) installation store, or None-safe guard.

    Returns the Supabase repo when configured; raises RuntimeError otherwise so a
    caller that reaches here unconfigured fails loudly. Callers that can run
    unconfigured (the webhook) check supabase_client.is_configured() first.
    """
    if not supabase_client.is_configured():
        raise RuntimeError("Supabase is not configured; installations unavailable.")
    return SupabaseInstallationRepository()
