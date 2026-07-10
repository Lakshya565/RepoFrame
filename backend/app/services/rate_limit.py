import logging

from fastapi import HTTPException

from app import config
from app.services import supabase_client, usage_store
from app.services.auth import AuthenticatedUser

# Enforced spend caps (Phase 16.3). Every paid OpenAI call records a row in
# usage_metrics (usage_store), so counting today's rows — globally and per user —
# gives a direct, restart-proof bound on generation spend. This is the real abuse
# gate that sits on top of the login requirement: login makes spend attributable,
# these caps bound it. See config.MAX_LLM_CALLS_* for the tunable limits.
#
# Only enforced when Supabase is configured (production). The no-login dev flow has
# no ledger to count against and is intentionally unlimited — matching the rest of
# the graceful-degradation model.

logger = logging.getLogger(__name__)

# User-facing 429 messages. Deliberately actionable and non-technical; they never
# reveal the exact limit or another user's activity.
_USER_LIMIT_MESSAGE = (
    "You've reached your daily generation limit on RepoFrame. "
    "Please try again tomorrow."
)
_GLOBAL_LIMIT_MESSAGE = (
    "RepoFrame has reached its daily generation limit. Please try again later."
)


def enforce_llm_quota(user: AuthenticatedUser | None) -> None:
    """Raise 429 if today's paid-call count is at the global or per-user cap.

    Call at the START of every paid generation endpoint, before doing the work.
    No-op when Supabase is unconfigured (dev). Fails OPEN on a counting error: a
    transient database hiccup must not take generation down — the cap is a spend
    backstop, not a correctness invariant, and OpenAI's own limits remain underneath.
    """
    if not supabase_client.is_configured():
        return

    try:
        global_calls = usage_store.calls_today()
    except Exception as exc:  # noqa: BLE001 - fail open (see docstring)
        logger.warning("Global usage count failed; skipping quota check: %s", exc)
        return
    if global_calls >= config.MAX_LLM_CALLS_PER_DAY_GLOBAL:
        raise HTTPException(status_code=429, detail=_GLOBAL_LIMIT_MESSAGE)

    # When configured, the login gate has already required a verified user on these
    # routes; guard anyway so a None user simply skips the per-user check.
    if user is None:
        return

    try:
        user_calls = usage_store.calls_today(user.user_id)
    except Exception as exc:  # noqa: BLE001 - fail open (see docstring)
        logger.warning("Per-user usage count failed; skipping quota check: %s", exc)
        return
    if user_calls >= config.MAX_LLM_CALLS_PER_USER_PER_DAY:
        raise HTTPException(status_code=429, detail=_USER_LIMIT_MESSAGE)
