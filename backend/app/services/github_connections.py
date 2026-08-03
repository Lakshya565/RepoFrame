from dataclasses import dataclass

from app.services import (
    github_authorization_store,
    github_oauth,
    installation_store,
    repo_access,
)
from app.services.auth import AuthenticatedUser
from app.services.installation_store import InstallationRecord


@dataclass(frozen=True)
class ConnectionState:
    status: str
    installations: tuple[InstallationRecord, ...]


@dataclass(frozen=True)
class CompletedConnection:
    connection: ConnectionState
    return_to: str
    next_url: str | None = None
    next_state: str | None = None


def get_connection_state(user_id: str) -> ConnectionState:
    installation_repository = installation_store.get_installation_repository()
    authorization_repository = (
        github_authorization_store.get_github_authorization_repository()
    )
    installations = tuple(installation_repository.list_by_user(user_id))
    try:
        user_token = github_oauth.get_valid_access_token(
            authorization_repository, user_id
        )
    except github_oauth.GitHubOAuthError:
        user_token = None
    if user_token and installations:
        status = "connected"
    elif installations:
        status = "reauthorization_required"
    else:
        status = "not_connected"
    return ConnectionState(status=status, installations=installations)


def complete_install(
    user: AuthenticatedUser,
    code: str,
    state: str,
    code_verifier: str | None = None,
) -> CompletedConnection:
    """Exchange OAuth proof, verify identity, then sync all visible installs."""
    install_state = github_oauth.read_install_state(state, user.user_id)
    github_oauth.validate_code_verifier(install_state, code_verifier)
    token = github_oauth.exchange_code(code, code_verifier)
    github_user = github_oauth.get_github_user(token.access_token)
    if user.github_id is None or str(github_user.user_id) != str(user.github_id):
        raise github_oauth.GitHubOAuthError(
            "Authorize the same GitHub account used to sign in to RepoFrame.", 403
        )

    installations = github_oauth.list_user_installations(token.access_token)
    installation_repository = installation_store.get_installation_repository()
    authorization_repository = (
        github_authorization_store.get_github_authorization_repository()
    )

    # Persist authorization only after GitHub identity has been verified.
    github_oauth.save_authorization(
        authorization_repository, user.user_id, github_user.user_id, token
    )

    visible_ids: set[int] = set()
    records: list[InstallationRecord] = []
    for installation in installations:
        visible_ids.add(installation.installation_id)
        records.append(
            installation_repository.upsert(
                InstallationRecord(
                    user_id=user.user_id,
                    installation_id=installation.installation_id,
                    github_account_id=installation.account_id,
                    account_login=installation.account_login,
                    account_type=installation.account_type,
                    repo_selection=installation.repo_selection,
                    settings_url=installation.settings_url,
                )
            )
        )

    # An OAuth resync is authoritative for this user, so stale organization or
    # personal mappings are removed when GitHub no longer returns them.
    for existing in installation_repository.list_by_user(user.user_id):
        if existing.installation_id not in visible_ids:
            installation_repository.delete_user_installation(
                user.user_id, existing.installation_id
            )

    repo_access.reset_access_cache()
    connection = ConnectionState(
            status="connected" if records else "not_connected",
            installations=tuple(records),
    )
    if records:
        return CompletedConnection(connection, install_state.return_to)

    # The user is authorized but has not installed RepoFrame anywhere yet. Keep
    # this in the same browser journey by sending them to GitHub's install picker.
    next_state = github_oauth.create_install_state(
        user.user_id, install_state.return_to
    )
    return CompletedConnection(
        connection=connection,
        return_to=install_state.return_to,
        next_url=github_oauth.build_install_url(
            user.user_id, install_state.return_to, state=next_state
        ),
        next_state=next_state,
    )


def disconnect(user_id: str) -> None:
    authorization_repository = (
        github_authorization_store.get_github_authorization_repository()
    )
    installation_repository = installation_store.get_installation_repository()
    authorization_repository.delete_by_user(user_id)
    installation_repository.delete_by_user(user_id)
    repo_access.reset_access_cache()


def revoke_github_user(github_user_id: int) -> None:
    """Handle GitHub's authorization-revoked webhook for every matching user."""
    authorization_repository = (
        github_authorization_store.get_github_authorization_repository()
    )
    installation_repository = installation_store.get_installation_repository()
    for authorization in authorization_repository.list_by_github_user(github_user_id):
        authorization_repository.delete_by_user(authorization.user_id)
        installation_repository.delete_by_user(authorization.user_id)
    repo_access.reset_access_cache()
