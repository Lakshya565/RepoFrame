from pydantic import BaseModel, ConfigDict, Field, StrictStr

from app.schemas.outputs import GeneratedOutputs, InterviewTopic
from app.schemas.profile import ProjectProfile, UserContextInput
from app.schemas.repo import RepoMetadataResponse
from app.schemas.verify import ClaimVerification

# API shapes for saved projects (Phase 15.2). A "project" is one repo's full
# analysis snapshot: its identity, the repo metadata card, the user's
# questionnaire answers, the generated profile + outputs + interview prep, and the
# latest claim verification. These models are composed entirely from the existing
# per-feature models, so a saved snapshot round-trips through the exact same shapes
# the live pipeline already produces — no parallel/duplicate definitions to drift.
#
# Persistence is "latest snapshot per repo" (a save upserts on the repo URL); full
# per-generation version history is an explicit non-goal for this phase.


# What the frontend posts to save (or re-save) a project. Repo identity + the four
# stored surfaces (metadata, context, generated content, verification). Everything
# but the identity + metadata is optional so a project can be saved right after
# analysis, before any generation has run.
class SaveProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    owner: StrictStr = Field(min_length=1, max_length=255)
    repo: StrictStr = Field(min_length=1, max_length=255)
    normalized_url: StrictStr = Field(
        alias="normalizedUrl", min_length=1, max_length=2048
    )
    default_branch: str | None = Field(default=None, alias="defaultBranch")
    is_private: bool = Field(default=False, alias="isPrivate")

    metadata: RepoMetadataResponse
    user_context: UserContextInput = Field(
        default_factory=UserContextInput, alias="userContext"
    )

    profile: ProjectProfile | None = None
    outputs: GeneratedOutputs = Field(default_factory=GeneratedOutputs)
    interview_topics: list[InterviewTopic] | None = Field(
        default=None, alias="interviewTopics"
    )
    all_guidance: str = Field(default="", alias="allGuidance", max_length=400)

    verifications: list[ClaimVerification] | None = None
    verification_model: str | None = Field(default=None, alias="verificationModel")


# One row in the History / Saved list: identity + timestamps only, so listing a
# user's projects never ships the full (potentially large) snapshot payloads.
class ProjectSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str
    owner: str
    repo: str
    normalized_url: str = Field(alias="normalizedUrl")
    default_branch: str | None = Field(default=None, alias="defaultBranch")
    is_private: bool = Field(alias="isPrivate")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


# The full saved snapshot returned when a project is reopened: the summary fields
# plus everything needed to rehydrate the analysis + generation workspace.
class ProjectDetail(ProjectSummary):
    metadata: RepoMetadataResponse
    user_context: UserContextInput = Field(alias="userContext")
    profile: ProjectProfile | None = None
    outputs: GeneratedOutputs = Field(default_factory=GeneratedOutputs)
    interview_topics: list[InterviewTopic] | None = Field(
        default=None, alias="interviewTopics"
    )
    all_guidance: str = Field(default="", alias="allGuidance")
    verifications: list[ClaimVerification] | None = None
    verification_model: str | None = Field(default=None, alias="verificationModel")
