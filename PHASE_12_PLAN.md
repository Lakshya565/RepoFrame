# Phase 12 Plan: Agentic Claim Verification + Token Metering

> **Status: implemented.** All four parts are built, wired, and covered by
> offline tests (no OpenAI calls / zero tokens); backend `unittest`, frontend
> `tsc --noEmit`, and `eslint` all pass. This doc is kept as the design reference.

This is the working reference for Phase 12. It expands on the framework in
PHASES.md (Phase 12) and records the decisions made during planning.

## Scope note: relationship to Phase 13

The *token-usage* slice of Phase 13 ("Usage Metrics and Cost Tracking") is
deliberately pulled forward into Phase 12, because the agentic loop is exactly
what makes spend spike and we want it visible as it happens. Phase 13 shrinks
accordingly — it keeps the non-token metrics (LLM/backend latency, claim counts,
files scanned/selected, supported-vs-unsupported counts, error counts). No
dollar/cost estimate is being built (explicitly descoped).

## Build order

Four parts, built in this order so each rests on the one before it:

1. Token-metering foundation — capture real usage at the single call chokepoint.
2. Per-analysis usage meter — session token total per repo, with breakdown.
3. Lifetime persistent ledger — JSON file counter + endpoint + UI badge.
4. Agentic claim verification — the core feature, built last so its token cost
   shows up in the meters from its first call.

---

## Part 1 — Token-metering foundation

**Problem it fixes:** today `llm_client.complete()` returns a character-based
*estimate of input tokens only*. Output and reasoning tokens — where
`gpt-5.4-mini`'s cost actually lives — are discarded, even though OpenAI returns
them on every response in `response.usage`.

**Changes:**
- Extend `CompletionResult` (in `backend/app/services/llm_client.py`) with
  `prompt_tokens`, `completion_tokens`, `reasoning_tokens`, `total_tokens` — all
  optional, defaulting to `None`/`0`.
- In `openai_completion`, populate those from `response.usage`
  (`usage.completion_tokens_details.reasoning_tokens` for the reasoning slice).
- `complete()` returns the real usage alongside content. The pre-call *estimate*
  stays (still useful as a budget pre-check) but is clearly distinguished from
  actuals.
- `llm_client.py` stays side-effect-free: it only *reports* usage, never writes
  files. This keeps the injected fake-completion tests writing nothing and
  spending nothing. Existing fakes keep working because the new fields default
  to zero.

---

## Part 2 — Per-analysis usage meter

- A small `UsageTotals` shape (prompt/completion/reasoning/total) that aggregates
  usage across every call in one analysis. For verification's agent loop, this
  sums across all iterations.
- The four generate endpoints + the new verify endpoint each return their actual
  `usage` in the response.
