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
