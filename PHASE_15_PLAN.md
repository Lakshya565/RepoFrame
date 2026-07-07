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

### Access model — login is the gate (decided 2026-07-05)

RepoFrame is a tool for developers to showcase **their own** work, and every real user has a
GitHub account by definition. So **live analysis and generation require a GitHub login**; this
is the primary abuse control (an accountable identity + per-user quota, not spoofable IP limits).
There are **two distinct signed-out states**, which must behave differently:

- **Supabase unconfigured (local dev / self-host):** the full flow works with **no login** — the
  developer experience is unchanged. This is the "graceful degradation" the plan already targets.
- **Supabase configured (production) + user signed out:** the visitor sees a **static, hardcoded
  demo** of one fixed public repo — a frozen analysis + frozen generated outputs shipped as a
  fixture. The context form is **disabled** with a "log in to analyze your own repo" prompt. It
  performs **no live analysis, no generation, no GitHub calls, and spends zero tokens.**

Consequences threaded through the sub-phases below:
- When Supabase **is configured**, the analyze / generate / verify endpoints **require a verified
  user** (`require_user`). Signed-out clients never call them; they render the fixture instead.
- We deliberately **do not** restrict analysis to owned/forked repos: forking is free (so it
  stops nobody), public repos are already quota-capped, and private repos are already
  access-locked by the GitHub App. Login + per-user quota + the global daily cap (Phase 16) are
  the real controls.
- The **demo repo** is the same for every visitor (it's hardcoded). *(Decided 2026-07-06:
  `DEMO_REPO` = RepoFrame itself, github.com/Lakshya565/RepoFrame. The frozen fixture is
  hand-authored in `frontend/src/lib/demo-fixture.ts` — zero GitHub/token cost to serve.)*

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
| Only public repos | Log in (identity), don't install the App. Public repos are read without any repo token. |
| All repos (incl. private) | Log in, then install the App → "All repositories". |
| Select specific repos | Log in, then install the App → "Only select repositories" (native picker; editable anytime on GitHub). |

*(Login is required for **all** live analysis in production — the "no App" row still needs a
signed-in identity; it just needs no **repo** token. Signed-out visitors get the static demo.
See §1 Access model.)*

RepoFrame stores only the **installation_id** mapped to the user (not a secret), lists the
repos that installation can access, and lets the user pick one to analyze.

> **Forward-compat (Phase 17 — MCP server):** keep this identity/access split *portable*.
> Identity must stay a **stateless Bearer JWT in the `Authorization` header** (as 15.1 already
> does) — never a browser-cookie-only session — so a non-browser MCP client can present the
> same token. Key **quotas and rate limits on `user_id`** (not on a web session), and keep the
> installation-token minting reachable from any authenticated caller, not just the Next.js
> routes. Do this and Phase 17 becomes a thin MCP adapter over these same services instead of
> an auth refactor. See `PHASES.md` → *Phase 17*.

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
| `service_role` (or `sb_secret_…`) key | `SUPABASE_SERVICE_ROLE_KEY` (backend) | **Yes — backend only** |
| JWT secret *(legacy HS256 only)* | `SUPABASE_JWT_SECRET` (backend) | **Yes — backend only** |

