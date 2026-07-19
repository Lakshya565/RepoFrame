import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services import supabase_client, usage_store
from app.services.llm_client import EMPTY_USAGE, TokenUsage


# Covers the persistent lifetime token ledger. Every test points the store at a
# temp file, so the real backend/data/usage.json is never touched and nothing
# spends a token (no OpenAI involvement at all).
class UsageStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        # A nested path so the store also has to create the parent directory.
        self.path = Path(self._dir.name) / "nested" / "usage.json"
        # These tests cover the JSON fallback specifically, so force the
        # unconfigured path (the test env may have Supabase env set).
        self._unconfigured = patch.object(
            supabase_client, "is_configured", return_value=False
        )
        self._unconfigured.start()

    def tearDown(self) -> None:
        self._unconfigured.stop()
        self._dir.cleanup()

    def test_missing_file_reads_as_zero(self) -> None:
        totals = usage_store.get_total(self.path)
        self.assertEqual(totals.total_tokens, 0)
        self.assertEqual(totals.runs, 0)

    def test_add_accumulates_and_persists(self) -> None:
        usage_store.add(TokenUsage(10, 20, 5, 30), self.path)
        usage_store.add(TokenUsage(1, 2, 0, 3), self.path)

        totals = usage_store.get_total(self.path)
        self.assertEqual(totals.prompt_tokens, 11)
        self.assertEqual(totals.completion_tokens, 22)
        self.assertEqual(totals.reasoning_tokens, 5)
        self.assertEqual(totals.total_tokens, 33)
        # Each add() is one recorded run.
        self.assertEqual(totals.runs, 2)
        self.assertEqual(totals.model_calls, 2)

    def test_record_skips_zero_usage(self) -> None:
        # A zero-usage run (e.g. a verify with no claims) must not inflate the
        # ledger, so the file should stay absent and the totals stay at zero.
        usage_store.record(EMPTY_USAGE, self.path)
        self.assertFalse(self.path.exists())
        self.assertEqual(usage_store.get_total(self.path).runs, 0)

    def test_record_writes_real_usage(self) -> None:
        usage_store.record(TokenUsage(5, 5, 0, 10), self.path)
        self.assertEqual(usage_store.get_total(self.path).total_tokens, 10)
        self.assertEqual(usage_store.get_total(self.path).runs, 1)

    def test_corrupt_file_reads_as_zero(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text("{ not valid json", encoding="utf-8")
        # A damaged ledger must never break reads — it degrades to zeros.
        self.assertEqual(usage_store.get_total(self.path).total_tokens, 0)


# A minimal fake Supabase client. insert() appends a row; select() without a count
# returns all rows (for _supabase_total); select(count="exact") returns a .count of
# the rows matching any chained .eq() filters (for calls_today). .gte() is accepted
# and ignored — the fake has no clock, so "today" is treated as "all rows", which is
# fine for exercising the query plumbing offline.
class _FakeTable:
    def __init__(self, rows: list) -> None:
        self._rows = rows
        self._selecting = False
        self._counting = False
        self._filters: list[tuple[str, object]] = []

    def insert(self, row: dict) -> "_FakeTable":
        self._rows.append(row)
        return self

    def select(self, _columns: str, count: str | None = None) -> "_FakeTable":
        self._selecting = True
        self._counting = count is not None
        return self

    def gte(self, _column: str, _value: object) -> "_FakeTable":
        return self

    def eq(self, column: str, value: object) -> "_FakeTable":
        self._filters.append((column, value))
        return self

    def execute(self):
        class _Result:
            pass

        rows = self._rows
        for column, value in self._filters:
            rows = [row for row in rows if row.get(column) == value]

        result = _Result()
        if self._counting:
            result.count = len(rows)
            result.data = None
        elif self._selecting:
            result.count = None
            result.data = list(rows)
        else:
            result.count = None
            result.data = None
        return result


class _FakeClient:
    def __init__(self) -> None:
        self.rows: list = []

    def table(self, _name: str) -> _FakeTable:
        return _FakeTable(self.rows)


# The Supabase-backed path (Phase 15.7 + 16.3), fully offline via the fake client.
class SupabaseUsageStoreTests(unittest.TestCase):
    def test_record_then_total_via_supabase(self) -> None:
        fake = _FakeClient()
        with patch.object(supabase_client, "is_configured", return_value=True), patch.object(
            supabase_client, "get_client", return_value=fake
        ):
            usage_store.record(TokenUsage(10, 20, 5, 30))
            usage_store.record(TokenUsage(1, 2, 0, 3))
            # A zero-usage run is still skipped on the Supabase path.
            usage_store.record(EMPTY_USAGE)
            total = usage_store.get_total()

        self.assertEqual(total.prompt_tokens, 11)
        self.assertEqual(total.total_tokens, 33)
        self.assertEqual(total.runs, 2)
        self.assertEqual(total.model_calls, 2)
        # Only the two non-empty runs were inserted.
        self.assertEqual(len(fake.rows), 2)

    def test_record_threads_user_id(self) -> None:
        # A user_id is written onto the row for the per-user quota (Phase 16.3); a
        # record with no user_id leaves the column unset.
        fake = _FakeClient()
        with patch.object(supabase_client, "is_configured", return_value=True), patch.object(
            supabase_client, "get_client", return_value=fake
        ):
            usage_store.record(TokenUsage(1, 1, 0, 2), user_id="user-1")
            usage_store.record(TokenUsage(1, 1, 0, 2))

        self.assertEqual(fake.rows[0]["user_id"], "user-1")
        self.assertNotIn("user_id", fake.rows[1])

    def test_calls_today_counts_global_and_per_user(self) -> None:
        fake = _FakeClient()
        with patch.object(supabase_client, "is_configured", return_value=True), patch.object(
            supabase_client, "get_client", return_value=fake
        ):
            usage_store.record(TokenUsage(1, 1, 0, 2), user_id="user-1")
            usage_store.record(TokenUsage(1, 1, 0, 2), user_id="user-1")
            usage_store.record(TokenUsage(1, 1, 0, 2), user_id="user-2")

            # Global counts every row; per-user counts only that user's rows.
            self.assertEqual(usage_store.calls_today(), 3)
            self.assertEqual(usage_store.calls_today("user-1"), 2)
            self.assertEqual(usage_store.calls_today("user-2"), 1)
            self.assertEqual(usage_store.calls_today("user-3"), 0)

    def test_calls_today_sums_multi_turn_investigations(self) -> None:
        fake = _FakeClient()
        with patch.object(
            supabase_client,
            "is_configured",
            return_value=True,
        ), patch.object(
            supabase_client,
            "get_client",
            return_value=fake,
        ):
            usage_store.record(
                TokenUsage(20, 10, 2, 30),
                user_id="user-1",
                model_calls=3,
            )
            usage_store.record(
                TokenUsage(2, 1, 0, 3),
                user_id="user-1",
                model_calls=1,
            )

            self.assertEqual(usage_store.calls_today(), 4)
            self.assertEqual(usage_store.calls_today("user-1"), 4)


if __name__ == "__main__":
    unittest.main()