- **Frontend:** `ProjectWriteupSection` accumulates a running per-repo-session
  total and shows it near the generate controls, with a per-step breakdown (so
  the agent loop's cost is visible, not buried in a lump sum).

---

## Part 3 — Lifetime persistent ledger (JSON)

- New service `usage_store.py` owning a single JSON file (`backend/data/usage.json`)
  with running totals + `analyses_count`. **Atomic writes** (temp file +
  `os.replace`) so a crash mid-write can't corrupt it. Configurable path so tests
  use a temp file.
- New endpoint `GET /api/usage/total` → lifetime totals.
- **Increment at the orchestration layer**, not in `llm_client` — each
  generate/verify route calls a small `record_usage()` helper once per analysis
  after success. Keeps `llm_client` pure.
- **Frontend:** a small persistent badge (footer or near the meter), fetched on
  load — "RepoFrame lifetime: N tokens."
- The data file is **gitignored** (local state, like `.env`).
- **Intentional stopgap:** when Phase 15 (Supabase) lands, swap the JSON impl for
  a DB-backed one behind the same `add()` / `get_total()` interface — routes and
  frontend don't change. This is documented in the service.

**Two caveats baked into the docs:**
1. It counts what *RepoFrame's backend* spends, not the whole OpenAI account —
   more accurate for "this project," but a different number than the dashboard if
   the key is shared.
2. It's backend-global, not per-user (no auth yet).

---

## Part 4 — Agentic claim verification (the core feature)

Follows PHASES.md Phase 12.

**Flow:** `POST /api/generate/verify` takes `{ repo_url, user_context, outputs }`
(the generated resume bullets, README intro, portfolio blurb, LinkedIn
description). It re-runs the deterministic pipeline server-side to rebuild the
**already-selected evidence bundle** (same pattern as `/generate/profile` —
GitHub calls, zero tokens), then runs the bounded agent over it.

**The agent (bounded, in a new `claim_verifier.py` service):**
- A genuine tool-calling loop, but with tools scoped **only to the
  already-selected evidence + user context** — per the spec's "may only use
  already-selected repo evidence… should not fetch unlimited new files… should
  not run code." Tools query in-memory data (no network, no new fetch tokens):
  - `search_evidence(query)` → matching snippets/locations across selected files.
  - `read_evidence_file(path)` → the bounded content of one selected file.
  - user context is supplied in the prompt for `needs_user_confirmation`
    judgments.
- The agent identifies discrete factual claims from the outputs and, for each,
  returns structured JSON: `claim`, `status` (`supported` /
  `partially_supported` / `needs_user_confirmation` / `unsupported`), `sections`,
  `supporting_evidence`, `explanation`, `suggested_revision` (when needed).
- **Coverage + tab tags (follow-up):** the agent covers every generated tab, not
  just resume bullets, and a fact shared across tabs is verified once and tagged
  in `sections` with each tab it appears in (full coverage without re-verifying
  the same claim per tab). User-provided context is first-class evidence
  (`supported`, cited "user context") for facts the repo cannot show. The verify
  endpoint takes an optional `sections` scope: the frontend exposes a "Verify all
  claims" action plus per-tab "Verify this tab" buttons (hybrid), and results
  render as one combined list with a tab badge per claim.
- **Hard caps** in `config.py`: `VERIFY_MAX_ITERATIONS`, `VERIFY_MAX_TOOL_CALLS`,
  plus the existing `check_prompt_budget()` gate per call. The loop terminates on
  final answer or cap.
- **Post-build fix:** the selected evidence is provided **inline** in the initial
  prompt, not only via the tools. Handing the agent a manifest of file names alone
  let a reasoning model judge blind and mark everything `unsupported`; the bounded
  bundle already fits the budget (same as profile generation), so it is shown
  directly, with the tools kept as an optional re-query aid. `read_evidence_file`
  also matches paths tolerantly so a near-miss path does not dead-end the run.

**New tool-calling path in the LLM layer:** the current `complete()` is
single-shot JSON and can't drive a loop. Add a sibling (`complete_with_tools()`)
that accepts a growing message list + tool schemas, returns either tool calls or
final content, **captures usage (Part 1) on every iteration**, and stays
injectable — tests pass a fake that returns a scripted call→result→final
sequence, so the whole loop is tested offline at zero cost.

**Opt-in, like interview prep:** verification runs only on an explicit "Verify
claims" button — never automatically — so it can't spend tokens without a
deliberate click. Matches the established Phase 11 pattern.

**Frontend:** new `claim-verification-panel.tsx` rendering each claim with a
color-coded status badge, its supporting evidence, explanation, and any suggested
revision — placed near the `EvidencePanel` / under the outputs, per the spec.

---

## Backend pieces

- `config.py` — verification caps (`VERIFY_MAX_ITERATIONS`,
  `VERIFY_MAX_TOOL_CALLS`). No price map (money counter descoped).
- `llm_client.py` — usage fields on `CompletionResult`; new
  `complete_with_tools()`.
- `usage_store.py` *(new)* — JSON ledger, atomic writes, configurable path.
- `claim_verifier.py` *(new)* — the bounded agent + evidence tools.
- `schemas/` — new verification schemas (request/response, `ClaimVerification`)
  and a shared `UsageTotals`.
- `routers/generate.py` — `POST /verify`; usage recording on all generate routes.
- `routers/usage.py` *(new, or folded in)* — `GET /api/usage/total`.

## Frontend pieces

- `repo-api.ts` — typed clients for `/verify` and `/usage/total`.
- `project-writeup-section.tsx` — verify orchestration + session usage
  accumulation.
- `claim-verification-panel.tsx` *(new)* — claim status display.
- token-meter + lifetime-badge UI.
- `outputs.ts` / lib types as needed.

## Testing (all offline, zero tokens)

- Usage capture populates aggregation correctly (fake completion fn with usage).
- `usage_store` add/get with a temp file + atomic-write behavior.
- Agent loop: scripted fake tool-calling fn drives call→tool→final; asserts tool
  dispatch, cap enforcement, and JSON parsing.
- Verification schema validation.
- Verify with: focused `unittest` modules
  (`.venv/Scripts/python.exe -m unittest …`) + frontend `tsc --noEmit` and
  `npm run lint`. No OpenAI-touching test runs without explicit approval.

## Docs to update during the build

- README "Current Scope": add the verify endpoint + usage endpoint.
- PHASES.md: already updated to reflect the 13 → 12 token-tracking move.

## Resolved decisions

- **How agentic:** bounded tool-calling loop over the selected evidence, with
  strict caps (not single-pass). The meters make its cost visible.
- **Verification trigger:** opt-in via an explicit "Verify claims" button (never
  auto-run), for cost control.
- **Persistence mechanism:** JSON ledger file (not SQLite), as a clearly-marked
  stopgap until Phase 15 Supabase.
- **Money/cost counter:** descoped.

## Phase boundaries (out of scope)

- No Supabase / database (Phase 15) — the JSON ledger is a stopgap only.
- No auth / per-user accounting (later).
- No latency / error-count / claim-count metrics dashboard (remainder of
  Phase 13).
- No UI polish pass (Phase 14) — verification UI is functional, not final.
