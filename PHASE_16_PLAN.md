# Phase 16 Plan — UI/UX Pass + Deployment

> Companion to `PHASES.md` → *Phase 16*. Detailed, codebase-grounded build plan, broken
> into **sub-phases** with a fixed structure so each slice is shippable and verifiable on
> its own. Rules (unchanged from Phase 15): one slice at a time, verified before the next;
> **static checks only, zero token spend** (`npx tsc --noEmit`, `npx eslint .`, backend
> `python -m pytest` / `unittest`; no `next dev`/`build`, no OpenAI calls — **you preview the
> frontend in the browser**); any value a user might tune lives in a **single named constant**
> (single source of truth); secrets backend-only; routes thin, logic in services; comments
> mandatory and current.
>
> **Scope reconciliation (2026-07-07):** `PHASES.md` Phase 16 was originally just
> *Deployment*. Per the user, the **remaining UI pass is folded into Phase 16, ahead of
> deployment** — the natural pre-launch order is *polish, then ship*. So this plan is two
> movements: **16.0–16.2 = the UI/UX pass**, then **16.3–16.4 = deployment** (the original
> Phase 16 content, now the tail end).
>
> **Already DONE — do NOT redo:** the **Analysis page** (hero overview card + Tech stack / Files
> we read / Repository structure sections; the fixed-tile tech-stack "wall of cards"; the
> interactive icon-cloud ripple) and the **Generate page** (2-step stepper, side-rail
> master–detail output cards, context-review step, the streaming **verification agent** panel).
> The **queued animations are also done** — the icon-cloud ripple (`tech-icon-cloud.tsx`), the
> theme-toggle float→expand transition (`theme-toggle.tsx`), and the Generate-page motion. This
> pass is therefore **the reopen-from-history behavior, the placeholder Phase-15 auth/demo/saved
> surfaces, cross-cutting states/landing/responsive polish, and deployment** — not animation or
> structural work.

---

## 1. Goal

Take RepoFrame from "structurally complete, static-clean" to **demoable and deployable**:
reopening a saved analysis loads the workspace **exactly like a fresh repo-URL paste, but with
the Generate page pre-filled** (the one unfinished Phase-15 acceptance criterion); the Phase-15
auth/demo/saved surfaces graduate from placeholder to shipped; every surface shares one polished,
responsive, accessible language; and the app is live behind controlled access with per-user +
global spend caps actually enforced.

The bar: a stranger can land signed-out, understand the product from the demo in under 60
seconds, log in, analyze a repo, generate + verify a writeup, reopen it later (fully populated),
and never see a janky state — on desktop **or** phone.

---

## 2. Scope — what remains (read this first)

Grounded in the real files. Each row becomes (part of) a sub-phase below.

| Area | Files | State today → target |
|---|---|---|
| **Reopen from history** | `saved-projects-list.tsx`, analysis `layout.tsx`, `generation-context.tsx` (`hydrate`), `projects-api.ts` (`getProject`) | "Open" re-analyzes but Generate is empty → open loads live **and** pre-fills the Generate page from the snapshot |
| Saved/History surface polish | `saved-projects-list.tsx`, `app/saved/page.tsx`, History tab, `connect-repos-button.tsx` | Minimal placeholder → shipped; un-gate `NEXT_PUBLIC_SHOW_SAVED` |
| Auth & signed-out surfaces | `auth-button.tsx`, `site-header.tsx`, `repo-url-form.tsx`, `app/demo/page.tsx`, `demo-cta.tsx` | Minimal placeholder → production-quality (esp. the "Log in with GitHub" button + demo) |
| Cross-cutting states + landing | `states.tsx`, `app/page.tsx`, `claim-verification-panel.tsx`, evidence display | Uneven loading/error/empty; landing rough → consistent, clean, responsive |

**Explicitly NOT in scope:** the Analysis/Generate page structure or animations (done); any change
to OpenAI calls, prompts, token flow, or backend generation behavior (the UI pass is presentation
plus one bit of client routing for reopen); new product features; payments/teams.

---

## 3. Standing design constraints (apply to every UI sub-phase)

- **Single source of truth for tunables.** Every duration, easing, size threshold, color/opacity
  a user might tweak is a **named constant** at the top of its module (or a shared
  `globals.css` `@theme`), never a magic number inline — the project's standing rule.
