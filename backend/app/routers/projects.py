from fastapi import APIRouter, Depends, HTTPException

from app.schemas.projects import ProjectDetail, ProjectSummary, SaveProjectRequest
from app.services.auth import AuthenticatedUser, require_user
from app.services.project_store import ProjectRepository, get_project_repository

# Saved-projects API (Phase 15.2). Every endpoint requires a verified user and is
# scoped to that user's rows — the routes stay thin, handing all persistence to the
# injected ProjectRepository. The two dependencies (require_user, the repository)
# are overridable in tests, so these handlers are exercised offline with a fake
# user + in-memory store.

router = APIRouter(prefix="/api/projects", tags=["projects"])


# Save (or re-save) a project snapshot. Upserts on the repo URL, so calling it
# again for the same repo overwrites that project rather than duplicating it.
@router.post("", response_model=ProjectDetail)
def save_project(
    request: SaveProjectRequest,
    user: AuthenticatedUser = Depends(require_user),
    repository: ProjectRepository = Depends(get_project_repository),
) -> ProjectDetail:
    return repository.save(user.user_id, request)


# List the current user's saved projects (identity + timestamps only), newest
# first. Returns an empty list when the user has saved nothing.
@router.get("", response_model=list[ProjectSummary])
def list_projects(
    user: AuthenticatedUser = Depends(require_user),
    repository: ProjectRepository = Depends(get_project_repository),
) -> list[ProjectSummary]:
    return repository.list_for_user(user.user_id)


# Load one full saved snapshot to reopen it. 404 when the id does not exist for
# this user — which also covers another user's project, since the lookup is
# user-scoped (no existence leak across accounts).
@router.get("/{project_id}", response_model=ProjectDetail)
def get_project(
    project_id: str,
    user: AuthenticatedUser = Depends(require_user),
    repository: ProjectRepository = Depends(get_project_repository),
) -> ProjectDetail:
    detail = repository.get(user.user_id, project_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return detail


# Delete one saved project (cascades to its outputs + verification). 404 when it
# does not exist for this user. 204 (no body) on success.
@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: str,
    user: AuthenticatedUser = Depends(require_user),
    repository: ProjectRepository = Depends(get_project_repository),
) -> None:
    if not repository.delete(user.user_id, project_id):
        raise HTTPException(status_code=404, detail="Project not found.")
