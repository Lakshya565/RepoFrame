import logging
import threading
from typing import TYPE_CHECKING

from app import config

# Single shared entry point to Supabase for the whole backend. Everything that
# persists data (saved projects, the usage ledger, GitHub App installation
# mappings) goes through the one service-role client this module hands out, so the
# connection is created at most once and the "is Supabase even configured?" check
# lives in exactly one place.
#
# Two deliberate design choices, both load-bearing:
#
# 1. The `supabase` package is imported LAZILY, inside get_client(), never at module
#    top. That means importing this module is always safe even before anyone has run
#    `pip install supabase` — so the app boots and the whole offline test suite runs
#    with Supabase absent. The heavy dependency is only touched when a configured
#    backend actually opens the connection.
#
# 2. The client is created with the SERVICE-ROLE key, which BYPASSES Row Level
#    Security. That is intentional (the backend is the trusted tier), but it makes
#    correctness a code-level responsibility: every query built on this client MUST
#    be scoped by the JWT-verified user_id. RLS (enabled in the migration) is only
#    the defense-in-depth backstop, not the primary guard.
#
# Phase 15 note: 15.0 only establishes this foundation. Nothing imports it yet, so
# the app's behavior is unchanged. Storage (15.2) and auth (15.1) build on top.

if TYPE_CHECKING:  # pragma: no cover - typing only, no runtime import
    from supabase import Client

logger = logging.getLogger(__name__)

# The memoized client and the lock guarding its one-time creation. Double-checked
# locking so the common (already-created) path takes no lock, while concurrent
# first calls still create exactly one client.
_client: "Client | None" = None
_lock = threading.Lock()


def is_configured() -> bool:
    """True when the backend has what it needs to talk to Supabase.

    Requires both the project URL and the service-role key (the two values the
    client is built from). When this returns False the caller must fall back to the
    no-Supabase behavior — the local-dev / self-host path where the public-repo flow
    works with no login. Read live from `config` (not captured at import) so tests
    can toggle configuration by patching the config values.

    Note: SUPABASE_JWT_SECRET is intentionally NOT part of this check — it gates
    auth (15.1), not the storage client, and a project can be reachable before auth
    is wired up.
    """
    return bool(config.SUPABASE_URL and config.SUPABASE_SERVICE_ROLE_KEY)


def get_client() -> "Client":
    """Return the shared service-role Supabase client, creating it once.

    Raises RuntimeError if Supabase is not configured — callers that might run in an
    unconfigured environment must gate on is_configured() first rather than relying
    on catching this. The `supabase` package is imported here (not at module load)
    so this module stays importable without the dependency installed.
    """
    global _client

    if not is_configured():
        # A programming error, not a user-facing condition: any code path that
        # reaches here without checking is_configured() would otherwise construct a
        # client against an empty URL/key. Fail loudly instead.
        raise RuntimeError(
            "Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY "
            "are unset); call is_configured() before get_client()."
        )

    if _client is None:
        with _lock:
            if _client is None:
                from supabase import create_client  # lazy: see module docstring

                _client = create_client(
                    config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY
                )
                logger.info("Initialized Supabase service-role client.")

    return _client


def reset_client() -> None:
    """Drop the memoized client so the next get_client() rebuilds it.

    Only needed by tests that swap configuration between cases; production never
    calls this. Kept tiny and explicit rather than reaching into the module global
    from test code.
    """
    global _client
    with _lock:
        _client = None
