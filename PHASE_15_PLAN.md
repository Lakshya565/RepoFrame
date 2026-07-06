# Phase 15 Plan — Save Projects (Supabase) + GitHub App Auth & Fine-Grained Repo Access

> Companion to `PHASES.md` → *Phase 15*. Detailed, codebase-grounded build plan, broken
> into **sub-phases** with a fixed structure so each slice is shippable and verifiable on
> its own. Rules (unchanged): one slice at a time, verified before the next; **static
> checks only, zero token spend in tests**; secrets backend-only; routes thin, logic in
> services; comments mandatory and current.
>
> **Decision (2026-07-05):** persistence via Supabase **+** accounts. **Identity** comes
> from Supabase Auth (GitHub OAuth, identity-only). **Repo access** comes from a **GitHub
> App** (not the broad OAuth `repo` scope) so users get fine-grained, per-repo, read-only
> access via **ephemeral installation tokens RepoFrame never stores**.

---

## 1. Goal

A user signs in with GitHub, optionally installs the RepoFrame GitHub App on **all** or
**selected** repositories (public and/or private), analyzes any repo they've granted, and
finds every analysis saved to a **History / Saved projects** view they can reopen — with
no long-lived repo token ever held by RepoFrame.

---

## 2. Architecture — two separate pieces (read this first)

RepoFrame needs two *independent* things from GitHub, and keeping them separate is what
makes this safe:

**(A) Identity — "who is this user?" → Supabase Auth (GitHub OAuth App).**
- Supabase's built-in GitHub provider. Identity scopes only (`read:user`, `user:email`) —
  **no repo access**. Gives us the Supabase `user_id` (drives storage + RLS) and the
  user's stable GitHub numeric id.

**(B) Repo access — "read this repo's files" → GitHub App (installation tokens).**
- The user **installs** the RepoFrame GitHub App and, on GitHub's own screen, chooses
  **All repositories** or **Only select repositories** (public and/or private). That
  screen *is* the selection UI — GitHub owns the consent, which is the secure way to do it.
- The App's permissions are **Contents: Read-only + Metadata: Read-only**. Nothing else.
  RepoFrame can never write, and can never see repos outside the installation's selection.
- At analysis time the backend mints a **fresh, ~1-hour installation token** from the App
  private key, uses it for that request, and discards it. **No repo token is stored.**

**How the user's "options" map:**

| User wants | What happens |
|---|---|
| Only public repos | Don't install the App. Public repos are read without any token. |
| All repos (incl. private) | Install the App → "All repositories". |
| Select specific repos | Install the App → "Only select repositories" (native picker; editable anytime on GitHub). |

RepoFrame stores only the **installation_id** mapped to the user (not a secret), lists the
repos that installation can access, and lets the user pick one to analyze.

---

## 3. What YOU provide (one-time setup checklist)

Three registrations. For each, exactly what to create and where each value goes. **Values
never go in code**; secret values are backend-only env; only the two `NEXT_PUBLIC_*` values
are allowed in the frontend.

### A. Supabase project
Create a project at supabase.com. Provide:
| Value | Where it goes | Secret? |
|---|---|---|
| Project URL | `SUPABASE_URL` (backend) + `NEXT_PUBLIC_SUPABASE_URL` (frontend) | No |
| `anon` public key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (frontend) | No (public by design) |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` (backend) | **Yes — backend only** |
| JWT secret | `SUPABASE_JWT_SECRET` (backend) | **Yes — backend only** |

Then run the SQL migration (§5) in the Supabase SQL editor.

### B. GitHub OAuth App — for identity (wired into Supabase, not RepoFrame)
GitHub → Settings → Developer settings → **OAuth Apps** → New.
- Authorization callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`.
- Copy its **Client ID** + generate a **Client secret** → paste both into the Supabase
  dashboard (Authentication → Providers → GitHub → enable). They live **in Supabase**, not
  in RepoFrame env.

### C. GitHub App — for repo access (wired into RepoFrame backend)
GitHub → Settings → Developer settings → **GitHub Apps** → New.
- **Permissions → Repository:** *Contents: Read-only*, *Metadata: Read-only*. Nothing else.
- **Where can this App be installed?** *Any account* (so any signed-in user can install on
  their own repos). *(Solo use: "Only on this account" is fine.)*
