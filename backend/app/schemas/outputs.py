from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.profile import ProjectProfile

# The four core output sections. Naming them in a Literal lets a request scope a
# regenerate to a single section while keeping the set validated in one place.
OutputSection = Literal[
    "resumeBullets",
    "readmeIntro",
    "portfolioBlurb",
    "linkedinDescription",
]


# Request for core-output generation. Takes a structured project profile (the
# Phase 10 output) so this step never re-spends profile-generation tokens. An
# optional sections list scopes generation — used so a regenerate can target a
# single section without overwriting the others. None/empty means all sections.
class GenerateOutputsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    profile: ProjectProfile
    sections: list[OutputSection] | None = None


# The generated core outputs. Every field is optional because a scoped regenerate
# returns only the requested section(s); unrequested fields stay null. Validated
# directly against the model's JSON, so camelCase aliases match the emitted keys.
class GeneratedOutputs(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    resume_bullets: list[str] | None = Field(default=None, alias="resumeBullets")
    readme_intro: str | None = Field(default=None, alias="readmeIntro")
    portfolio_blurb: str | None = Field(default=None, alias="portfolioBlurb")
    linkedin_description: str | None = Field(default=None, alias="linkedinDescription")


# Core-output endpoint response: the outputs plus minimal generation metadata for
# cost transparency (which model ran and the pre-call input-size estimate).
class GenerateOutputsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    outputs: GeneratedOutputs
    model: str
    estimated_input_tokens: int = Field(alias="estimatedInputTokens")


# One interview talking point: a likely question and concise points to make. Kept
# auditable and grounded in the profile rather than generic interview advice.
class InterviewTopic(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    question: str
    talking_points: list[str] = Field(alias="talkingPoints")


# LLM output shape for interview prep: a list of topics under a single key.
class InterviewPrep(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    topics: list[InterviewTopic]


# Request for interview prep. Separate from core outputs because interview talking
# points are generated only when the user explicitly asks (extra opt-in call).
class GenerateInterviewPrepRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    profile: ProjectProfile


# Interview-prep endpoint response: the topics plus the same cost-transparency
# metadata as the other generation endpoints.
class GenerateInterviewPrepResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    topics: list[InterviewTopic]
    model: str
    estimated_input_tokens: int = Field(alias="estimatedInputTokens")
