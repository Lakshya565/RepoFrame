import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from app.schemas.github_app import ConnectionResponse, InstallRequest
from app.services import github_app, installation_store, repo_access, supabase_client
from app.services.auth import AuthenticatedUser, require_user
from app.services.github_app import GitHubAppError
from app.services.installation_store import InstallationRecord

# GitHub App connection endpoints (Phase 15.4): the post-install bind and the
# webhook. Routes stay thin — signing, token minting, and signature checks live in
# github_app.py; the mapping lives in installation_store.py.

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/github", tags=["github-app"])


# Bind a just-completed App installation to the signed-in user. This is the
# security-critical ownership step: we fetch the installation's GitHub account via
# an app JWT and store the mapping ONLY if that account is the same GitHub identity
# the user signed in with — so a user cannot claim someone else's installation_id.
@router.post("/install", response_model=ConnectionResponse)
def install(
    request: InstallRequest,
    user: AuthenticatedUser = Depends(require_user),
) -> ConnectionResponse:
    if not github_app.is_configured():
        raise HTTPException(status_code=503, detail="GitHub App is not configured.")
    if not supabase_client.is_configured():
        raise HTTPException(status_code=503, detail="Persistence is not configured.")

    # The user's GitHub numeric id must be known (it comes from their GitHub
    # sign-in) to bind ownership at all.
    if user.github_id is None:
        raise HTTPException(
            status_code=403,
            detail="Your account is not linked to a GitHub identity.",
        )

    try:
        account = github_app.get_installation_account(request.installation_id)
    except GitHubAppError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    # OWNERSHIP BINDING: the installation's account must equal the user's GitHub id.
    if str(account.account_id) != str(user.github_id):
        raise HTTPException(
            status_code=403,
            detail="This installation belongs to a different GitHub account.",
        )

    repository = installation_store.get_installation_repository()
    record = repository.upsert(
        InstallationRecord(
            user_id=user.user_id,
            installation_id=request.installation_id,
            github_account_id=account.account_id,
            account_login=account.login,
            repo_selection=account.repo_selection,
        )
    )
    repo_access.reset_access_cache()
    return ConnectionResponse(
        installation_id=record.installation_id,
        account_login=record.account_login,
        repo_selection=record.repo_selection,
    )


# GitHub App webhook. Unauthenticated by design (GitHub calls it) but every request
# is HMAC-verified against the shared secret BEFORE the body is trusted or parsed.
# Keeps the mapping correct as installations/repos change or are removed.
@router.post("/webhook")
async def webhook(request: Request) -> dict:
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")
    if not github_app.verify_webhook_signature(body, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature.")

    # No Supabase → nothing to keep in sync; acknowledge so GitHub doesn't retry.
    if not supabase_client.is_configured():
        return {"ok": True}

    try:
        payload = json.loads(body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Malformed webhook body.")

    event = request.headers.get("X-GitHub-Event", "")
    action = payload.get("action")
    installation = payload.get("installation") or {}
    installation_id = installation.get("id")
    if not isinstance(installation_id, int):
        return {"ok": True}

    repository = installation_store.SupabaseInstallationRepository()

    # Uninstall → drop the mapping (revocation). Repo-selection changes → update the
    # stored scope. "created" is handled by the /install bind (which checks
    # ownership), so we don't create a mapping from an unauthenticated webhook.
    if event == "installation" and action == "deleted":
        repository.delete_by_installation(installation_id)
        repo_access.reset_access_cache()
    elif event == "installation_repositories" or (
        event == "installation" and action == "new_permissions_accepted"
    ):
        selection = installation.get("repository_selection")
        if isinstance(selection, str):
            repository.set_repo_selection(installation_id, selection)
            repo_access.reset_access_cache()

    return {"ok": True}