- **Callback / Setup URL:** `https://<repoframe-frontend>/github/installed` (our
  post-install landing that captures `installation_id`).
- **Webhook** *(recommended)*: URL `https://<repoframe-backend>/api/github/webhook`, set a
  **webhook secret** (you generate a random string).
- After creating: note the **App ID** and **App slug**, and **generate + download a private
  key (.pem)**.

Provide these to the backend env:
| Value | Env var | Secret? |
|---|---|---|
| App ID | `GITHUB_APP_ID` | No |
| App slug | `GITHUB_APP_SLUG` (builds the install URL) | No |
| Private key (.pem contents) | `GITHUB_APP_PRIVATE_KEY` (or `..._PATH`) | **Yes — backend only, the crown jewel** |
| Webhook secret | `GITHUB_APP_WEBHOOK_SECRET` | **Yes — backend only** |
| Client ID / secret *(only if we add user-to-server calls)* | `GITHUB_APP_CLIENT_ID` / `_SECRET` | Yes (optional) |

> **Note:** the previous draft's `TOKEN_ENCRYPTION_KEY` is **gone** — we no longer store any
> repo token, so there's nothing to encrypt at rest. The App private key is the only
> long-lived repo secret, and it lives in backend env only.

---

## 4. Security model (how bad actors are kept out of personal info)

- **Least privilege:** the App is read-only (Contents + Metadata), so RepoFrame can never
  modify a repo, and can only see repos a user explicitly selected during install.
- **No token at rest:** installation tokens are minted per-request, held in memory, expire
  in ~1 hour. A DB compromise leaks *no* usable GitHub credential. Only `installation_id`
  (non-secret) is stored.
- **Private-key custody:** the App private key is backend-only env, never logged, never in
  the DB, never sent to the frontend. Signs short-lived app JWTs (≤10 min).
- **Ownership binding:** a user may only use *their own* installation. On the install
  callback we pass `state = supabase_user_id`, fetch the installation's `account.id` (via
  app JWT), and store the mapping **only if** that account id equals the user's GitHub id
  from their Supabase identity. Analysis verifies the requested repo is inside the user's
  installation before minting a token — a user can't pass someone else's `installation_id`.
- **Webhook integrity:** installation webhooks are verified by HMAC-SHA256 against
  `GITHUB_APP_WEBHOOK_SECRET`; unsigned/forged events are rejected. Keeps the mapping
  correct on uninstall / repo-selection changes (revocation).
- **User data isolation:** every DB access is scoped by the JWT-verified `user_id` in code,
  **and** RLS policies (`user_id = auth.uid()`) are on as defense-in-depth. The token/
  install tables deny all client roles (backend service-role only).
- **Secret boundary:** only `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  are public. Service-role key, JWT secret, App private key, webhook secret are backend-only
  (same rule the OpenAI key already follows).
- **Graceful signed-out / unconfigured:** public-repo analysis keeps working with no login
  and no Supabase (§ sub-phase acceptance).

---

## 5. Data model (Supabase / Postgres)

RLS **on**. JSONB for the whole-blob models. `user_id` → Supabase `auth.users`.

```sql
-- supabase/migrations/0001_phase15_init.sql
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  repo_owner text not null,
  repo_name text not null,
  normalized_url text not null,
  default_branch text,
  is_private boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,        -- RepoMetadataResponse
  user_context jsonb not null default '{}'::jsonb,     -- UserContext
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_url)
);
create table generated_outputs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  profile jsonb, resume_bullets jsonb, readme_intro text, portfolio_blurb text,
  linkedin_description text, interview_topics jsonb, all_guidance text default '',
  updated_at timestamptz not null default now(),
  unique (project_id)
);
create table claim_verifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  verifications jsonb not null default '[]'::jsonb, model text,
  updated_at timestamptz not null default now(),
  unique (project_id)
);
create table usage_metrics (             -- append-only; replaces backend/data/usage.json
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  prompt_tokens int not null default 0, completion_tokens int not null default 0,
  reasoning_tokens int not null default 0, total_tokens int not null default 0,
  recorded_at timestamptz not null default now()
);
create table user_installations (        -- Supabase user <-> GitHub App installation
  user_id uuid primary key references auth.users(id) on delete cascade,
  installation_id bigint not null,
  github_account_id bigint not null,       -- must match the user's GitHub identity id
  account_login text,
  repo_selection text,                     -- 'all' | 'selected'
  updated_at timestamptz not null default now()
);
-- + RLS: enable on all; policy `user_id = auth.uid()` for user-owned tables;
--   user_installations denies anon/authenticated (backend service-role only).
```
No token is stored anywhere; installation tokens are ephemeral.

---

## 6. Sub-phases

Each sub-phase uses the same template so it can be picked up and executed cleanly:
**Depends on · You provide · Backend · Frontend · Security · Tests (offline, zero-token) ·
Done when.**

### 15.0 — Supabase foundation
- **Depends on:** —
- **You provide:** the Supabase project + the four values in §3A; run the §5 migration.
- **Backend:** `services/supabase_client.py` (lazy singleton, `is_configured()`); add
  `supabase` to `requirements.txt`; add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_JWT_SECRET` to `config.py`; RLS enabled in the migration.
