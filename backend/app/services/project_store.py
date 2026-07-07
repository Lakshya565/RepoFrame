import threading
from datetime import datetime, timezone
from typing import Protocol
from uuid import uuid4

from fastapi import HTTPException

from app.schemas.projects import ProjectDetail, ProjectSummary, SaveProjectRequest
from app.services import supabase_client

# Storage for saved projects (Phase 15.2). Everything goes through the
# ProjectRepository interface so the routes never know whether they are talking to
# Supabase (production) or the in-memory fake (tests). Two rules hold for every
# implementation:
#   * SCOPED BY user_id in code — a method only ever touches rows for the user_id
#     passed in. RLS is the backstop, not the primary guard (the backend uses the
#     service-role key, which bypasses RLS).
#   * UPSERT semantics on save — one snapshot per (user, repo). Saving the same
#     repo again overwrites its snapshot (latest-only; version history is a
#     non-goal this phase).


def _now_iso() -> str:
    """Current UTC time as an ISO-8601 string, matching Supabase's timestamptz."""
    return datetime.now(timezone.utc).isoformat()


def _summary_of(detail: ProjectDetail) -> ProjectSummary:
    """Project the identity + timestamp fields out of a full detail record."""
    return ProjectSummary(
        id=detail.id,
        owner=detail.owner,
        repo=detail.repo,
        normalized_url=detail.normalized_url,
        default_branch=detail.default_branch,
        is_private=detail.is_private,
        created_at=detail.created_at,
        updated_at=detail.updated_at,
    )


def _detail_from_snapshot(
    project_id: str,
    snapshot: SaveProjectRequest,
    created_at: str,
    updated_at: str,
) -> ProjectDetail:
    """Assemble a stored ProjectDetail from a save request + assigned id/timestamps."""
    return ProjectDetail(
        id=project_id,
        owner=snapshot.owner,
        repo=snapshot.repo,
        normalized_url=snapshot.normalized_url,
        default_branch=snapshot.default_branch,
        is_private=snapshot.is_private,
        created_at=created_at,
        updated_at=updated_at,
        metadata=snapshot.metadata,
        user_context=snapshot.user_context,
        profile=snapshot.profile,
        outputs=snapshot.outputs,
        interview_topics=snapshot.interview_topics,
        all_guidance=snapshot.all_guidance,
        verifications=snapshot.verifications,
        verification_model=snapshot.verification_model,
    )


# The storage contract the routes depend on. Kept deliberately small: save (upsert),
# list summaries, load one full snapshot, delete one. Every method takes the caller's
# user_id and must confine itself to that user's rows.
class ProjectRepository(Protocol):
    def save(self, user_id: str, snapshot: SaveProjectRequest) -> ProjectDetail: ...

    def list_for_user(self, user_id: str) -> list[ProjectSummary]: ...

    def get(self, user_id: str, project_id: str) -> ProjectDetail | None: ...

    def delete(self, user_id: str, project_id: str) -> bool: ...


