import json
import logging
import os
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.services import supabase_client
from app.services.llm_client import EMPTY_USAGE, TokenUsage

# Persistent lifetime token ledger. This is a deliberately tiny stopgap: a single
# JSON file holding the cumulative OpenAI token totals RepoFrame's backend has ever
# spent, so the user can track project spend without opening the OpenAI dashboard
# (whose usage page lags by minutes to a day). It is NOT the real database.
#
# Phase 15 migration note: when Supabase/Postgres lands, replace this file-backed
# implementation with a DB-backed one behind the same record()/get_total()
# interface — routes and frontend will not change. The data file is git-ignored
# (see .gitignore: backend/data/), so the ledger is local state, not committed.
#
# Scope caveats (documented for whoever reads the number): (1) it counts only what
# THIS backend spends, not the whole OpenAI account, so a shared key makes it
# differ from the dashboard; (2) it is backend-global, not per-user (no auth yet).

logger = logging.getLogger(__name__)

# Default ledger location: backend/data/usage.json. The directory is created on
# first write. Tests pass their own path so they never touch this file.
_DEFAULT_PATH = Path(__file__).resolve().parents[2] / "data" / "usage.json"

# In-process lock so the read-modify-write in add() stays consistent. The frontend
# already serializes generations (one in flight at a time), so contention is low;
# this guards against any concurrent route handlers within a single process.
_lock = threading.Lock()


# Cumulative usage read from or written to the ledger: the four token totals plus
# how many generation runs have been recorded (a profile, a section
# generate/revise, an interview, or a verify each count as one run).
@dataclass(frozen=True)
class LifetimeUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    reasoning_tokens: int = 0
    total_tokens: int = 0
    runs: int = 0


# Reads the ledger file into a LifetimeUsage. A missing file is the normal
# first-run state (zeros); a corrupt/unreadable file is logged and also treated as
# zeros so a damaged ledger never breaks the usage endpoint or a generation.
def _read(path: Path) -> LifetimeUsage:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return LifetimeUsage()
    except (OSError, ValueError) as exc:
        logger.warning("Usage ledger at %s is unreadable; treating as empty: %s", path, exc)
        return LifetimeUsage()

    if not isinstance(raw, dict):
        return LifetimeUsage()

    # Read each field defensively; a hand-edited or partial file should degrade to
    # zeros for missing keys rather than raise.
    def field(key: str) -> int:
        value = raw.get(key, 0)
        return value if isinstance(value, int) else 0

    return LifetimeUsage(
        prompt_tokens=field("prompt_tokens"),
        completion_tokens=field("completion_tokens"),
        reasoning_tokens=field("reasoning_tokens"),
        total_tokens=field("total_tokens"),
        runs=field("runs"),
    )


# Writes the ledger atomically: serialize to a temp file in the same directory,
# then os.replace() it over the target. os.replace is atomic on the same
# filesystem, so a crash mid-write can never leave a half-written ledger.
def _write(path: Path, totals: LifetimeUsage) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    payload = {
        "prompt_tokens": totals.prompt_tokens,
        "completion_tokens": totals.completion_tokens,
        "reasoning_tokens": totals.reasoning_tokens,
        "total_tokens": totals.total_tokens,
        "runs": totals.runs,
    }
    temp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    os.replace(temp_path, path)


# ── Supabase-backed ledger (Phase 15.7) ─────────────────────────────────────
# When Supabase is configured, the append-only usage_metrics table replaces the
# JSON file (which does not survive multiple backend instances). record() inserts a
# row; get_total() SUMs the columns and counts rows. The exact record()/get_total()
# signatures and the LifetimeUsage return shape are unchanged, so routes and the
# token panel don't change. This stays GLOBAL (no user_id) to match the JSON
# ledger's "what this backend spent" semantics; per-user attribution is a later add.


# SUM the token columns and count the rows for the lifetime total. Reads only the
# four numeric columns (each row is one recorded run).
def _supabase_total() -> LifetimeUsage:
    client = supabase_client.get_client()
    result = (
        client.table("usage_metrics")
        .select(
            "prompt_tokens, completion_tokens, reasoning_tokens, total_tokens"
        )
        .execute()
    )
    rows = result.data or []

    def column(key: str) -> int:
        return sum(int(row.get(key) or 0) for row in rows)

    return LifetimeUsage(
        prompt_tokens=column("prompt_tokens"),
        completion_tokens=column("completion_tokens"),
        reasoning_tokens=column("reasoning_tokens"),
        total_tokens=column("total_tokens"),
        runs=len(rows),
    )


