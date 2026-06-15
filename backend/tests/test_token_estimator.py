import unittest

from app.services.token_estimator import check_prompt_budget, estimate_input_tokens


# Covers the Phase 8 token estimation heuristic and budget gate that will be
# called before any OpenAI request in Phase 10.
class TokenEstimatorTests(unittest.TestCase):
    def test_estimate_returns_positive_for_nonempty_input(self) -> None:
        result = estimate_input_tokens(100)
        self.assertGreater(result, 0)

    def test_estimate_scales_with_char_count(self) -> None:
        # Larger inputs should produce proportionally larger token estimates.
        small = estimate_input_tokens(400)
        large = estimate_input_tokens(4000)
        self.assertEqual(large, small * 10)

    def test_estimate_uses_four_chars_per_token_heuristic(self) -> None:
        # 4 chars = 1 token is the documented heuristic.
        self.assertEqual(estimate_input_tokens(4), 1)
        self.assertEqual(estimate_input_tokens(40), 10)

    def test_estimate_minimum_is_one(self) -> None:
        # Even zero or very small inputs should not return zero.
        self.assertEqual(estimate_input_tokens(0), 1)
        self.assertEqual(estimate_input_tokens(1), 1)

    def test_budget_ok_when_within_limit(self) -> None:
        ok, reason = check_prompt_budget(total_chars=1000, max_chars=60_000)
        self.assertTrue(ok)
        self.assertEqual(reason, "")

    def test_budget_ok_when_exactly_at_limit(self) -> None:
        ok, _ = check_prompt_budget(total_chars=60_000, max_chars=60_000)
        self.assertTrue(ok)

    def test_budget_fails_when_over_limit(self) -> None:
        ok, reason = check_prompt_budget(total_chars=70_000, max_chars=60_000)
        self.assertFalse(ok)
        self.assertIn("70,000", reason)
        self.assertIn("60,000", reason)
        self.assertIn("OpenAI", reason)

    def test_budget_reason_includes_estimated_tokens(self) -> None:
        ok, reason = check_prompt_budget(total_chars=80_000, max_chars=60_000)
        self.assertFalse(ok)
        # 80_000 chars // 4 = 20_000 tokens
        self.assertIn("20,000", reason)


if __name__ == "__main__":
    unittest.main()
