# Phase 15 Plan — Save Projects with Supabase

> Companion to `PHASES.md` → *Phase 15: Save Projects with Supabase*. This is the
> detailed, codebase-grounded build plan. It follows the same rules as every phase:
> one exact slice at a time, verified before the next; static checks only (no token
> spend); secrets backend-only; routes thin, logic in services; comments mandatory
> and kept current.

---

## 1. Goal

Give RepoFrame persistence: a user can generate a writeup for a repo, leave, come
back, and reopen their saved analyses. Add Supabase (Postgres) storage for saved
project snapshots — repo metadata, user context, the project profile, the generated
outputs, interview prep, claim verifications, and usage — plus a **saved projects /
history** view to reopen them.

Auth stays **optional and deferred** (per `PHASES.md`: "Keep auth optional for
now"). No payments, teams, or complex permissions.

---

## 2. Why now / current-state grounding

The codebase was written anticipating this phase — several seams already exist:

- **`backend/app/services/usage_store.py`** — the lifetime token ledger is a JSON
  file behind a tiny `record()` / `get_total()` interface, with an explicit note:
  *"when Supabase/Postgres lands, replace this file-backed implementation with a
  DB-backed one behind the same interface — routes and frontend will not change."*
- **History tab placeholder** — `frontend/src/app/analysis/[owner]/[repo]/history/page.tsx`
  already renders a "History is coming soon … once accounts and storage land in a
  later phase" card. Phase 15 fills it in.
- **`config.py`** — `ACCESS_PASSWORD` carries a *"Phase 15 integration note: replace
  with Supabase Auth"* comment; the global daily-cap counter notes a Supabase/Redis
  replacement.
- **`GenerationProvider`** (`frontend/src/lib/generation-context.tsx`) already holds
  the entire per-analysis state in one place — it is the natural save/load unit.
- **Injectable-dependency testing pattern** is established everywhere (fetchers,
  completion fns, ledger paths), so a Supabase repository can be faked offline.

Nothing about the local MVP should change for someone who does **not** configure
Supabase — see §9 (graceful degradation).

---

## 3. Scope

### In scope
- Supabase project + schema (DDL) + backend client module.
- A repository layer (interface + Supabase impl + in-memory fake for tests).
- Save (upsert) a full project snapshot; list snapshots; load one; delete one.
- Auto-save after each successful generation; per-browser identity without auth.
- History tab (per-repo) + a global "Saved projects" page.
- Migrate the lifetime usage ledger (and optionally system metrics) from the
  JSON/in-memory stopgaps into Supabase **behind the existing interfaces**.
- Feature-flagged UI + graceful no-op when Supabase is unconfigured.

### Out of scope (explicit non-goals)
- Real authentication / login UI (Supabase Auth is *prepared for*, not built).
- Payments, teams, org permissions, sharing.
- Full per-generation version history (we store the **latest** snapshot per repo;
  1:many generation history is a noted future extension).
- Cross-device sync (requires auth).
- Rate-limit / daily-cap enforcement (that stays a Phase 16 concern).

---

## 4. Identity without auth (key decision)

Because auth is deferred, saved rows need *some* owner so History isn't globally
shared. Recommended approach:

- **`owner_key`**: a client-generated UUID stored in `localStorage`
  (`repoframe_owner_key`), created on first use, sent to the backend on every
  save/list/load call (header `X-RepoFrame-Owner` or a query param).
- In the DB it is a **nullable** `owner_key` column that later becomes / sits
  alongside a real `user_id` when Supabase Auth lands. No schema churn needed then.

This gives per-browser history immediately, with a clean upgrade path. It is **not**
security (anyone with the key can read those rows) — acceptable because the data is
non-sensitive public-repo writeups and there's no auth yet. Documented as such.

> **Open question for the user:** accept the `owner_key`-in-localStorage model, or
> keep saves **global/anonymous** for the MVP (simpler, but everyone shares one
> History)? Default assumption: `owner_key`.

---

## 5. Data model (Supabase / Postgres)

Four tables, matching `PHASES.md`. JSONB is used for the structured blobs that are
always read/written whole (profile, outputs, verifications) so the schema tracks the
existing Pydantic/TS models without a migration every time a field is added.

```sql
-- 15.0 schema (supabase/migrations/0001_phase15_init.sql)

create extension if not exists "pgcrypto";

-- One row per saved analysis (a repo, for an owner_key). Upserted on save.
create table projects (
  id             uuid primary key default gen_random_uuid(),
  owner_key      uuid,                      -- future: user_id (nullable until auth)
  repo_owner     text not null,
  repo_name      text not null,
  normalized_url text not null,
  default_branch text,
  metadata       jsonb not null default '{}'::jsonb,   -- RepoMetadataResponse shape
  user_context   jsonb not null default '{}'::jsonb,   -- UserContext shape
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_key, normalized_url)         -- one snapshot per repo per owner
);

-- Latest generated content for a project (1:1). Upserted on each generation.
create table generated_outputs (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,
  profile               jsonb,               -- ProjectProfileData
  resume_bullets        jsonb,               -- string[]
  readme_intro          text,
  portfolio_blurb       text,
  linkedin_description  text,
  interview_topics      jsonb,               -- InterviewTopic[]
  all_guidance          text default '',
  updated_at            timestamptz not null default now(),
  unique (project_id)
);

-- Latest claim-verification run for a project (1:1).
create table claim_verifications (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  verifications jsonb not null default '[]'::jsonb,   -- ClaimVerification[]
  model         text,
  updated_at    timestamptz not null default now(),
  unique (project_id)
);

-- Append-only usage events. Lifetime totals = SUM over this table; per-project
-- spend = SUM where project_id = ?. Replaces backend/data/usage.json.
create table usage_metrics (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid references projects(id) on delete set null,
  prompt_tokens     integer not null default 0,
  completion_tokens integer not null default 0,
  reasoning_tokens  integer not null default 0,
  total_tokens      integer not null default 0,
  recorded_at       timestamptz not null default now()
);
```

Notes:
- **RLS**: leave Row Level Security **off** for Phase 15 (server uses the service-role
  key; there's no per-user auth to key policies on). Add RLS keyed on `user_id` when
  Supabase Auth lands — noted in a migration comment.
- Storing whole blobs as JSONB deliberately mirrors the current models; if we later
  want to query inside them (e.g. "claims by status"), add generated columns then.
- `usage_metrics` is append-only so `get_total()` becomes `SUM(...)` + a `count(*)`
  for `runs`. (Alternative: a single-row ledger table — simpler drop-in but loses
  per-project/day breakdowns. Recommended: append-only.)

---

## 6. Backend work

Keep the AGENTS.md architecture: **isolate Supabase behind a small client module**,
put all logic in a service/repository, keep routes thin, use Pydantic schemas.

### 6.1 Client module — `services/supabase_client.py`
- Reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from env (backend only, never
  logged, never returned). Lazily constructs a single client.
- `is_configured() -> bool` so callers can no-op cleanly when unset (§9).
- Dependency: `supabase` (supabase-py) added to `requirements.txt`.
  - *Alternative considered:* raw `asyncpg`/SQLAlchemy. Rejected for MVP — supabase-py
    is less setup and matches the "Supabase" framing; the repository interface makes
    the choice swappable later.

### 6.2 Repository layer — `services/project_store.py`
Define an interface and two implementations so tests never touch the network:
```python
class ProjectRepository(Protocol):
    def upsert_project(self, snapshot: ProjectSnapshot) -> SavedProject: ...
    def list_projects(self, owner_key: str | None) -> list[ProjectSummary]: ...
    def get_project(self, project_id: str, owner_key: str | None) -> ProjectSnapshot | None: ...
    def delete_project(self, project_id: str, owner_key: str | None) -> None: ...
```
- `SupabaseProjectRepository` — the real impl (upserts across the 3–4 tables in one
  logical save; reads join them back into a snapshot).
- `InMemoryProjectRepository` — dict-backed fake used by every unit test.
- A module-level `get_repository()` returns the Supabase impl when configured, else
  `None` (routes then return the "not configured" path). Tests inject the fake.

### 6.3 Schemas — `schemas/projects.py`
Pydantic request/response models. Reuse existing models by composition so the
snapshot is exactly what the frontend already has:
- `ProjectSnapshotRequest` = repo identity + `RepoMetadataResponse` + `UserContext`
  + `ProjectProfile` + `GeneratedOutputs` + `list[InterviewTopic]` +
  `list[ClaimVerification]` (all optional so a partial analysis still saves).
- `SavedProjectSummary` (id, repo, title, updatedAt, counts) for the list view.
- `SavedProjectResponse` = full snapshot for rehydration.

### 6.4 Routes — `routers/projects.py` (thin)
- `POST /api/projects` — upsert the snapshot for `(owner_key, normalized_url)`;
  returns the saved id + `updatedAt`.
- `GET  /api/projects` — list summaries for the `owner_key`.
- `GET  /api/projects/{id}` — full snapshot to reopen.
- `DELETE /api/projects/{id}` — remove (cascade handles children).
- All map repo/DB errors to HTTP like the existing routers; all no-op with a clear
  409/501-style "storage not configured" when `get_repository()` is `None`.

### 6.5 Migrate the usage ledger behind its existing interface
`usage_store.record()` / `get_total()` stay the **same signatures**; swap the JSON
body for the `usage_metrics` table when Supabase is configured, else keep the JSON
file (so local dev without Supabase is unchanged). Routes and the frontend token
panel need **zero** changes. (Optional stretch: persist `metrics_store` counters to
Supabase too; lower value since they're "since restart" by design — can stay
in-memory.)

### 6.6 Config / env (`config.py` + docs)
Add, backend-only:
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY   # backend only — never exposed to the frontend
```
- Keep `SUPABASE_ANON_KEY` documented for the future client-side auth phase (unused
  now).
- No secret fallbacks in code (existing rule). Update README env docs + `.env`
  example (values omitted).

---

## 7. Frontend work

### 7.1 API client — `lib/projects-api.ts`
`saveProject`, `listProjects`, `loadProject`, `deleteProject` — thin `postJson`/fetch
wrappers mirroring `repo-api.ts`, attaching the `owner_key` header. A tiny
`lib/owner-key.ts` reads/creates the localStorage UUID.

### 7.2 Auto-save
After each successful generation in `project-writeup-section.tsx` (profile / section
/ interview / revise / verify handlers), fire a **debounced** `saveProject` with the
current `GenerationProvider` snapshot. Rationale: History should populate without a
manual "Save" step. Failures are swallowed + surfaced quietly (never block or
discard a paid generation). Skips entirely when storage is unconfigured.

> **Open question:** auto-save vs. an explicit "Save analysis" button? Default:
> auto-save (matches the "history" mental model). Easy to switch to a button.

### 7.3 History tab (per-repo) — fill in the placeholder
`history/page.tsx` becomes a client view that lists this `owner_key`'s saved snapshot
for the current repo (and any siblings), with "Reopen" → loads the snapshot into
`GenerationProvider` (a `hydrate(snapshot)` action added to the provider) and routes
to the Generate tab, and "Delete".

### 7.4 Global "Saved projects" page — `/saved`
`PHASES.md` asks for "a simple saved projects page that lists saved analyses and lets
the user reopen them." Add a `/saved` route (linked from the site header / landing)
listing all of the `owner_key`'s projects as cards (repo, title, updated time),
reopening into `/analysis/[owner]/[repo]/generate`. Reuse existing Card styling and
loading/empty/error states.

### 7.5 Feature flag
Gate the save/History/Saved UI behind `NEXT_PUBLIC_SHOW_SAVED` (mirroring the
existing `NEXT_PUBLIC_SHOW_METRICS` pattern), so a public build can hide persistence
until it's ready, and local dev turns it on.

---

## 8. Auth (prepared, not built)

- Do **not** implement login in Phase 15.
- The `owner_key` column *is* the seam: when Supabase Auth arrives, populate
  `user_id` from the authenticated session, backfill/alias `owner_key`, turn on RLS
  policies (`user_id = auth.uid()`), and move the anon localStorage key to a
  migration path. All documented in the migration file + this plan.

---

## 9. Graceful degradation (hard requirement)

If `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are unset:
- Backend `get_repository()` returns `None`; save/list/load return a clean
  "storage not configured" signal (no 500s); `usage_store` keeps using the JSON file.
- Frontend: `NEXT_PUBLIC_SHOW_SAVED` off → no auto-save, History tab keeps its
  "coming soon" card, no `/saved` link.
- **The entire existing local MVP works exactly as today with no Supabase account.**
  This is verified as part of acceptance.

---

## 10. Testing strategy (offline, zero-token)

Consistent with the standing constraints (no token spend, static checks, offline
tests):
- **Unit-test everything against `InMemoryProjectRepository`** — upsert/list/get/
  delete semantics, owner-key scoping, snapshot round-trip (save → load equals input),
  cascade-on-delete behavior, and the "unconfigured → no-op" path.
- **`usage_store` migration tests** reuse the injectable pattern (inject a fake repo
  instead of a path) and assert `record()`/`get_total()` behavior is unchanged.
- **No test touches real Supabase or OpenAI.** A single, clearly-marked manual
  integration check (run by the user against a real Supabase project) is documented
  but excluded from `python -m unittest`.
- Frontend: `tsc --noEmit` + `eslint` clean; provider `hydrate()` and owner-key util
  are pure and unit-reasoned. No dev server / browser runs.

---

## 11. Suggested sequencing (one verifiable slice at a time)

| Step | Slice | Verify |
|------|-------|--------|
| 15.0 | Supabase project, env wiring, DDL migration, `supabase_client` + `is_configured()`. No behavior change. | Backend imports/tests still green; app runs unconfigured. |
| 15.1 | `ProjectRepository` interface + `InMemoryProjectRepository` + `schemas/projects.py` + unit tests. | New offline tests pass. |
| 15.2 | `SupabaseProjectRepository` + `routers/projects.py` (save/list/load/delete) + unconfigured no-op. | Route tests via fake repo; manual Supabase smoke by user. |
| 15.3 | Frontend `projects-api` + `owner-key` + provider `hydrate()` + debounced auto-save. | tsc/eslint clean; user preview. |
| 15.4 | History tab fill-in + `/saved` page + `NEXT_PUBLIC_SHOW_SAVED` flag. | tsc/eslint clean; user preview. |
| 15.5 | Migrate `usage_store` to Supabase behind existing interface (JSON fallback kept). | Ledger tests unchanged; `/api/usage/total` identical. |
| 15.6 | *(Deferred)* Supabase Auth → real `user_id` + RLS. | Future phase. |

---

## 12. Risks & mitigations

- **Secret exposure** — service-role key is backend-only, never in `NEXT_PUBLIC_*`,
  never logged/returned. (Same rule already enforced for the OpenAI key.)
- **No RLS yet** — acceptable because there's no auth and data is non-sensitive;
  `owner_key` is obfuscation, not security. Documented; RLS lands with auth.
- **Breaking the no-Supabase flow** — mitigated by §9 graceful degradation, tested.
- **Schema drift vs. JSONB blobs** — blobs mirror existing models; add generated
  columns only when we need to query inside them.
- **Save cost** — saves are pure DB writes: **no tokens**, safe to auto-run.
- **Snapshot bloat** — one row per repo per owner (upsert), not per generation, so
  storage stays bounded.

---

## 13. Definition of done

- A user (with Supabase configured + flag on) can generate, see the analysis appear
  in History and `/saved`, reopen it into a fully-rehydrated Generate tab, and delete
  it — all without auth and without spending tokens on save/load.
- The lifetime token ledger reads from Supabase when configured, JSON otherwise, with
  no route/UI change.
- With Supabase **unconfigured**, the app behaves exactly as it does today.
- `tsc --noEmit`, `eslint`, and the offline backend `unittest` suite are all green;
  README + env docs updated; comments current.
```
