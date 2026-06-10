from pydantic import BaseModel, ConfigDict, Field, StrictStr


class RepoParseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    repo_url: StrictStr = Field(alias="repoUrl", min_length=1, max_length=2048)


class RepoParseResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    owner: str
    repo: str
    normalized_url: str = Field(alias="normalizedUrl")
