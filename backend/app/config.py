import os
from pathlib import Path

from dotenv import load_dotenv

# Load backend/.env into the process environment before any os.getenv() below
# runs. github_service.py also calls load_dotenv, but relying on that meant config
# values only resolved correctly when github_service happened to be imported first
# — an import-order trap. Loading here (config is the single source of truth for
# settings) makes every constant deterministic regardless of import order.
# load_dotenv does NOT override variables already set in the real environment, so a
# shell/deployment env still wins over the .env file.
_BACKEND_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(_BACKEND_ENV_FILE)

# ============================================================
# File Evidence Limits
# ============================================================
# These cap how many files and characters the evidence pipeline pulls per
# analysis. They are read from environment variables so they can be tuned
# at deployment time without code changes. The defaults match the values
# that were originally hardcoded in file_content_service.py. The rendered request
# is fitted to MAX_TOTAL_PROMPT_CHARS and checked again before every paid call.

MAX_SELECTED_FILES: int = int(os.getenv("MAX_SELECTED_FILES", "12"))
MAX_CHARS_PER_FILE: int = int(os.getenv("MAX_CHARS_PER_FILE", "12000"))
MAX_TOTAL_PROMPT_CHARS: int = int(os.getenv("MAX_TOTAL_PROMPT_CHARS", "60000"))

# GitHub content API rejects or returns binary for files above this threshold, so
# evidence collection skips them before issuing a download request.
MAX_FILE_SIZE_BYTES: int = int(os.getenv("MAX_FILE_SIZE_BYTES", "100000"))

# Repository statistics are computed lazily by GitHub and can respond more slowly
# than ordinary metadata/content endpoints. Isolate the longer timeout so other
# GitHub calls keep their tighter failure bound.
GITHUB_COMMIT_STATS_TIMEOUT_SECONDS: float = float(
    os.getenv("GITHUB_COMMIT_STATS_TIMEOUT_SECONDS", "20")
)


# ============================================================
# OpenAI
# ============================================================
# API key is read from the environment only and is never passed to the frontend,
# logged, or included in a response body.
#
# Do not set a fallback value here. An empty string is the safe default;
# callers should check and raise before attempting an OpenAI request.

OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

# GPT-5.6 Luna is RepoFrame's single model for generation and agentic work.
# This is intentionally pinned in code rather than deploy-configurable, so a
# stale OPENAI_MODEL environment variable cannot silently restore an older model.
# Input size is capped separately by MAX_TOTAL_PROMPT_CHARS, while the settings
# below bound output length, reasoning cost, network time, and retries.
OPENAI_MODEL: str = "gpt-5.6-luna"

# Output budget. On reasoning models, reasoning tokens consume this same budget,
# so it must comfortably fit both the reasoning and the JSON answer; medium/high
# reasoning effort uses more, hence the generous default. Too low a cap truncates
# the answer (handled as a clear error, but better avoided).
OPENAI_MAX_OUTPUT_TOKENS: int = int(os.getenv("OPENAI_MAX_OUTPUT_TOKENS", "6000"))

# Applied to Luna's structured generation and tool-free final verdict calls
# (minimal | low | medium | high). "medium" trades a little more reasoning-token
# spend and latency for better grounding and synthesis. Function-tool turns use
# "none" because Chat Completions rejects tools with reasoning enabled.
OPENAI_REASONING_EFFORT: str = os.getenv("OPENAI_REASONING_EFFORT", "medium")

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
# applies on every turn on top of these. The loop reserves one model turn for a
# tool-free reasoning verdict, so it always ends with JSON rather than mid-search.
VERIFY_MAX_ITERATIONS: int = int(os.getenv("VERIFY_MAX_ITERATIONS", "8"))
VERIFY_MAX_TOOL_CALLS: int = int(os.getenv("VERIFY_MAX_TOOL_CALLS", "12"))

# Separate caps for files the Evidence Investigator reads beyond the deterministic
# initial bundle. They bound GitHub work and the context growth added by tools.
VERIFY_MAX_ADDITIONAL_FILES: int = int(
    os.getenv("VERIFY_MAX_ADDITIONAL_FILES", "4")
)
VERIFY_MAX_ADDITIONAL_CHARS: int = int(
    os.getenv("VERIFY_MAX_ADDITIONAL_CHARS", "24000")
)


