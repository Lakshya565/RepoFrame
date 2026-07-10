import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app import config
from app.services import rate_limit, supabase_client, usage_store
from app.services.auth import AuthenticatedUser


# Covers the enforced daily spend caps (Phase 16.3). No real Supabase and no OpenAI:
# usage_store.calls_today is patched, so these assert only the enforcement logic.
class RateLimitTests(unittest.TestCase):
    def setUp(self) -> None:
        self.user = AuthenticatedUser(user_id="user-1", github_id="42")
        # Tight, known caps for the assertions regardless of env/config defaults.
        self._caps = [
            patch.object(config, "MAX_LLM_CALLS_PER_DAY_GLOBAL", 100),
            patch.object(config, "MAX_LLM_CALLS_PER_USER_PER_DAY", 5),
        ]
        for cap in self._caps:
            cap.start()

    def tearDown(self) -> None:
        for cap in self._caps:
            cap.stop()

    def test_unconfigured_is_a_noop(self) -> None:
        # Dev flow (no Supabase): never counts, never blocks, even with no user.
        with patch.object(supabase_client, "is_configured", return_value=False):
            rate_limit.enforce_llm_quota(None)
            rate_limit.enforce_llm_quota(self.user)

    def test_under_caps_passes(self) -> None:
        with patch.object(supabase_client, "is_configured", return_value=True), patch.object(
            usage_store, "calls_today", side_effect=lambda user_id=None: 3 if user_id else 50
        ):
            rate_limit.enforce_llm_quota(self.user)  # 50 < 100 global, 3 < 5 user

    def test_over_per_user_cap_429(self) -> None:
        with patch.object(supabase_client, "is_configured", return_value=True), patch.object(
            usage_store, "calls_today", side_effect=lambda user_id=None: 5 if user_id else 50
        ):
            with self.assertRaises(HTTPException) as ctx:
                rate_limit.enforce_llm_quota(self.user)
        self.assertEqual(ctx.exception.status_code, 429)

    def test_over_global_cap_429_before_user_check(self) -> None:
        # The global cap trips first; the per-user count isn't even consulted.
        calls = []

        def counter(user_id=None):
            calls.append(user_id)
            return 100 if user_id is None else 0

        with patch.object(supabase_client, "is_configured", return_value=True), patch.object(
            usage_store, "calls_today", side_effect=counter
        ):
            with self.assertRaises(HTTPException) as ctx:
                rate_limit.enforce_llm_quota(self.user)
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertEqual(calls, [None])  # only the global count ran

    def test_count_failure_fails_open(self) -> None:
        # A counting error must not block generation (fail open, not closed).
        with patch.object(supabase_client, "is_configured", return_value=True), patch.object(
            usage_store, "calls_today", side_effect=RuntimeError("db down")
        ):
            rate_limit.enforce_llm_quota(self.user)  # no exception


if __name__ == "__main__":
    unittest.main()