- **Frontend:** none.
- **Security:** service-role key + JWT secret backend-only; no secret fallbacks in code.
- **Tests:** config/import smoke; `is_configured()` true/false by env. No network.
- **Done when:** backend imports + existing 128 tests still green; app runs with Supabase
  unset (no behavior change).

### 15.1 — Backend auth (verify Supabase JWT)
- **Depends on:** 15.0 + §3B (GitHub OAuth App wired into Supabase).
- **You provide:** enable GitHub provider in Supabase with the OAuth App client id/secret.
- **Backend:** `services/auth.py` → `get_current_user(authorization)` (verify HS256 with
  `SUPABASE_JWT_SECRET`; return `user_id` + GitHub id; `None` if absent/invalid) and
  `require_user(...)` (401 if absent). A FastAPI dependency.
- **Frontend:** none yet.
- **Security:** never trust an unverified token; signed-out stays allowed for public flows.
- **Tests:** crafted JWTs signed with a test secret — valid, expired, wrong-signature,
  missing → correct outcomes. Offline.
- **Done when:** auth dependency unit-tested green.

### 15.2 — Project storage (save/list/load/delete)
- **Depends on:** 15.1
- **You provide:** nothing new.
- **Backend:** `schemas/projects.py` (snapshot request/response composed from existing
  models); `services/project_store.py` → `ProjectRepository` Protocol +
  `SupabaseProjectRepository` + `InMemoryProjectRepository`; `routers/projects.py`
  (`POST/GET/GET{id}/DELETE{id}`, all `require_user`, all `user_id`-scoped); no-op path when
  `is_configured()` is false.
- **Frontend:** none yet.
- **Security:** every method scoped by `user_id` in code; RLS as backstop.
- **Tests:** in-memory repo — upsert/list/get/delete, cross-user isolation, snapshot
  round-trip (save→load equals input), cascade delete, unconfigured no-op. Offline.
- **Done when:** storage tests green; manual Supabase smoke by you.