# ============================================================
# Enforced spend caps
# ============================================================
# These ARE enforced (unlike the placeholders above), but only when Supabase is
# configured — the no-login dev flow has no per-user ledger and stays unlimited.
# Enforcement sums `usage_metrics.model_calls`. Single-shot generation contributes
# one; verification contributes every successful Luna turn in its bounded loop.
# This keeps the cap tied to paid model requests instead of user actions.
#
# Per-user/day quota keys on the JWT-verified user_id (not a spoofable IP/session),
# so it survives across a user's browser sessions. The global/day cap is the
# backstop against many free GitHub accounts (Sybil) each spending under the
# per-user limit.
MAX_LLM_CALLS_PER_USER_PER_DAY: int = int(
    os.getenv("MAX_LLM_CALLS_PER_USER_PER_DAY", "16")
)
MAX_LLM_CALLS_PER_DAY_GLOBAL: int = int(os.getenv("MAX_LLM_CALLS_PER_DAY", "300"))


# ============================================================
# Supabase persistence and authentication
# ============================================================
# Connection + secrets for the Supabase project that backs saved projects, the
# usage ledger, and (from 15.1) JWT-based auth. All three are BACKEND-ONLY and are
# read from the environment with NO fallback: an empty string means "not
# configured", and the app must behave exactly as it does today (no login, public
# repos only) rather than half-initialize. Never log these, never return them in a
# response body, and never expose them to the frontend — only the two
# NEXT_PUBLIC_SUPABASE_* values (URL + anon key) are public, and those live in the
# frontend env, not here.
#
# - SUPABASE_URL: the project URL (e.g. https://<ref>.supabase.co).
# - SUPABASE_SERVICE_ROLE_KEY: the service-role key. It BYPASSES Row Level
#   Security, so it is the crown jewel here — every DB access made with it must be
#   scoped by the JWT-verified user_id in code (RLS is only the defense-in-depth
#   backstop). Backend only.
# - SUPABASE_JWT_SECRET: OPTIONAL, legacy. Only relevant to projects that still
#   sign tokens with a shared HS256 secret. Projects on Supabase's newer
#   asymmetric JWT signing keys (ES256/RS256) have NO such secret — 15.1 verifies
#   those against the public JWKS derived from SUPABASE_URL, so this stays blank.
#   Declared here so the full Supabase config lives in one place; unused until 15.1.

SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")


# ============================================================
# GitHub App (Phase 15.4 — fine-grained repo access)
# ============================================================
# Identity for the RepoFrame GitHub App, used to mint short-lived per-installation
# tokens for reading a user's (public or private) repos. ALL backend-only. The
# private key is the crown jewel — it signs the app JWTs and must never be logged
# or sent to the frontend. Two ways to supply it, checked in this order by
# github_app.py: GITHUB_APP_PRIVATE_KEY (the PEM contents inline) or
# GITHUB_APP_PRIVATE_KEY_PATH (a path to the .pem, easier on Windows). No fallback:
# empty means "GitHub App not configured" and private-repo access is simply off.
#
# On Windows use FORWARD SLASHES (or escape backslashes) in the PATH — dotenv
# interprets backslash escapes inside double-quoted values.

GITHUB_APP_ID: str = os.getenv("GITHUB_APP_ID", "")
GITHUB_APP_PRIVATE_KEY: str = os.getenv("GITHUB_APP_PRIVATE_KEY", "")
GITHUB_APP_PRIVATE_KEY_PATH: str = os.getenv("GITHUB_APP_PRIVATE_KEY_PATH", "")
GITHUB_APP_WEBHOOK_SECRET: str = os.getenv("GITHUB_APP_WEBHOOK_SECRET", "")


# ============================================================
# CORS allowed origins (Phase 16.4 — deployment)
# ============================================================
# Which browser origins may call the API. Defaults to the local dev frontend, so
# nothing changes locally. In production set CORS_ALLOW_ORIGINS to the deployed
# frontend origin(s), comma-separated (e.g.
# "https://repoframe.vercel.app,https://www.repoframe.app"). Kept narrow on purpose
# — the API is only meant to be called by RepoFrame's own frontend.
CORS_ALLOW_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOW_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]


# ============================================================
# Public demo repo (signed-out product demo)
# ============================================================
# The signed-out /demo route shows a LIVE analysis of one fixed public repo
# (RepoFrame itself). To let anonymous visitors load its real commit history, file
# tree, and ranked files without opening the analysis endpoints to arbitrary repos,
# the repo router permits unauthenticated reads ONLY for this owner/repo — every
# other repo still requires login when Supabase is configured (see
# services/auth.require_user_or_public_demo). Generation/LLM stays login-gated
# regardless. Set either value to "" to disable the public-demo bypass entirely.
DEMO_REPO_OWNER: str = os.getenv("DEMO_REPO_OWNER", "Lakshya565")
DEMO_REPO_NAME: str = os.getenv("DEMO_REPO_NAME", "RepoFrame")