# Append one run's usage as a new row. user_id attributes the paid call to the
# signed-in user (Phase 16.3) so the per-user daily quota can count it; it stays
# None (column left null) on the unauthenticated dev path.
def _supabase_record(usage: TokenUsage, user_id: str | None = None) -> None:
    client = supabase_client.get_client()
    row = {
        "prompt_tokens": usage.prompt_tokens,
        "completion_tokens": usage.completion_tokens,
        "reasoning_tokens": usage.reasoning_tokens,
        "total_tokens": usage.total_tokens,
    }
    if user_id is not None:
        row["user_id"] = user_id
    client.table("usage_metrics").insert(row).execute()


def _today_start_iso() -> str:
    """Midnight UTC today as an ISO-8601 string — the lower bound for 'today' counts."""
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start.isoformat()


# Counts paid-call rows recorded so far today (Phase 16.3 spend caps). With a
# user_id it counts that user's calls (the per-user quota); without one it counts
# every user's calls (the global cap). Supabase-only — the caller (rate_limit)
# gates on is_configured() first, so this is never reached on the JSON dev path.
def calls_today(user_id: str | None = None) -> int:
    client = supabase_client.get_client()
    query = (
        client.table("usage_metrics")
        .select("id", count="exact")
        .gte("recorded_at", _today_start_iso())
    )
    if user_id is not None:
        query = query.eq("user_id", user_id)
    result = query.execute()
    return result.count or 0


# Returns the lifetime totals for the usage endpoint. Read-only. Uses Supabase when
# configured, falling back to the JSON file (never breaks the usage endpoint).
def get_total(path: Path = _DEFAULT_PATH) -> LifetimeUsage:
    if supabase_client.is_configured():
        try:
            return _supabase_total()
        except Exception as exc:  # noqa: BLE001 - a read failure must not 500 the endpoint
            logger.warning("Supabase usage read failed; falling back to JSON: %s", exc)
    return _read(path)


# Adds one run's usage to the ledger and returns the new lifetime totals. Holds the
# lock around the read-modify-write so concurrent calls cannot lose an update.
def add(usage: TokenUsage, path: Path = _DEFAULT_PATH) -> LifetimeUsage:
    with _lock:
        current = _read(path)
        updated = LifetimeUsage(
            prompt_tokens=current.prompt_tokens + usage.prompt_tokens,
            completion_tokens=current.completion_tokens + usage.completion_tokens,
            reasoning_tokens=current.reasoning_tokens + usage.reasoning_tokens,
            total_tokens=current.total_tokens + usage.total_tokens,
            runs=current.runs + 1,
        )
        _write(path, updated)
        return updated


# Safe wrapper the routes call after a successful generation. Zero-usage runs (a
# verify with no claims, or a call where OpenAI reported no usage) are not
# recorded, so the ledger only ever reflects real spend. A ledger write must never
# discard an already-completed (already-paid-for) generation, so any storage
# failure is logged and swallowed rather than raised.
def record(
    usage: TokenUsage, path: Path = _DEFAULT_PATH, user_id: str | None = None
) -> None:
    if usage == EMPTY_USAGE:
        return
    # Prefer Supabase when configured; a failed ledger write must never discard an
    # already-completed (already-paid-for) generation, so failures are logged and
    # swallowed rather than raised. user_id attributes the row to the signed-in user
    # for the per-user daily quota (Phase 16.3); the JSON fallback is global-only.
    if supabase_client.is_configured():
        try:
            _supabase_record(usage, user_id)
        except Exception as exc:  # noqa: BLE001 - see above; never raise here
            logger.warning("Could not record usage to Supabase: %s", exc)
        return
    try:
        add(usage, path)
    except OSError as exc:  # pragma: no cover - disk/permission failure
        logger.warning("Could not record usage to the lifetime ledger: %s", exc)
