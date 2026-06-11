from typing import Literal

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


class RepoFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str
    type: Literal["file", "directory", "submodule"]
    size: int | None = None
    url: str | None = None


class RepoTreeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    owner: str
    repo: str
    normalized_url: str = Field(alias="normalizedUrl")
    default_branch: str = Field(alias="defaultBranch")
    files: list[RepoFile]
    total_files: int = Field(alias="totalFiles")
    total_directories: int = Field(alias="totalDirectories")
    is_truncated: bool = Field(alias="isTruncated")


class GitHubRateLimitResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    limit: int
    used: int
    remaining: int
    reset: int
    reset_at: str = Field(alias="resetAt")
    is_authenticated: bool = Field(alias="isAuthenticated")
