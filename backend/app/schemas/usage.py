from pydantic import BaseModel, ConfigDict, Field

from app.services.llm_client import TokenUsage

# API-facing token usage shapes. The backend already captures real OpenAI usage
# internally as TokenUsage (llm_client); these models expose it to the frontend
# so the UI can show a per-analysis meter and a persistent lifetime total without
# anyone visiting the OpenAI dashboard. No dollar cost is computed (descoped).


# Real token usage for one analysis (summed across however many OpenAI calls it
# took — e.g. every turn of the verification agent loop). camelCase aliases so the
# frontend reads the same key names it uses elsewhere.
class UsageTotals(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    prompt_tokens: int = Field(0, alias="promptTokens")
    completion_tokens: int = Field(0, alias="completionTokens")
    reasoning_tokens: int = Field(0, alias="reasoningTokens")
    total_tokens: int = Field(0, alias="totalTokens")

    # Builds the API shape from the internal TokenUsage so routes never hand-map
    # the four fields. Keeping the conversion here means a new usage field is added
    # in exactly one place.
    @classmethod
    def from_usage(cls, usage: TokenUsage) -> "UsageTotals":
        return cls(
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            reasoning_tokens=usage.reasoning_tokens,
            total_tokens=usage.total_tokens,
        )


# Lifetime usage response for GET /api/usage/total: the cumulative token totals
# RepoFrame's backend has ever spent, plus how many generation runs were recorded.
# This is what lets the user track project spend without the OpenAI dashboard.
class LifetimeUsageResponse(UsageTotals):
    runs: int = 0
