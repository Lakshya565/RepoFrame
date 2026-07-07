import logging

from app.services import github_app, github_service, installation_store, supabase_client
from app.services.auth import AuthenticatedUser

# Decides, per analyze request, whether to read a repo AS the signed-in user's
# GitHub App installation (private-repo access) or via the public path (Phase 15.5).
# The rule is conservative and safe: use an installation token ONLY when the user
# has installed the App AND the requested repo is actually in that installation's
# accessible set. Otherwise fall back to the public flow — so a public repo the
# user hasn't added to the App still works, and no token is minted needlessly.

logger = logging.getLogger(__name__)


def resolve_installation_token(
    user: AuthenticatedUser | None, owner: str, repo: str
) -> str | None:
    """Return an installation token that grants this repo, or None for the public path.

    None (never an error) whenever: no user, the App/Supabase aren't configured, the
    user has no installation, or the repo isn't in the installation. Only mints a
    token when the user has an installation, and only returns it after verifying the
    repo is in that installation's accessible set (a per-repo scope check). Any
    GitHub App error is swallowed to None so a failure here degrades to the public
    path rather than breaking analysis.
    """
    if user is None or user.github_id is None:
        return None
    if not github_app.is_configured() or not supabase_client.is_configured():
        return None

    try:
        record = installation_store.get_installation_repository().get_by_user(
            user.user_id
        )
    except Exception as exc:  # noqa: BLE001 - store/config failure => public path
        logger.debug("Installation lookup failed; using public path: %s", exc)
        return None

    if record is None:
        return None

    try:
        token = github_app.mint_installation_token(record.installation_id).token
        repositories = github_app.list_installation_repositories(token)
    except github_app.GitHubAppError as exc:
        logger.debug("Installation token/repos failed; using public path: %s", exc)
        return None

    wanted = f"{owner}/{repo}".lower()
    for repository in repositories:
        if str(repository.get("full_name", "")).lower() == wanted:
            return token
    return None


def apply_repo_access(
    user: AuthenticatedUser | None, owner: str, repo: str
) -> None:
    """Resolve and install the request's GitHub token onto github_service.

    Always sets the token (to a value or None), so the public path is explicit and
    no installation token can carry over within a reused context. Call once at the
    top of each analyze route, after the repo URL is parsed.
    """
    github_service.set_installation_token(resolve_installation_token(user, owner, repo))
