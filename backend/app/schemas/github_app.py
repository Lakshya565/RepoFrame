from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class InstallRequest(BaseModel):
    """Temporary legacy callback contract kept during frontend/backend skew."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    installation_id: int = Field(alias="installationId", gt=0)


class ConnectionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    installation_id: int = Field(alias="installationId")
    account_login: str = Field(alias="accountLogin")
    repo_selection: str = Field(alias="repoSelection")


class ConnectionSummary(ConnectionResponse):
    account_type: Literal["User", "Organization"] = Field(alias="accountType")
    settings_url: str = Field(alias="settingsUrl")


class ConnectionsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    status: Literal["connected", "not_connected", "reauthorization_required"]
    installations: list[ConnectionSummary]


class StartInstallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    return_to: str = Field(default="/", alias="returnTo", max_length=1000)
    force_install: bool = Field(default=False, alias="forceInstall")


class StartInstallResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    authorization_url: str | None = Field(default=None, alias="authorizationUrl")
    install_url: str | None = Field(default=None, alias="installUrl")
    state: str
    code_verifier: str | None = Field(default=None, alias="codeVerifier")


class CompleteInstallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    code: str = Field(min_length=1, max_length=500)
    state: str = Field(min_length=1, max_length=4000)
    code_verifier: str | None = Field(default=None, alias="codeVerifier", max_length=500)


class CompleteInstallResponse(ConnectionsResponse):
    return_to: str = Field(alias="returnTo")
    next_url: str | None = Field(default=None, alias="nextUrl")
    state: str | None = None