### 15.3 — Frontend auth + save + history (public repos only)
- **Depends on:** 15.2
- **You provide:** `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Backend:** none.
- **Frontend:** `@supabase/supabase-js` + `lib/supabase.ts`; header login/logout; attach
  the Supabase JWT to API calls; debounced auto-save of the `GenerationProvider` snapshot
  after each generation; `GenerationProvider.hydrate(snapshot)`; fill in the History tab;
  add `/saved`; gate all of it behind `NEXT_PUBLIC_SHOW_SAVED`.
- **Security:** JWT only sent to our backend; no secrets in the bundle.
- **Tests:** `tsc --noEmit` + `eslint` clean; you preview.
- **Done when:** a signed-in user can generate on a **public** repo, see it in History /
  `/saved`, reopen, and delete.

### 15.4 — GitHub App foundation (app auth + installation mapping)
- **Depends on:** 15.1 + §3C (GitHub App registered).
- **You provide:** `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`,
  `GITHUB_APP_WEBHOOK_SECRET`.
- **Backend:** `services/github_app.py` → sign app JWT, mint installation token, list an
  installation's repos; `routers/github_app.py` → post-install callback (capture
  `installation_id` + `state=user_id`, verify `account.id` == user's GitHub id, upsert
  `user_installations`) and the webhook (HMAC-verify; handle installation created/deleted,
  repositories added/removed). Add the App env to `config.py`.
- **Frontend:** the `/github/installed` landing that bounces to the callback.
- **Security:** private key backend-only; webhook HMAC verify; ownership binding before
  storing/using any installation; `user_installations` RLS-denied to clients.
- **Tests:** app-JWT signing with a throwaway key; installation-token minting against a
  **fake HTTP client** (no real GitHub); webhook signature verify (good/bad); ownership
  mismatch rejected. Offline, zero-token.
- **Done when:** installing the App links the right user↔installation; forged webhooks
  rejected.

### 15.5 — Private-repo fetching (thread installation tokens)
- **Depends on:** 15.4
- **You provide:** nothing new.
- **Backend:** add an optional `token` param through `github_service` fetchers /
  `_build_headers`; in the analyze/generate pipeline, if the repo is private (or the user
  opts in), resolve the user's installation, **verify the repo is in the installation's
  accessible set**, mint a fresh installation token, and pass it down. Public repos
  unchanged. Map "not installed / repo not selected" → a clear 403 with the install/configure
  link (never a raw GitHub error).
- **Frontend:** none yet.
- **Security:** only mint for the authenticated user's own installation; per-repo scope
  check; token never returned to the client.
- **Tests:** fake fetcher asserts the auth header is set when a token is passed; not-installed
  → 403 with link; public path byte-for-byte unchanged. Offline.
- **Done when:** a signed-in user with the App installed can analyze a **private** repo.

### 15.6 — Frontend repo-access UX (the options/selection)
- **Depends on:** 15.5
- **You provide:** nothing new.
- **Frontend:** a "Connect repositories" control that opens the install URL
  (`https://github.com/apps/<slug>/installations/new?state=<user_id>`); after install, show
  connection status + the accessible-repo list (from the backend) as a picker; a "Manage
  access on GitHub" link to edit the selection; the "only public repos" path just skips
  install. Clear empty/error/loading states.
- **Security:** the picker only ever shows repos the installation already grants.
- **Tests:** `tsc`/`eslint` clean; you preview.
- **Done when:** a user can choose all / public-only / selected and analyze accordingly.

### 15.7 — Usage-ledger migration
- **Depends on:** 15.0
- **Backend:** swap `usage_store`'s JSON body for the `usage_metrics` table when configured
  (SUM for totals, count for `runs`), keeping the JSON fallback and the exact
  `record()`/`get_total()` signatures. Routes + token panel unchanged. *(Optional: persist
  `metrics_store` too — low value since it's "since restart" by design.)*
- **Tests:** ledger behavior identical via injected fake; `/api/usage/total` unchanged.
- **Done when:** lifetime tokens read from Supabase when configured, JSON otherwise.

### 15.8 — Hardening, docs, final security review
- **Backend/Frontend:** revocation handling (uninstall/repo-removed → clear mapping, prompt
  reconnect on 403); README + `.env` example updates (values omitted); a short SECURITY
  note in the plan/README; re-run the full offline suite; confirm graceful degradation
  (signed-out + Supabase-unset) end to end.
- **Done when:** everything green; docs current; no secret ever crosses the frontend
  boundary; the public-repo MVP is unchanged when signed out.

---

## 7. Global constraints (apply to every sub-phase)

- **Testing:** no test touches real Supabase, GitHub, or OpenAI. Everything is faked
  (in-memory repos, fake HTTP client, crafted JWTs, throwaway keys). Manual integration
  checks (real Supabase + a real GitHub install) are documented but excluded from
  `python -m unittest`. Frontend is `tsc --noEmit` + `eslint` only — no dev server / browser.
- **Graceful degradation:** with Supabase/App unconfigured or the user signed out, the
  public-repo app behaves exactly as it does today.
- **Non-goals:** payments, teams, org permissions, sharing; non-GitHub providers; full
  per-generation version history (latest snapshot per repo only); rate-limit enforcement
  (Phase 16).
- **Definition of done (phase):** sign in with GitHub → optionally install the App on all/
  selected repos → analyze public **or** private repos → analyses saved to History/`/saved`,
  reopenable, deletable — with **no repo token stored**, strict per-user isolation, and the
  signed-out public flow untouched. All static checks + offline backend suite green; docs +
  comments current.
```
