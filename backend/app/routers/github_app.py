import json

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.schemas.github_app import (
    CompleteInstallRequest,
    CompleteInstallResponse,
    ConnectionResponse,
    ConnectionsResponse,
    ConnectionSummary,
    InstallRequest,
    StartInstallRequest,
    StartInstallResponse,
)
from app.services import (
    github_app,
    github_connections,
    github_oauth,
    installation_store,
    repo_access,
    supabase_client,
)
from app.services.auth import AuthenticatedUser, require_user
from app.services.github_app import GitHubAppError
from app.services.installation_store import InstallationRecord

router = APIRouter(prefix="/api/github", tags=["github-app"])


def _require_connection_configuration() -> None:
    if not github_app.is_configured() or not github_oauth.is_configured():
        raise HTTPException(
            status_code=503,
            detail="GitHub private-repository access is not configured.",
        )
    if not supabase_client.is_configured():
        raise HTTPException(status_code=503, detail="Persistence is not configured.")


def _connections_response(
    state: github_connections.ConnectionState,
) -> ConnectionsResponse:
    return ConnectionsResponse(
        status=state.status,
        installations=[
            ConnectionSummary(
                installation_id=record.installation_id,
                account_login=record.account_login,
                account_type=record.account_type,
                repo_selection=record.repo_selection,
                settings_url=record.settings_url,
            )
            for record in state.installations
        ],
    )


@router.get("/connections", response_model=ConnectionsResponse)
def connections(
    user: AuthenticatedUser = Depends(require_user),
) -> ConnectionsResponse:
    _require_connection_configuration()
    return _connections_response(github_connections.get_connection_state(user.user_id))


@router.post("/install/start", response_model=StartInstallResponse)
def start_install(
    request: StartInstallRequest,
    user: AuthenticatedUser = Depends(require_user),
) -> StartInstallResponse:
    _require_connection_configuration()
    try:
        if request.force_install:
            state = github_oauth.create_install_state(user.user_id, request.return_to)
            return StartInstallResponse(
                install_url=github_oauth.build_install_url(
                    user.user_id, request.return_to, state=state
                ),
                state=state,
            )
        authorization = github_oauth.create_authorization_start(
            user.user_id, request.return_to
        )
    except github_oauth.GitHubOAuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return StartInstallResponse(
        authorization_url=authorization.authorization_url,
        state=authorization.state,
        code_verifier=authorization.code_verifier,
    )


@router.post("/install/complete", response_model=CompleteInstallResponse)
def complete_install(
    request: CompleteInstallRequest,
    user: AuthenticatedUser = Depends(require_user),
) -> CompleteInstallResponse:
    _require_connection_configuration()
    try:
        completed = github_connections.complete_install(
            user, request.code, request.state, request.code_verifier
        )
    except github_oauth.GitHubOAuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    response = _connections_response(completed.connection)
    return CompleteInstallResponse(
        status=response.status,
        installations=response.installations,
        return_to=completed.return_to,
        next_url=completed.next_url,
        state=completed.next_state,
    )


@router.delete("/authorization", status_code=204)
def delete_authorization(
    user: AuthenticatedUser = Depends(require_user),
) -> Response:
    _require_connection_configuration()
    github_connections.disconnect(user.user_id)
    return Response(status_code=204)


# Temporary compatibility endpoint for a frontend deployed before OAuth-on-install.
# It can bind personal installs only; the new callback is required before private
# access is granted because it persists the user authorization proof.
@router.post("/install", response_model=ConnectionResponse)
def install(
    request: InstallRequest,
    user: AuthenticatedUser = Depends(require_user),
) -> ConnectionResponse:
    if not github_app.is_configured():
        raise HTTPException(status_code=503, detail="GitHub App is not configured.")
    if not supabase_client.is_configured():
        raise HTTPException(status_code=503, detail="Persistence is not configured.")
    if user.github_id is None:
        raise HTTPException(
            status_code=403,
            detail="Your account is not linked to a GitHub identity.",
        )
    try:
        account = github_app.get_installation_account(request.installation_id)
    except GitHubAppError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    if str(account.account_id) != str(user.github_id):
        raise HTTPException(
            status_code=403,
            detail="Finish the new GitHub authorization flow to connect an organization.",
        )
    record = installation_store.get_installation_repository().upsert(
        InstallationRecord(
            user_id=user.user_id,
            installation_id=request.installation_id,
            github_account_id=account.account_id,
            account_login=account.login,
            repo_selection=account.repo_selection,
            account_type=account.account_type,
            settings_url=account.settings_url,
        )
    )
    repo_access.reset_access_cache()
    return ConnectionResponse(
        installation_id=record.installation_id,
        account_login=record.account_login,
        repo_selection=record.repo_selection,
    )


@router.post("/webhook")
async def webhook(request: Request) -> dict:
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")
    if not github_app.verify_webhook_signature(body, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature.")
    if not supabase_client.is_configured():
        return {"ok": True}
    try:
        payload = json.loads(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Malformed webhook body.") from exc

    event = request.headers.get("X-GitHub-Event", "")
    action = payload.get("action")
    if event == "github_app_authorization" and action == "revoked":
        sender = payload.get("sender") or {}
        github_user_id = sender.get("id")
        if isinstance(github_user_id, int):
            github_connections.revoke_github_user(github_user_id)
        return {"ok": True}

    installation = payload.get("installation") or {}
    installation_id = installation.get("id")
    if not isinstance(installation_id, int):
        return {"ok": True}
    repository = installation_store.SupabaseInstallationRepository()
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
