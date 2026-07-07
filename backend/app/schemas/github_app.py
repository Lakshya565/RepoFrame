from pydantic import BaseModel, ConfigDict, Field


# Request/response shapes for the GitHub App connection flow (Phase 15.4).


# Posted by the frontend /github/installed landing after GitHub redirects back with
# an installation_id. The user's Supabase JWT authenticates the call; the backend
# binds this installation to that user only if the GitHub account matches.
class InstallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    installation_id: int = Field(alias="installationId", gt=0)


# The connection status returned after a successful bind (and by a future "is my
# App connected?" read): which installation, whose account, and the repo scope.
class ConnectionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    installation_id: int = Field(alias="installationId")
    account_login: str = Field(alias="accountLogin")
    repo_selection: str = Field(alias="repoSelection")
