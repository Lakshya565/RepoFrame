import unittest

from app.services import metrics_store


# Covers the in-memory Phase 13 metrics store. Each test resets first so the
# module-level state does not leak between tests. No network, no tokens.
class MetricsStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        metrics_store.reset()

    def test_starts_at_zero_with_full_counter_set(self) -> None:
        snap = metrics_store.snapshot()
        # Every known counter is present and zero before anything happens.
        self.assertEqual(snap["counters"]["repos_analyzed"], 0)
        self.assertEqual(snap["counters"]["claims_verified"], 0)
        self.assertIn("llm", snap["latency"])
        self.assertIn("backend", snap["latency"])

    def test_increment_accumulates(self) -> None:
        metrics_store.increment(repos_analyzed=1, files_scanned=40)
        metrics_store.increment(repos_analyzed=1, files_selected=10)

        counters = metrics_store.snapshot()["counters"]
        self.assertEqual(counters["repos_analyzed"], 2)
        self.assertEqual(counters["files_scanned"], 40)
        self.assertEqual(counters["files_selected"], 10)

    def test_latency_tracks_average_and_max(self) -> None:
        metrics_store.record_latency("llm", 100.0)
        metrics_store.record_latency("llm", 300.0)

        llm = metrics_store.snapshot()["latency"]["llm"]
        self.assertEqual(llm["count"], 2)
        self.assertEqual(llm["avg_ms"], 200.0)
        self.assertEqual(llm["max_ms"], 300.0)

    def test_timed_records_a_sample(self) -> None:
        with metrics_store.timed("backend"):
            pass

        self.assertEqual(metrics_store.snapshot()["latency"]["backend"]["count"], 1)

    def test_record_request_counts_errors_only_on_5xx(self) -> None:
        metrics_store.record_request(12.0, 200)
        metrics_store.record_request(12.0, 404)
        metrics_store.record_request(12.0, 502)

        counters = metrics_store.snapshot()["counters"]
        self.assertEqual(counters["requests"], 3)
        # Only the 5xx is a server error; 404 is a client error.
        self.assertEqual(counters["errors"], 1)
        self.assertEqual(metrics_store.snapshot()["latency"]["backend"]["count"], 3)


if __name__ == "__main__":
    unittest.main()