> **JWT verification (2026-07-06):** projects on Supabase's newer **asymmetric JWT signing
> keys (ES256/RS256)** have **no** shared JWT secret — leave `SUPABASE_JWT_SECRET` blank and
> 15.1 verifies tokens against the public JWKS derived from `SUPABASE_URL`. Only fill it in
> if your project still uses a legacy shared HS256 secret. The values shown on the Supabase
> "JWT Keys" screen (Key ID, Discovery URL, public key set) are **not** secrets.

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
- **Graceful signed-out / unconfigured (see §1 Access model):** with **Supabase unconfigured**
  (local dev / self-host) the full public-repo flow works with no login, exactly as today. With
  **Supabase configured** (production) a signed-out visitor gets only the **static hardcoded
  demo** — zero live analysis, zero generation, zero GitHub/token spend — and the analyze /
  generate / verify endpoints require a verified user.

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
- **Token verification model (decided 2026-07-06):** the target project uses Supabase's
  **asymmetric JWT signing keys (ES256)** — there is **no HS256 shared secret**. So
  `get_current_user` verifies tokens against the project's **public JWKS**, fetched from the
  discovery URL derived from `SUPABASE_URL`
  (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`), using `pyjwt`'s `PyJWKClient` (already a
  transitive dep via `supabase`). The JWKS client caches keys and refreshes on key rotation,
  so nothing key-specific is stored in env. **Legacy fallback:** if `SUPABASE_JWT_SECRET` is
  set (a project still on a shared HS256 secret), verify HS256 with it instead — the code
  picks the path by whether the secret is present. Always pin the expected algorithm(s) and
  verify `aud` (`authenticated`) + `exp`; never accept `alg: none`.
- **Backend:** `services/auth.py` → `get_current_user(authorization)` (verify via JWKS/ES256
  by default, or HS256 if `SUPABASE_JWT_SECRET` is set; return `user_id` + GitHub id; `None`
  if absent/invalid) and `require_user(...)` (401 if absent). A FastAPI dependency.
- **Frontend:** none yet.
- **Security:** never trust an unverified token; pin algorithms (reject `none`); verify
  audience + expiry; signed-out stays allowed for public flows. The JWKS endpoint is public
  by design — it holds only public keys, no secret.
- **Tests:** crafted tokens verified against a throwaway key/JWKS the test controls — valid,
  expired, wrong-signature/wrong-key, wrong-audience, `alg:none`, and missing → correct
  outcomes. HS256-fallback path tested with a test secret. Fully offline (no real JWKS fetch).
- **Done when:** auth dependency unit-tested green on both the JWKS (ES256) and legacy HS256
  paths.

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

### 15.3 — Login gate + static demo + frontend auth/save/history (public repos)
- **Depends on:** 15.2
- **You provide:** `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`; the **demo
  repo** choice (the one fixed public repo the signed-out fixture shows).
- **Backend:** apply the login gate — when Supabase **is configured**, the analyze / generate /
  verify endpoints use `require_user` (401 for anonymous); when **unconfigured**, they stay open
  (dev flow). Ship the **demo fixture** as a static, committed data file (frozen analysis +
  frozen generated outputs for `DEMO_REPO`) served by a tiny read-only, unauthenticated endpoint
  (or embedded straight into the frontend bundle — no backend call at all). It spends zero
  tokens and makes no GitHub calls; it's precomputed once, by hand or a one-off script.
- **Frontend:** `@supabase/supabase-js` + `lib/supabase.ts`; header login/logout; attach the
  Supabase JWT to API calls; **when signed out (and Supabase configured), render the hardcoded
  demo** — the frozen `DEMO_REPO` analysis + outputs, with the context form **disabled** behind
  a "log in to analyze your own repo" prompt and every generate/verify trigger replaced by a
  login CTA; debounced auto-save of the `GenerationProvider` snapshot after each generation;
  `GenerationProvider.hydrate(snapshot)`; fill in the History tab; add `/saved`; gate the
  saved/history surfaces behind `NEXT_PUBLIC_SHOW_SAVED`.
- **Security:** JWT only sent to our backend; no secrets in the bundle; the demo fixture is
  inert static data (no live fetch/generation path reachable while signed out).
- **Tests:** backend — `require_user`-gated endpoints reject anonymous when configured and allow
  it when unconfigured (crafted JWTs, offline); the demo endpoint/fixture returns the frozen
  shape with no network. Frontend — `tsc --noEmit` + `eslint` clean; you preview.
- **Done when:** signed out (Supabase configured) shows the frozen `DEMO_REPO` demo with a
  disabled context form and login CTAs and spends nothing; a signed-in user can generate on a
  **public** repo, see it in History / `/saved`, reopen, and delete; local dev (Supabase unset)
  still works with no login.

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
- **Graceful degradation (see §1 Access model):** with Supabase/App **unconfigured** (dev/
  self-host), the public-repo app behaves exactly as it does today (no login). With Supabase
  **configured** (production), a signed-out visitor gets the static hardcoded demo only; live
  analyze / generate / verify require a verified user.
- **Non-goals:** payments, teams, org permissions, sharing; non-GitHub providers; full
  per-generation version history (latest snapshot per repo only); rate-limit enforcement
  (Phase 16).
- **Definition of done (phase):** sign in with GitHub → optionally install the App on all/
  selected repos → analyze public **or** private repos → analyses saved to History/`/saved`,
  reopenable, deletable — with **no repo token stored** and strict per-user isolation. In
  production (Supabase configured) a signed-out visitor sees the **static hardcoded demo** only
  (zero token/GitHub spend) and every analyze / generate / verify endpoint requires a verified
  user; with Supabase unconfigured the no-login dev flow is untouched. All static checks +
  offline backend suite green; docs + comments current.
```
