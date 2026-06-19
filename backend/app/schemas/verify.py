from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictStr

from app.schemas.outputs import GeneratedOutputs, OutputSection
from app.schemas.profile import UserContextInput
from app.schemas.usage import UsageTotals

# Phase 12 agentic claim verification. The verifier reviews the generated outputs
# (resume bullets, README intro, portfolio blurb, LinkedIn description) and labels
# each factual claim by how well the already-selected repo evidence and the user's
# context support it. This is what makes RepoFrame an agentic analysis tool rather
# than a generic AI writer.

# How well a claim is backed. Kept as a closed set so the frontend can map each
# status to a fixed badge and the model cannot invent its own labels:
#   - supported: the evidence/context directly backs the claim.
#   - partially_supported: some support, but the claim overstates or generalizes.
#   - needs_user_confirmation: plausible but only the user can confirm (e.g. impact
#     numbers or intent the repo cannot reveal).
#   - unsupported: nothing in the evidence or context backs it.
ClaimStatus = Literal[
    "supported",
    "partially_supported",
    "needs_user_confirmation",
    "unsupported",
]


# One verified claim. extra="ignore" tolerates a verbose model adding stray keys
# rather than failing the whole verification. supporting_evidence lists the sources
# (file paths / "user context") the agent actually used; sections lists which
# output tabs the claim appears in (a shared fact is verified once and tagged with
# every tab it shows up in); suggested_revision is set only when the claim should
# be reworded or dropped.
class ClaimVerification(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    claim: str
    status: ClaimStatus
    sections: list[str] = Field(default_factory=list)
    supporting_evidence: list[str] = Field(
        default_factory=list, alias="supportingEvidence"
    )
    explanation: str = ""
    suggested_revision: str | None = Field(default=None, alias="suggestedRevision")


# The agent's final JSON shape: the list of verified claims under one key. Parsed
# from the model's last (no-tool-calls) message.
class ClaimVerificationResult(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    verifications: list[ClaimVerification]


# Request body for verification. Takes the repo URL (the deterministic pipeline is
# re-run to rebuild the already-selected evidence bundle, exactly like profile
# generation), the user context (for claims only the user can confirm), and the
# generated outputs whose claims are to be checked. An optional sections list
# scopes a per-tab verification to specific output tabs; None/empty means verify
# every tab that has content.
class VerifyClaimsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    repo_url: StrictStr = Field(alias="repoUrl", min_length=1, max_length=2048)
    user_context: UserContextInput = Field(
        default_factory=UserContextInput, alias="userContext"
    )
    outputs: GeneratedOutputs
    sections: list[OutputSection] | None = None


# Verification endpoint response: the per-claim results plus the same generation
# metadata as the other endpoints (model, pre-call estimate, real token usage —
# summed across every turn of the agent loop).
class VerifyClaimsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    verifications: list[ClaimVerification]
    model: str
    estimated_input_tokens: int = Field(alias="estimatedInputTokens")
    usage: UsageTotals
