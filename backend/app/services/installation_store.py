from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol

from app.services import supabase_client

# Storage for Supabase-user ↔ GitHub-App-installation mappings. A user may have
# several personal or organization installations. This table contains no token;
# encrypted GitHub user authorization is isolated in github_authorization_store,
# while short-lived installation tokens remain in backend process memory only.
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
    account_type: str = "User"  # 'User' | 'Organization'
    settings_url: str = ""


# Lookups exist both by user (connection and analysis) and by installation id
# (webhooks, which do not know the RepoFrame user).
class InstallationRepository(Protocol):
    def upsert(self, record: InstallationRecord) -> InstallationRecord: ...

    def list_by_user(self, user_id: str) -> list[InstallationRecord]: ...

    def get_by_user(self, user_id: str) -> InstallationRecord | None: ...

    def list_by_installation(
        self, installation_id: int
    ) -> list[InstallationRecord]: ...

    def get_by_installation(
        self, installation_id: int
    ) -> InstallationRecord | None: ...

    def delete_by_user(self, user_id: str) -> bool: ...

    def delete_user_installation(
        self, user_id: str, installation_id: int
    ) -> bool: ...

    def delete_by_installation(self, installation_id: int) -> bool: ...

    def set_repo_selection(
        self, installation_id: int, repo_selection: str
    ) -> bool: ...


# In-memory implementation for the offline test suite.
class InMemoryInstallationRepository:
    def __init__(self) -> None:
        self._records: dict[tuple[str, int], InstallationRecord] = {}

    def upsert(self, record: InstallationRecord) -> InstallationRecord:
        self._records[(record.user_id, record.installation_id)] = record
        return record

    def list_by_user(self, user_id: str) -> list[InstallationRecord]:
        return [
            record
            for (stored_user_id, _), record in self._records.items()
            if stored_user_id == user_id
        ]

    def get_by_user(self, user_id: str) -> InstallationRecord | None:
        records = self.list_by_user(user_id)
        return records[0] if records else None

    def list_by_installation(
        self, installation_id: int
    ) -> list[InstallationRecord]:
        return [
            record
            for (_, stored_installation_id), record in self._records.items()
            if stored_installation_id == installation_id
        ]

    def get_by_installation(
        self, installation_id: int
    ) -> InstallationRecord | None:
        records = self.list_by_installation(installation_id)
        return records[0] if records else None

    def delete_by_user(self, user_id: str) -> bool:
        keys = [key for key in self._records if key[0] == user_id]
        for key in keys:
            del self._records[key]
        return bool(keys)

    def delete_user_installation(
        self, user_id: str, installation_id: int
    ) -> bool:
        return self._records.pop((user_id, installation_id), None) is not None

    def delete_by_installation(self, installation_id: int) -> bool:
        keys = [key for key in self._records if key[1] == installation_id]
        for key in keys:
            del self._records[key]
        return bool(keys)

    def set_repo_selection(
        self, installation_id: int, repo_selection: str
    ) -> bool:
        records = self.list_by_installation(installation_id)
        for record in records:
            self.upsert(
                InstallationRecord(
                    user_id=record.user_id,
                    installation_id=record.installation_id,
                    github_account_id=record.github_account_id,
                    account_login=record.account_login,
                    repo_selection=repo_selection,
                    account_type=record.account_type,
                    settings_url=record.settings_url,
                )
            )
        return bool(records)


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
                "account_type": record.account_type,
                "settings_url": record.settings_url,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="user_id,installation_id",
        ).execute()
        return record

    def list_by_user(self, user_id: str) -> list[InstallationRecord]:
        client = supabase_client.get_client()
        result = (
            client.table(self._TABLE).select("*").eq("user_id", user_id).execute()
        )
        return [_record_from_row(row) for row in (result.data or [])]

    def get_by_user(self, user_id: str) -> InstallationRecord | None:
        records = self.list_by_user(user_id)
        return records[0] if records else None

    def list_by_installation(
        self, installation_id: int
    ) -> list[InstallationRecord]:
        client = supabase_client.get_client()
        result = (
            client.table(self._TABLE)
            .select("*")
            .eq("installation_id", installation_id)
            .execute()
        )
        return [_record_from_row(row) for row in (result.data or [])]

    def get_by_installation(
        self, installation_id: int
    ) -> InstallationRecord | None:
        records = self.list_by_installation(installation_id)
        return records[0] if records else None

    def delete_by_user(self, user_id: str) -> bool:
        client = supabase_client.get_client()
        result = client.table(self._TABLE).delete().eq("user_id", user_id).execute()
        return bool(result.data)

    def delete_user_installation(
        self, user_id: str, installation_id: int
    ) -> bool:
        client = supabase_client.get_client()
        result = (
            client.table(self._TABLE)
            .delete()
            .eq("user_id", user_id)
            .eq("installation_id", installation_id)
            .execute()
        )
        return bool(result.data)

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
        account_type=row.get("account_type") or "User",
        settings_url=row.get("settings_url") or "",
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