# In-memory implementation for the offline test suite. Same isolation + upsert
# contract as the real store, so passing tests against this genuinely exercise the
# route logic without a database. Not used in production.
class InMemoryProjectRepository:
    def __init__(self) -> None:
        # user_id -> { project_id -> ProjectDetail }. Nesting by user makes the
        # per-user scoping structural: one user's dict is never reachable from
        # another's id.
        self._by_user: dict[str, dict[str, ProjectDetail]] = {}
        # (user_id, normalized_url) -> project_id, so a re-save finds the existing
        # row to upsert instead of creating a duplicate.
        self._url_index: dict[tuple[str, str], str] = {}
        # (user_id, project_id) -> monotonic save order. Ordering listing by this
        # (not by updated_at) is deterministic even when two saves land in the same
        # clock tick — a real risk on Windows' coarse timer — so "newest first"
        # never flickers. Re-saving bumps a project to the front, as intended.
        self._order: dict[tuple[str, str], int] = {}
        self._counter = 0
        self._lock = threading.Lock()

    def save(self, user_id: str, snapshot: SaveProjectRequest) -> ProjectDetail:
        with self._lock:
            now = _now_iso()
            key = (user_id, snapshot.normalized_url)
            existing_id = self._url_index.get(key)
            if existing_id is not None:
                # Preserve the original creation time on re-save; bump updated_at.
                created_at = self._by_user[user_id][existing_id].created_at
                project_id = existing_id
            else:
                project_id = str(uuid4())
                created_at = now

            detail = _detail_from_snapshot(project_id, snapshot, created_at, now)
            self._by_user.setdefault(user_id, {})[project_id] = detail
            self._url_index[key] = project_id
            self._counter += 1
            self._order[(user_id, project_id)] = self._counter
            return detail

    def list_for_user(self, user_id: str) -> list[ProjectSummary]:
        rows = self._by_user.get(user_id, {}).items()
        newest_first = sorted(
            rows, key=lambda item: self._order[(user_id, item[0])], reverse=True
        )
        return [_summary_of(detail) for _project_id, detail in newest_first]

    def get(self, user_id: str, project_id: str) -> ProjectDetail | None:
        return self._by_user.get(user_id, {}).get(project_id)

    def delete(self, user_id: str, project_id: str) -> bool:
        with self._lock:
            detail = self._by_user.get(user_id, {}).pop(project_id, None)
            if detail is None:
                return False
            self._url_index.pop((user_id, detail.normalized_url), None)
            self._order.pop((user_id, project_id), None)
            return True


# Supabase-backed implementation used in production. It writes across the three
# tables (projects + generated_outputs + claim_verifications) that together make up
# one snapshot, and reads them back via PostgREST resource embedding. Every call
# uses the service-role client and filters by user_id in code.
#
# NOTE: this path is validated by a manual Supabase smoke (it needs a real
# auth.users row for the user_id FK, which the offline suite has no way to create).
# The InMemoryProjectRepository tests lock in the behavioral contract this must meet.
class SupabaseProjectRepository:
    def save(self, user_id: str, snapshot: SaveProjectRequest) -> ProjectDetail:
        client = supabase_client.get_client()
        now = _now_iso()

        # 1) Upsert the parent project row on its (user_id, normalized_url) unique
        #    key, so re-saving the same repo overwrites rather than duplicates.
        project_row = {
            "user_id": user_id,
            "repo_owner": snapshot.owner,
            "repo_name": snapshot.repo,
            "normalized_url": snapshot.normalized_url,
            "default_branch": snapshot.default_branch,
            "is_private": snapshot.is_private,
            "metadata": snapshot.metadata.model_dump(by_alias=True),
            "user_context": snapshot.user_context.model_dump(by_alias=True),
            "updated_at": now,
        }
        project_result = (
            client.table("projects")
            .upsert(project_row, on_conflict="user_id,normalized_url")
            .execute()
        )
        project_id = project_result.data[0]["id"]

        # 2) Upsert the generated content (one row per project).
        outputs_row = {
            "project_id": project_id,
            "profile": (
                snapshot.profile.model_dump(by_alias=True)
                if snapshot.profile is not None
                else None
            ),
            "resume_bullets": snapshot.outputs.resume_bullets,
            "readme_intro": snapshot.outputs.readme_intro,
            "portfolio_blurb": snapshot.outputs.portfolio_blurb,
            "linkedin_description": snapshot.outputs.linkedin_description,
            "interview_topics": (
                [t.model_dump(by_alias=True) for t in snapshot.interview_topics]
                if snapshot.interview_topics is not None
                else None
            ),
            "all_guidance": snapshot.all_guidance,
            "updated_at": now,
        }
        client.table("generated_outputs").upsert(
            outputs_row, on_conflict="project_id"
        ).execute()

        # 3) Upsert the latest verification (one row per project), when present.
        if snapshot.verifications is not None:
            verification_row = {
                "project_id": project_id,
                "verifications": [
                    v.model_dump(by_alias=True) for v in snapshot.verifications
                ],
                "model": snapshot.verification_model,
                "updated_at": now,
            }
            client.table("claim_verifications").upsert(
                verification_row, on_conflict="project_id"
            ).execute()

        # Read the row back so timestamps/id come straight from the database.
        saved = self.get(user_id, project_id)
        if saved is None:  # pragma: no cover - should be unreachable after a write
            raise RuntimeError("Saved project could not be read back.")
        return saved

    def list_for_user(self, user_id: str) -> list[ProjectSummary]:
        client = supabase_client.get_client()
        result = (
            client.table("projects")
            .select(
                "id, repo_owner, repo_name, normalized_url, default_branch, "
                "is_private, created_at, updated_at"
            )
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .execute()
        )
        return [_summary_from_row(row) for row in result.data]

    def get(self, user_id: str, project_id: str) -> ProjectDetail | None:
        client = supabase_client.get_client()
        # Embed the child rows in one request via PostgREST resource embedding.
        result = (
            client.table("projects")
            .select("*, generated_outputs(*), claim_verifications(*)")
            .eq("user_id", user_id)
            .eq("id", project_id)
            .execute()
        )
        if not result.data:
            return None
        return _detail_from_row(result.data[0])

    def delete(self, user_id: str, project_id: str) -> bool:
        client = supabase_client.get_client()
        # Deleting the parent cascades to generated_outputs + claim_verifications.
        result = (
            client.table("projects")
            .delete()
            .eq("user_id", user_id)
            .eq("id", project_id)
            .execute()
        )
        return bool(result.data)


