from pydantic import BaseModel, ConfigDict, Field, StrictStr


class RepoParseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    repo_url: StrictStr = Field(alias="repoUrl", min_length=1, max_length=2048)


class RepoParseResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    owner: str
    repo: str
    normalized_url: str = Field(alias="normalizedUrl")


class RepoMetadataResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    owner: str
    repo: str
    normalized_url: str = Field(alias="normalizedUrl")
    name: str
    description: str | None
    default_branch: str = Field(alias="defaultBranch")
    stars: int
    forks: int
    language: str | None
    html_url: str = Field(alias="htmlUrl")
