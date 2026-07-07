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


# A minimal fake Supabase client: insert() appends a row, select().execute()
# returns all rows — enough to exercise _supabase_record / _supabase_total offline.
class _FakeTable:
    def __init__(self, rows: list) -> None:
        self._rows = rows
        self._selecting = False

    def insert(self, row: dict) -> "_FakeTable":
        self._rows.append(row)
        return self

    def select(self, _columns: str) -> "_FakeTable":
        self._selecting = True
        return self

    def execute(self):
        class _Result:
            pass

        result = _Result()
        result.data = list(self._rows) if self._selecting else None
        return result


class _FakeClient:
    def __init__(self) -> None:
        self.rows: list = []

    def table(self, _name: str) -> _FakeTable:
        return _FakeTable(self.rows)


# The Supabase-backed path (Phase 15.7), fully offline via the fake client.
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
        # Only the two non-empty runs were inserted.
        self.assertEqual(len(fake.rows), 2)


if __name__ == "__main__":
    unittest.main()