def _summary_from_row(row: dict) -> ProjectSummary:
    """Build a ProjectSummary from a raw projects row (snake_case DB columns)."""
    return ProjectSummary(
        id=row["id"],
        owner=row["repo_owner"],
        repo=row["repo_name"],
        normalized_url=row["normalized_url"],
        default_branch=row.get("default_branch"),
        is_private=row.get("is_private", False),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _first_embedded(row: dict, key: str) -> dict | None:
    """Return the single embedded child row for `key` (PostgREST returns a list)."""
    embedded = row.get(key)
    if isinstance(embedded, list):
        return embedded[0] if embedded else None
    return embedded if isinstance(embedded, dict) else None


def _detail_from_row(row: dict) -> ProjectDetail:
    """Rebuild a full ProjectDetail from a projects row with embedded children.

    The child models are validated (not trusted) so a malformed stored row surfaces
    as a validation error rather than silently corrupt output. metadata/user_context
    were written by-alias (camelCase), which validate cleanly thanks to
    populate_by_name on those models.
    """
    outputs_row = _first_embedded(row, "generated_outputs") or {}
    verification_row = _first_embedded(row, "claim_verifications")

    # Compose the GeneratedOutputs (camelCase-aliased) from the four flat columns.
    outputs = {
        "resumeBullets": outputs_row.get("resume_bullets"),
        "readmeIntro": outputs_row.get("readme_intro"),
        "portfolioBlurb": outputs_row.get("portfolio_blurb"),
        "linkedinDescription": outputs_row.get("linkedin_description"),
    }

    payload = {
        "id": row["id"],
        "owner": row["repo_owner"],
        "repo": row["repo_name"],
        "normalizedUrl": row["normalized_url"],
        "defaultBranch": row.get("default_branch"),
        "isPrivate": row.get("is_private", False),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "metadata": row.get("metadata") or {},
        "userContext": row.get("user_context") or {},
        "profile": outputs_row.get("profile"),
        "outputs": outputs,
        "interviewTopics": outputs_row.get("interview_topics"),
        "allGuidance": outputs_row.get("all_guidance") or "",
        "verifications": (
            verification_row.get("verifications") if verification_row else None
        ),
        "verificationModel": (
            verification_row.get("model") if verification_row else None
        ),
    }
    return ProjectDetail.model_validate(payload)


def get_project_repository() -> ProjectRepository:
    """FastAPI dependency: the production (Supabase) repository.

    Guards on configuration so an unconfigured deployment fails cleanly with a 503
    rather than trying to build a Supabase client against empty settings. In
    practice this is unreachable via the authenticated routes (no Supabase => no
    valid token => require_user 401s first), but the guard keeps the no-op path
    explicit. Tests override this dependency with an InMemoryProjectRepository.
    """
    if not supabase_client.is_configured():
        raise HTTPException(
            status_code=503,
            detail="Saved projects are unavailable: Supabase is not configured.",
        )
    return SupabaseProjectRepository()
