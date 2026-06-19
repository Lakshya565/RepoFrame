from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.profile import ProjectProfile
from app.schemas.usage import UsageTotals

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
    # Optional preemptive instruction folded into the generation prompt so the
    # user can steer the first result (e.g. "keep it concise") instead of having
    # to regenerate. Length-capped to keep prompts small and bound the output.
    guidance: str = Field(default="", max_length=400)


# The generated core outputs. Every field is optional because a scoped regenerate
# returns only the requested section(s); unrequested fields stay null. Validated
# directly against the model's JSON, so camelCase aliases match the emitted keys.
class GeneratedOutputs(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    resume_bullets: list[str] | None = Field(default=None, alias="resumeBullets")
    readme_intro: str | None = Field(default=None, alias="readmeIntro")
    portfolio_blurb: str | None = Field(default=None, alias="portfolioBlurb")
    linkedin_description: str | None = Field(default=None, alias="linkedinDescription")


# Core-output endpoint response: the outputs plus generation metadata — which
# model ran, the pre-call input-size estimate, and the real post-call token usage
# (Phase 12) that feeds the per-analysis meter and the lifetime ledger.
class GenerateOutputsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    outputs: GeneratedOutputs
    model: str
    estimated_input_tokens: int = Field(alias="estimatedInputTokens")
    usage: UsageTotals


# Request to revise a single existing output section using user feedback: the
# current (possibly edited) draft plus an optional free-text instruction. This
# powers the feedback-driven "Regenerate", as opposed to a from-scratch generate.
# The instruction is length-capped to keep prompts small and prevent a user from
# steering the model into a much larger or off-format output. currentText is
# bounded too, well above any real section, as a backstop against abuse.
class ReviseOutputRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    profile: ProjectProfile
    section: OutputSection
    current_text: str = Field(alias="currentText", max_length=16000)
    instruction: str = Field(default="", max_length=400)


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
    # Optional preemptive instruction, same role as on GenerateOutputsRequest.
    guidance: str = Field(default="", max_length=400)


# Interview-prep endpoint response: the topics plus the same generation metadata
# (model, pre-call estimate, real token usage) as the other generation endpoints.
class GenerateInterviewPrepResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    topics: list[InterviewTopic]
    model: str
    estimated_input_tokens: int = Field(alias="estimatedInputTokens")
    usage: UsageTotals
