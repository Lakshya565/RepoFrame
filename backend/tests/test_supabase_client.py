import sys
import types
import unittest
from unittest.mock import patch

from app import config
from app.services import supabase_client


# Covers the Supabase foundation (Phase 15.0). Every test runs fully offline: it
# never reaches a real Supabase project and never imports the real `supabase`
# package (a fake module is injected when a test needs to exercise client
# creation), so nothing here needs the dependency installed or the network.
class SupabaseClientTests(unittest.TestCase):
    def setUp(self) -> None:
        # Start every test from a clean slate: no memoized client leaking across
        # cases, and a known (unconfigured) config unless the test opts in.
        supabase_client.reset_client()

    def tearDown(self) -> None:
        supabase_client.reset_client()

    def _configured(self):
        # Context managers that make the config look fully set for the client.
        return (
            patch.object(config, "SUPABASE_URL", "https://ref.supabase.co"),
            patch.object(config, "SUPABASE_SERVICE_ROLE_KEY", "service-role-key"),
        )

    def test_is_configured_false_when_unset(self) -> None:
        with patch.object(config, "SUPABASE_URL", ""), patch.object(
            config, "SUPABASE_SERVICE_ROLE_KEY", ""
        ):
            self.assertFalse(supabase_client.is_configured())

    def test_is_configured_requires_both_values(self) -> None:
        # URL without key, and key without URL, are both "not configured".
        with patch.object(config, "SUPABASE_URL", "https://ref.supabase.co"), patch.object(
            config, "SUPABASE_SERVICE_ROLE_KEY", ""
        ):
            self.assertFalse(supabase_client.is_configured())
        with patch.object(config, "SUPABASE_URL", ""), patch.object(
            config, "SUPABASE_SERVICE_ROLE_KEY", "service-role-key"
        ):
            self.assertFalse(supabase_client.is_configured())

    def test_is_configured_true_when_both_set(self) -> None:
        url_patch, key_patch = self._configured()
        with url_patch, key_patch:
            self.assertTrue(supabase_client.is_configured())

    def test_is_configured_ignores_jwt_secret(self) -> None:
        # The JWT secret gates auth (15.1), not the storage client, so its absence
        # must not make the client look unconfigured.
        url_patch, key_patch = self._configured()
        with url_patch, key_patch, patch.object(config, "SUPABASE_JWT_SECRET", ""):
            self.assertTrue(supabase_client.is_configured())

    def test_get_client_raises_when_unconfigured(self) -> None:
        with patch.object(config, "SUPABASE_URL", ""), patch.object(
            config, "SUPABASE_SERVICE_ROLE_KEY", ""
        ):
            with self.assertRaises(RuntimeError):
                supabase_client.get_client()

    def test_get_client_creates_once_with_correct_args(self) -> None:
        # Inject a fake `supabase` module so the lazy `from supabase import
        # create_client` inside get_client() resolves without the real dependency.
        calls: list[tuple[str, str]] = []
        sentinel = object()

        fake_supabase = types.ModuleType("supabase")

        def fake_create_client(url: str, key: str):
            calls.append((url, key))
            return sentinel

        fake_supabase.create_client = fake_create_client  # type: ignore[attr-defined]

        url_patch, key_patch = self._configured()
        with url_patch, key_patch, patch.dict(sys.modules, {"supabase": fake_supabase}):
            first = supabase_client.get_client()
            second = supabase_client.get_client()

        # Same memoized instance both times, built from the configured values, and
        # create_client called exactly once (double-checked-locking memoization).
        self.assertIs(first, sentinel)
        self.assertIs(second, sentinel)
        self.assertEqual(calls, [("https://ref.supabase.co", "service-role-key")])

    def test_reset_client_forces_recreation(self) -> None:
        calls: list[tuple[str, str]] = []
        fake_supabase = types.ModuleType("supabase")
        fake_supabase.create_client = lambda url, key: calls.append((url, key)) or object()  # type: ignore[attr-defined]

        url_patch, key_patch = self._configured()
        with url_patch, key_patch, patch.dict(sys.modules, {"supabase": fake_supabase}):
            supabase_client.get_client()
            supabase_client.reset_client()
            supabase_client.get_client()

        # Two creations because reset_client dropped the memoized instance between them.
        self.assertEqual(len(calls), 2)


if __name__ == "__main__":
    unittest.main()