- **Reduced motion is mandatory.** Any motion respects `prefers-reduced-motion`
  (`useReducedMotion()` / `motion-reduce:`); reduced-motion users get the end state instantly.
- **Animate `transform`/`opacity` only** (no `width`/`height`/`top`/`left` — layout thrash / CLS).
- **Semantic tokens, not raw colors.** `bg-background`, `text-muted-foreground`, `var(--brand)`,
  etc. — no `bg-blue-500`, no manual `dark:` color overrides. Light + dark designed together.
- **Mobile-first + accessibility floor.** Systematic breakpoints; no horizontal scroll; ≥44px
  touch targets with ≥8px spacing; `min-h-dvh` over `100vh`; visible focus rings; 4.5:1 text
  contrast; icon-only buttons carry `aria-label`. Wide content scrolls in its own
  `overflow-x-auto` container, never the page.
- **shadcn discipline.** Compose existing primitives (`Button`, `Card`, `Badge`, `Skeleton`,
  `Separator`, `Empty`) with their variants; `gap-*` not `space-*`; `size-*` when w==h; `cn()`
  for conditional classes; no manual z-index on overlay components.
- **Verification = static checks + your preview.** After each slice: `npx tsc --noEmit` +
  `npx eslint .` clean (from `frontend/`). No `next dev`/`build` in the loop, no token spend.
  **You** preview the surface and sign off before the next slice.
- **Nothing committed unless you ask.**

---

## 4. What YOU provide (mostly for deployment, 16.3–16.4)

The UI pass (16.0–16.2) needs **nothing new from you** — it runs on the existing local setup and
your browser previews. Deployment needs:

| Value / action | Where it goes | Secret? |
|---|---|---|
| **Vercel** project (frontend) | hosts the Next.js app | — |
| **Backend host** (Render / Fly.io / Railway) | runs FastAPI (`uvicorn`) | — |
| Production `NEXT_PUBLIC_API_BASE_URL` = deployed backend URL | frontend env (Vercel) | No |
| Production `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `NEXT_PUBLIC_GITHUB_APP_SLUG` | frontend env (Vercel) | No (public) |
| All backend secrets (`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, optional `GITHUB_TOKEN`) | backend host env | **Yes — backend only** |
| **Supabase → Auth → URL Configuration**: add the production Site URL + `https://<frontend>/**` to Redirect URLs | Supabase dashboard | No |
| **GitHub OAuth App** (identity): keep the client secret current in Supabase; add the prod callback if the project ref changes | GitHub + Supabase dashboard | secret in Supabase |
| **GitHub App** (repo access): set the production **Webhook URL** `https://<backend>/api/github/webhook` + **Setup/Callback URL** `https://<frontend>/github/installed` | GitHub App settings | — |

> **Login gotcha carried over from Phase 15 (2026-07-07):** the `Unable to exchange external
> code` failure is a **stale/mismatched GitHub OAuth App client secret in Supabase**, not a
> redirect-allowlist issue. At deploy, re-verify the OAuth App client id/secret in Supabase and
> that the Redirect URLs include the production origin (`https://<frontend>/**`).

---

## 5. Sub-phases

Each sub-phase uses the same template: **Depends on · You provide · Frontend · Backend ·
Security · Verification (static + your preview) · Done when.** (`Security` appears only where
it's load-bearing.)

### 16.0 — Reopen from history (load live + pre-fill Generate) + Saved/History polish
- **Depends on:** —
- **You provide:** nothing.
- **Behavior (decided 2026-07-07):** reopening a saved project must load **exactly like pasting
  that repo's GitHub URL fresh** — the Analysis page runs its normal live fetch (metadata, tree,
  tech stack, commit timeline), nothing short-circuited — **except the Generate page comes
  pre-filled** with the saved writeup (profile, outputs, interview prep, verifications, and the
  user context). No tokens are spent reopening; the generated content is restored, not
  regenerated.
