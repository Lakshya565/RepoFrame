from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictStr


# User-provided questionnaire answers (Phase 9). Mirrors the frontend UserContext
# shape so the questionnaire can be posted straight through. Every field is
# optional with an empty-string default because the form allows partial answers;
# the generator treats blanks as "not provided" rather than fabricating values.
class UserContextInput(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    purpose: str = ""
    collaboration: Literal["solo", "team", ""] = ""
    contribution: str = ""
    target_user: str = Field(default="", alias="targetUser")
    hardest_part: str = Field(default="", alias="hardestPart")
    impact: str = ""


# Request body for profile generation: a GitHub repo URL plus the user context
# answers. userContext is optional so a profile can still be generated from repo
# evidence alone, but answers materially improve grounding for non-repo facts.
class GenerateProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    repo_url: StrictStr = Field(alias="repoUrl", min_length=1, max_length=2048)
    user_context: UserContextInput = Field(
        default_factory=UserContextInput, alias="userContext"
    )


# One claim-to-evidence link the model must produce, tying a statement in the
# profile back to a concrete source (a repo file path, README, or user context).
# This is what makes the output auditable rather than free-form generation.
class ProfileEvidence(BaseModel):
    # extra="ignore": tolerate a verbose model adding stray keys to an evidence
    # item rather than failing the whole generation over one extra field.
    model_config = ConfigDict(extra="ignore")

    claim: str
    source: str


# The structured project profile the model returns. This is validated directly
# against the model's JSON output, so the camelCase aliases match the keys the
# prompt asks the model to emit. extra="ignore" keeps a single unexpected key
# from invalidating an otherwise good profile.
class ProjectProfile(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    project_name: str = Field(alias="projectName")
    two_sentence_summary: str = Field(alias="twoSentenceSummary")
    problem: str
    solution: str
    detected_tech_stack: list[str] = Field(alias="detectedTechStack")
    core_features: list[str] = Field(alias="coreFeatures")
    technical_highlights: list[str] = Field(alias="technicalHighlights")
    user_contribution: str = Field(alias="userContribution")
    technical_challenges: list[str] = Field(alias="technicalChallenges")
    resume_angles: list[str] = Field(alias="resumeAngles")
    evidence: list[ProfileEvidence]


# Endpoint response: the validated profile wrapped with repo identity and minimal
# generation metadata. The metadata exists for cost transparency (which model ran
# and the pre-call input-size estimate); full usage tracking is Phase 13.
class GenerateProfileResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    owner: str
    repo: str
    normalized_url: str = Field(alias="normalizedUrl")
    default_branch: str = Field(alias="defaultBranch")
    profile: ProjectProfile
    model: str
    estimated_input_tokens: int = Field(alias="estimatedInputTokens")
    evidence_file_count: int = Field(alias="evidenceFileCount")
