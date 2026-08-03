from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol

from app.services import supabase_client


@dataclass(frozen=True)
class GitHubAuthorizationRecord:
    """Encrypted GitHub user authorization owned by one Supabase user."""

    user_id: str
    github_user_id: int
    access_token_ciphertext: str
    refresh_token_ciphertext: str | None = None
    access_expires_at: str | None = None
    refresh_expires_at: str | None = None


class GitHubAuthorizationRepository(Protocol):
    def upsert(
        self, record: GitHubAuthorizationRecord
    ) -> GitHubAuthorizationRecord: ...

    def get_by_user(self, user_id: str) -> GitHubAuthorizationRecord | None: ...

    def list_by_github_user(
        self, github_user_id: int
    ) -> list[GitHubAuthorizationRecord]: ...

    def delete_by_user(self, user_id: str) -> bool: ...


class InMemoryGitHubAuthorizationRepository:
    def __init__(self) -> None:
        self._records: dict[str, GitHubAuthorizationRecord] = {}

    def upsert(
        self, record: GitHubAuthorizationRecord
    ) -> GitHubAuthorizationRecord:
        self._records[record.user_id] = record
        return record

    def get_by_user(self, user_id: str) -> GitHubAuthorizationRecord | None:
        return self._records.get(user_id)

    def list_by_github_user(
        self, github_user_id: int
    ) -> list[GitHubAuthorizationRecord]:
        return [
            record
            for record in self._records.values()
            if record.github_user_id == github_user_id
        ]

    def delete_by_user(self, user_id: str) -> bool:
        return self._records.pop(user_id, None) is not None


class SupabaseGitHubAuthorizationRepository:
    _TABLE = "github_user_authorizations"

    def upsert(
        self, record: GitHubAuthorizationRecord
    ) -> GitHubAuthorizationRecord:
        client = supabase_client.get_client()
        client.table(self._TABLE).upsert(
            {
                "user_id": record.user_id,
                "github_user_id": record.github_user_id,
                "access_token_ciphertext": record.access_token_ciphertext,
                "refresh_token_ciphertext": record.refresh_token_ciphertext,
                "access_expires_at": record.access_expires_at,
                "refresh_expires_at": record.refresh_expires_at,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="user_id",
        ).execute()
        return record

    def get_by_user(self, user_id: str) -> GitHubAuthorizationRecord | None:
        result = (
            supabase_client.get_client()
            .table(self._TABLE)
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        return _record_from_row(result.data[0]) if result.data else None

    def list_by_github_user(
        self, github_user_id: int
    ) -> list[GitHubAuthorizationRecord]:
        result = (
            supabase_client.get_client()
            .table(self._TABLE)
            .select("*")
            .eq("github_user_id", github_user_id)
            .execute()
        )
        return [_record_from_row(row) for row in (result.data or [])]

    def delete_by_user(self, user_id: str) -> bool:
        result = (
            supabase_client.get_client()
            .table(self._TABLE)
            .delete()
            .eq("user_id", user_id)
            .execute()
        )
        return bool(result.data)


def _record_from_row(row: dict) -> GitHubAuthorizationRecord:
    return GitHubAuthorizationRecord(
        user_id=str(row["user_id"]),
        github_user_id=int(row["github_user_id"]),
        access_token_ciphertext=str(row["access_token_ciphertext"]),
        refresh_token_ciphertext=row.get("refresh_token_ciphertext"),
        access_expires_at=row.get("access_expires_at"),
        refresh_expires_at=row.get("refresh_expires_at"),
    )


def get_github_authorization_repository() -> GitHubAuthorizationRepository:
    if not supabase_client.is_configured():
        raise RuntimeError("Supabase is not configured; GitHub authorization unavailable.")
    return SupabaseGitHubAuthorizationRepository()