- **Frontend:** **(a) Wire it (option 1 — query param).** The "Open" button in
  `saved-projects-list.tsx` navigates to `/analysis/{owner}/{repo}?projectId={id}` (instead of the
  bare route). Add a small **`ProjectHydrator`** client component mounted in the analysis
  **`layout.tsx`** (so it sits under `GenerationProvider`, mirroring `project-auto-save.tsx`): on
  mount, if a `projectId` search param is present, call `getProject(id)` (built,
  `projects-api.ts`) then `hydrate(snapshot)` (built, `generation-context.tsx`) **once** (ref-
  guarded like `use-inferred-context.ts`'s `startedRef`), then strip the param from the URL. This
  only populates the **generation state**; it does **not** touch or gate the Analysis page's own
  live fetch, which runs as usual from the URL. `hydrate` already sets `guessesSeeded=true`, so
  the free-context seed won't overwrite the restored context. Guard `use-project-autosave.ts` so a
  freshly-hydrated, unchanged snapshot isn't immediately re-saved. **(b) Polish** the saved list +
  `/saved` page + History tab + `connect-repos-button.tsx` (states, spacing, mobile), and **flip
  `NEXT_PUBLIC_SHOW_SAVED` on** once solid.
- **Backend:** none — `GET /api/projects/{id}` already returns the full snapshot.
- **Security:** reopen fetches only the signed-in user's own project (the endpoint is user-scoped;
  a foreign id 404s).
- **Verification:** `tsc`/`eslint` clean; you preview — save a project, reopen from History, and
  confirm the **Analysis page loads live as normal AND the Generate page is pre-filled** (no
  regeneration / no token spend); delete works; a fresh (no-`projectId`) analysis is unaffected.
- **Done when:** reopening restores the workspace as "fresh load + Generate pre-filled" — closing
  the one unfinished Phase-15 acceptance criterion (§15.3 "Done when … reopen").

### 16.1 — Auth & signed-out surfaces (placeholder → shipped)
- **Depends on:** —
- **You provide:** nothing.
- **Frontend:** elevate the Phase-15 minimal surfaces to production quality. The **"Log in with
  GitHub" button** (`auth-button.tsx`) + header (`site-header.tsx`): proper GitHub mark, loading /
  signed-in / signed-out states, avatar/handle treatment, accessible labels. The **signed-out
  gate** on `repo-url-form.tsx` (login prompt + demo link) reworked into a clear, inviting CTA. The
  **demo** (`app/demo/page.tsx` + `demo-cta.tsx`): make the frozen `DEMO_PROJECT` presentation
  genuinely sell the product (first thing a stranger sees) — strong hierarchy, claim-verification
  differentiator prominent, crisp "log in to analyze your own repo" CTA. Still fully inert/static
  (no live fetch, zero tokens). Consistent with the app's card/spacing system; responsive.
- **Backend:** none (auth endpoints already correct).
- **Security:** demo stays inert static data — no live analysis/generation path reachable while
  signed out; JWT still only sent to our backend.
- **Verification:** `tsc`/`eslint` clean; you preview signed-out (Supabase configured) + the login
  round-trip; the demo reads well on mobile.
- **Done when:** a signed-out visitor sees a polished demo + an obvious, attractive login — no
  surface looks like a placeholder.

### 16.2 — Cross-cutting states, landing & responsive/a11y sweep
- **Depends on:** 16.0, 16.1
- **You provide:** nothing.
- **Frontend:** a consistency sweep across the app. Unify **loading / error / empty** treatments
  via `states.tsx` + shadcn `Skeleton`/`Empty`/`Alert` (no ad-hoc `animate-pulse` divs); polish the
  **landing page** (`app/page.tsx`) into a clean developer-tool first impression; tighten
  **evidence** + **claim-verification** display (`claim-verification-panel.tsx`) for scannability;
  a **mobile/responsive + accessibility** pass end-to-end (contrast 4.5:1, visible focus, keyboard
  nav, `aria-label`s, logical heading order, reduced-motion audit of the existing animations);
  favicon/meta/title check.
- **Backend:** none.
- **Verification:** `tsc`/`eslint` clean; you preview each state (force loading/error/empty) and do
  a desktop + mobile walkthrough, then sign off.
- **Done when:** every surface shares one loading/error/empty language, the landing reads clean,
  and the whole app is responsive + accessible. UI pass complete — ready to deploy.

