import os

# ============================================================
# File Evidence Limits
# ============================================================
# These cap how many files and characters the evidence pipeline pulls per
# analysis. They are read from environment variables so they can be tuned
# at deployment time without code changes. The defaults match the values
# that were hardcoded in file_content_service.py through Phase 7.
#
# Phase 10 integration note: MAX_TOTAL_PROMPT_CHARS is the hard ceiling on
# evidence fed to OpenAI. check_prompt_budget() in token_estimator.py should
# be called before any OpenAI request to enforce this limit.

MAX_SELECTED_FILES: int = int(os.getenv("MAX_SELECTED_FILES", "12"))
MAX_CHARS_PER_FILE: int = int(os.getenv("MAX_CHARS_PER_FILE", "12000"))
MAX_TOTAL_PROMPT_CHARS: int = int(os.getenv("MAX_TOTAL_PROMPT_CHARS", "60000"))

# GitHub content API rejects or returns binary for files above this threshold.
# Phase 7 uses it to skip large files before issuing a download request.
MAX_FILE_SIZE_BYTES: int = int(os.getenv("MAX_FILE_SIZE_BYTES", "100000"))


# ============================================================
# OpenAI
# ============================================================
# API key is read from the environment only — never passed to the frontend,
# logged, or included in any response body. Phase 10 will consume this when
# adding the prompt-generation service.
#
# Do not set a fallback value here. An empty string is the safe default;
# callers should check and raise before attempting an OpenAI request.

OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

# Model and output bounds for profile generation (Phase 10). These directly
# control cost: OPENAI_MODEL picks the price tier, OPENAI_MAX_OUTPUT_TOKENS caps
# completion length (output tokens are the more expensive side), and
# OPENAI_TEMPERATURE keeps generation grounded rather than creative. Input size
# is capped separately by MAX_TOTAL_PROMPT_CHARS via check_prompt_budget().
#
# Default model. gpt-5.4-mini is a current-generation reasoning model: it does
# NOT accept `temperature` (the generator omits it automatically and uses
# `reasoning_effort` instead), and its reasoning tokens are billed as — and share
# the budget with — the output tokens. That makes it meaningfully pricier than
# gpt-4o-mini; override OPENAI_MODEL to change tiers (e.g. gpt-5.4-nano for less
# cost, or gpt-4o-mini to return to the prior default).
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-5.4-mini")

# Output budget. On reasoning models, reasoning tokens consume this same budget,
# so it must comfortably fit both the reasoning and the JSON answer; medium/high
# reasoning effort uses more, hence the generous default. Too low a cap truncates
# the answer (handled as a clear error, but better avoided).
OPENAI_MAX_OUTPUT_TOKENS: int = int(os.getenv("OPENAI_MAX_OUTPUT_TOKENS", "6000"))

# Applied only to reasoning models (minimal | low | medium | high). "medium"
# trades a little more reasoning-token spend and latency for better grounding
# and synthesis on the profile task; raise to "high" for maximum quality. Ignored
# for non-reasoning models, which use OPENAI_TEMPERATURE instead.
OPENAI_REASONING_EFFORT: str = os.getenv("OPENAI_REASONING_EFFORT", "medium")

# Used only for non-reasoning models (e.g. gpt-4o-mini). Lower = more grounded.
OPENAI_TEMPERATURE: float = float(os.getenv("OPENAI_TEMPERATURE", "0.3"))

# Network reliability bounds for the OpenAI client. The SDK default timeout is
# 600 seconds (10 minutes) — far too long for a user-facing request, so a hung
# connection would otherwise block the response for minutes. max_retries uses the
# SDK's built-in exponential backoff (honoring Retry-After) to absorb transient
# 429/5xx/connection errors. Both are env-tunable so deployments can adjust
# without code changes.
OPENAI_TIMEOUT_SECONDS: float = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "60"))
OPENAI_MAX_RETRIES: int = int(os.getenv("OPENAI_MAX_RETRIES", "2"))


# ============================================================
# Agentic Claim Verification (Phase 12)
# ============================================================
# Hard caps that bound the verification agent loop. The agent is a tool-calling
# loop, so without bounds it could spin (and spend tokens) indefinitely. These cap
# how many model turns it gets and how many evidence tool calls it may make in
# total across those turns. The per-call prompt budget (check_prompt_budget) still
# applies on every turn on top of these. On the final allowed turn the loop forces
# a no-tools answer so the run always ends with a verdict rather than mid-search.
VERIFY_MAX_ITERATIONS: int = int(os.getenv("VERIFY_MAX_ITERATIONS", "8"))
VERIFY_MAX_TOOL_CALLS: int = int(os.getenv("VERIFY_MAX_TOOL_CALLS", "12"))


# ============================================================
# Per-Session and Per-IP Request Caps (placeholder)
# ============================================================
# These constants define the intended limits but are NOT enforced yet.
# Phase 16 integration note: wire these into a FastAPI middleware using a
# library such as slowapi (wraps Redis) or enforce them at the reverse-proxy
# layer (Nginx, Cloudflare). In-process rate limiting does not survive
# restarts or horizontal scale-out.

MAX_ANALYSES_PER_SESSION: int = int(os.getenv("MAX_ANALYSES_PER_SESSION", "10"))
MAX_ANALYSES_PER_IP_PER_DAY: int = int(os.getenv("MAX_ANALYSES_PER_IP_PER_DAY", "20"))


# ============================================================
# Global Daily Analysis Cap (placeholder)
# ============================================================
# Soft ceiling on analyses per calendar day across all users, intended to
# bound OpenAI spend during early controlled access.
#
# Phase 13/16 integration note: replace the in-memory counter
# (does not survive restarts) with a Supabase or Redis counter so the cap
# holds across deploys and multiple backend instances.

MAX_ANALYSES_PER_DAY_GLOBAL: int = int(os.getenv("MAX_ANALYSES_PER_DAY", "500"))


# ============================================================
# Optional Password Gate (placeholder)
# ============================================================
# When ACCESS_PASSWORD is set, early deployments can require a shared
# password before allowing analysis. Leave blank to disable.
#
# Phase 15 integration note: replace this with Supabase Auth or a proper
# session-token check. Never treat this as production-grade security.

ACCESS_PASSWORD: str = os.getenv("ACCESS_PASSWORD", "")