### 16.3 — Abuse controls & rate-limit enforcement (turn placeholders real)
- **Depends on:** 16.2 (functionally independent, but ships with deploy)
- **You provide:** decide the production limits (defaults exist in `config.py`).
- **Backend:** wire the **placeholder caps** in `config.py` into real enforcement: the global
  `MAX_ANALYSES_PER_DAY` cap and the per-user quota (`MAX_ANALYSES_PER_SESSION` → per-`user_id`),
  backed by Supabase (survives restarts / multiple instances) rather than an in-memory counter,
  applied at the analyze/generate entry via a dependency or middleware. **Activate the GitHub App
  webhook** (deferred from 15.8) so uninstall / repo-selection changes sync live. Optional
  shared-password gate (`ACCESS_PASSWORD`). Return clear 429s with a friendly message on a cap hit.
- **Frontend:** surface a friendly "daily limit reached / quota used" state (reuse `states.tsx`).
- **Security:** quotas key on the JWT-verified `user_id` (not a spoofable session/IP); the global
  cap is the backstop against free-GitHub-account Sybil abuse; webhook stays HMAC-verified.
- **Verification:** backend suite green with the caps faked (no real Supabase in tests); you smoke
  a cap locally by lowering the limit.
- **Done when:** per-user + global spend caps are enforced from the database and the webhook is
  live.

### 16.4 — Production deploy
- **Depends on:** 16.3
- **You provide:** the §4 accounts + production env values + dashboard URL configuration.
- **Backend:** document + set production env (secrets backend-only); narrow **CORS**
  `allow_origins` in `main.py` from the localhost list to the deployed frontend origin; ensure the
  `uvicorn` start command + `/health` check for the host. Deploy to Render/Fly/Railway.
- **Frontend:** point `NEXT_PUBLIC_API_BASE_URL` at the deployed backend; set the
  `NEXT_PUBLIC_SUPABASE_*` + `NEXT_PUBLIC_GITHUB_APP_SLUG` production values; deploy to Vercel. Add
  a README **Deployment** section (hosts, env var table, "secrets never in the frontend" note) —
  values omitted.
- **Security:** only `NEXT_PUBLIC_*` values in the browser bundle; service-role key, App private
  key, webhook secret, OpenAI key backend-only; re-verify the Supabase URL-config + OAuth secret
  (the §4 login gotcha).
- **Verification:** post-deploy smoke — health check green; signed-out demo loads; login round-
  trips on the production origin; a signed-in analyze → generate → verify → save → reopen works; a
  private-repo analyze works with the App installed; caps enforced.
- **Done when:** RepoFrame is live behind controlled access, measurable, and secret-safe.

---

## 6. Global constraints (apply to every sub-phase)

- **Static checks + preview only.** `npx tsc --noEmit` + `npx eslint .` (from `frontend/`) and the
  backend suite clean after each slice; **no** `next dev`/`build` in the loop, **no** OpenAI/token
  spend, **no** live GitHub calls in tests. The user previews the frontend and signs off per slice.
- **Presentation-only for the UI movement (16.0–16.2).** No change to OpenAI calls, prompts, token
  flow, or backend generation behavior. The single exception is one bit of **client routing** (the
  reopen query param + `ProjectHydrator`) in 16.0 — which calls only the existing, tested
  `GET /api/projects/{id}`.
- **Single-source constants + reduced motion + semantic tokens + mobile-first + a11y floor** — the
  §3 rules are non-negotiable on every slice.
- **Secrets backend-only.** Only the `NEXT_PUBLIC_*` values are ever in the frontend.
- **Nothing committed unless the user asks.**
- **Non-goals:** structural rebuilds or new animations for the Analysis/Generate pages (done); new
  product features; payments/teams/orgs; non-GitHub providers; the deferred repo+commit-SHA
  analysis cache (`PHASES.md` note — a post-launch optimization).

## Definition of done (phase)

Reopening a saved analysis loads the workspace like a fresh repo-URL paste with the **Generate
page pre-filled** (no token spend); the auth/demo/saved surfaces are polished and shipped; every
surface shares one consistent, accessible, responsive language; per-user + global spend caps are
enforced from Supabase and the GitHub App webhook is live; and RepoFrame is **deployed** (frontend
on Vercel, backend on Render/Fly/Railway, DB on Supabase) with every secret backend-only and the
signed-out demo + login working on the production origin. All static checks + the offline backend
suite green; docs + comments current.
