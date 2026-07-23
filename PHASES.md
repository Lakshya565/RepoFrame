# RepoFrame Build History

This is the final source of truth for what was implemented in RepoFrame. It is a
retrospective, not a backlog: every phase below describes shipped repository
behavior. Superseded prompts and abandoned proposals are intentionally excluded.

For current setup and deployment instructions, see `README.md`. For a conversational
architecture and interview walkthrough, see `REPOFRAME_INTERVIEW_GUIDE.md`.

## Current product

RepoFrame turns a GitHub repository and user-provided project context into:

- A structured, evidence-backed project profile.
- Resume bullets, a README introduction, a portfolio blurb, and a LinkedIn description.
- Interview-preparation questions and talking points.
- An optional Agentic Audit that checks generated claims against repository evidence
  and user context.

The product is split into three deployed tiers:

```text
Next.js frontend (Vercel)
        |
        | typed HTTP + server-sent events
        v
FastAPI backend (Render)
        |
        +-- GitHub REST API / GitHub App installation tokens
        +-- OpenAI API (gpt-5.6-luna)
        +-- Supabase Auth + PostgreSQL persistence
```

The architecture deliberately separates GitHub access, parsing, ranking, stack
detection, evidence collection, prompt construction, model calls, persistence, and
rendering. API routes remain thin while services own product logic.

---

## Phase 1 — Basic frontend flow

Built the initial Next.js application with a landing page, GitHub repository input,
loading and error states, and a placeholder analysis route.

Key decision: establish the user journey before integrating external services. This
made later API work fit an already-understood flow instead of defining the product
through backend endpoints.

## Phase 2 — FastAPI foundation and repository URL parsing

Added the FastAPI backend, `GET /health`, CORS configuration, and a Pydantic-validated
repository parser. URL normalization moved to the backend so every later feature uses
one canonical `owner/repo` identity.

Key decision: keep parsing and validation server-side rather than duplicating rules in
React. The frontend handles form state; the backend owns repository identity.

## Phase 3 — GitHub metadata

Added GitHub REST API access for repository name, description, default branch, stars,
forks, primary language, topics, license, and canonical URL. The frontend gained a
typed repository summary card with isolated loading and error behavior.

Key decision: wrap GitHub in a service instead of calling it directly from route
handlers. This supports private-repository credentials, ETags, caching, and offline
tests without changing the API surface.

## Phase 4 — Repository structure

Added recursive default-branch tree fetching and normalized file entries. The analysis
interface renders the flat GitHub response as an expandable repository tree.

Key decision: fetch structure before contents. File paths are cheap, useful evidence
on their own, and provide the input needed to decide which files are worth reading.

## Phase 5 — Deterministic file filtering and ranking

Added deterministic filters for dependencies, generated output, lockfiles, binaries,
media, and oversized files. Important files receive explainable scores based on their
role: README files, manifests, configuration, routes, schemas, components, services,
entry points, and representative source.

Key decision: rank without an LLM. The selection is fast, reproducible, testable, and
free; model calls are reserved for synthesis that actually benefits from them.

## Phase 6 — Evidence-backed technology detection

Added technology detection using repository metadata, GitHub language totals, file
paths, manifests, configuration files, and README evidence. Each technology includes
a category, confidence score, and source evidence.

Key decision: never treat one signal as proof. Package declarations, configuration,
language totals, and file patterns reinforce one another and make the result easier to
explain than a guessed stack label.

## Phase 7 — Bounded file evidence

Added controlled text-file reads for README content, manifests/configuration, and
top-ranked source files. Collection enforces:

- A maximum number of selected files.
- A per-file character limit.
- A total evidence-character limit.
- A pre-download file-size limit.
- Explicit skip reasons for missing, binary, oversized, lower-priority, or failed files.

Key decision: evidence is selected, not scraped wholesale. That protects GitHub rate
limits, keeps prompts auditable, and prevents a large repository from turning into an
unbounded model request.

## Phase 8 — Prompt, token, and request safety

Centralized evidence limits and OpenAI request settings in backend configuration.
Added conservative token estimation, complete-request budget checks, output-token
limits, timeouts, retries, and backend-only secret handling.

Key decision: enforce cost and size limits before paid work. The approximate estimator
helps communicate request size, while the rendered-character budget is the actual hard
guard and does not depend on a model-specific tokenizer.

## Phase 9 — User context

Added the project questionnaire for facts code cannot prove: purpose, team context,
personal contribution, target users, hardest technical work, and measurable impact.
The frontend stores a reviewed context snapshot and allows later edits.

Key decision: repository evidence and human context are different evidence classes.
RepoFrame should not infer ownership, intent, business impact, or team roles from code.

## Phase 10 — Structured project profile generation

Added OpenAI-backed project-profile generation. The backend reconstructs the
deterministic repository evidence, fits it to the rendered request, calls the model,
validates structured JSON through Pydantic, and returns evidence links alongside the
profile.

The profile captures the project summary, problem, solution, stack, features,
technical highlights, contribution, challenges, resume angles, and source mappings.

Key decision: generate a reusable profile before writing channel-specific copy. This
creates one grounded source for every later output and avoids repeatedly sending raw
repository evidence.

## Phase 11 — Generated outputs and interview preparation

Added:

- Resume bullets.
- README introduction.
- Portfolio blurb.
- LinkedIn description.
- Interview-preparation questions and talking points.
- Per-section generation and revision using the current edited draft.
- Optional guidance fields and copy controls.
- A global in-flight generation lock.

Generation remains button-triggered. A profile is reused until user context changes,
and each output can be regenerated without overwriting unrelated sections.

Key decision: give users granular control over paid work. Nothing generates on page
load, and revising one section does not pay to recreate the rest.

## Phase 12 — Evidence Investigator and token accounting

The original verifier evolved into the Evidence Investigator behind the Agentic Audit.
It is a bounded tool-using loop, not a single model judgment.

The investigator receives strong initial evidence and may use three read-only tools:

- `search_repository` to find relevant allowlisted paths.
- `read_repository_file` to inspect a specific safe text file.
- `search_evidence` to search accumulated excerpts.

It cannot execute code, write files, traverse outside the repository, fetch arbitrary
URLs, or read binary/oversized content. Model turns, tool calls, extra files, extra
characters, and total prompt size are all capped. The final turn is reserved for a
tool-free structured verdict.

Claims are labeled `supported`, `partially_supported`, `needs_user_confirmation`, or
`unsupported`. The result includes the investigation's model-call count, tool-call
count, and additional files inspected.

Real prompt, completion, reasoning, and total tokens are recorded. Local development
uses a git-ignored JSON ledger; configured deployments use Supabase and track actual
model calls so a multi-turn audit is not undercounted.

Key decision: an agent should be allowed to investigate gaps, but only inside a narrow,
auditable capability boundary.

## Phase 13 — Operational and claim-quality metrics

Added backend counters for repository analysis, files scanned and selected, outputs
generated, verification results by status, request/error counts, and backend/LLM
latency. `GET /api/metrics` exposes the in-memory snapshot, while
`GET /api/usage/total` exposes persistent token totals.

The frontend developer-tools panel was later removed because it distracted from the
product and model-specific token analysis had become less useful. Backend accounting
remains active for spend enforcement and project statistics.

Key decision: operational instrumentation and product UI are separate concerns.
Removing a dashboard should not remove the measurements needed to run the system.

## Phase 14 — Product UI and interaction system

Reworked the functional interface into a cohesive developer-tool experience:

- Analysis overview, stack evidence, ranked files, interactive tree, and commit chart.
- Generate-page stepper and output workspace.
- Evidence and Agentic Audit presentation.
- Shared cards, buttons, badges, skeletons, empty states, and errors.
- Light/dark theming, typography, motion, reduced-motion behavior, and responsive layouts.
- Decorative icon cloud, marquees, transitions, and micro-interactions.

Key decision: keep business logic outside visual components. UI modules render typed
resources and call frontend clients; they do not reimplement ranking, evidence, or
generation rules.

## Phase 15 — Authentication, persistence, and private repositories

Added Supabase authentication and storage for saved project snapshots. Projects are
always scoped by the verified user ID in backend queries. A saved project contains
metadata, user context, profile, outputs, interview prep, guidance, and audit results.

Added GitHub OAuth through Supabase for identity and a separate GitHub App for
fine-grained repository access. The App uses short-lived installation tokens, supports
selected repositories, verifies installation ownership, and provides an HMAC-verified
webhook handler for installation changes.

Key decisions:

- Use OAuth for identity and a GitHub App for repository authorization; they solve
  different problems.
- Keep service-role and App secrets backend-only.
- Scope every database operation in code even with Row Level Security as defense in depth.
- Never persist installation tokens.

## Phase 16 — Launch readiness

### Reopen and saved-project workflow

Added project hydration through a `projectId` query parameter. Reopening a project
still performs a live repository analysis, while the Generate workspace is restored
from the saved snapshot without spending tokens. Autosave uses snapshot signatures so
an unchanged reopen does not immediately rewrite the record.

Saved projects, History, duplicate-repository detection, and recent-project shortcuts
are now permanent signed-in features rather than environment-gated previews.

### Authentication, demo, and cross-cutting polish

Completed the signed-out login flow, frozen demo experience, saved-project states,
responsive behavior, accessibility details, loading/error/empty consistency, and
production-oriented metadata and navigation.

### Spend controls and deployment boundaries

Added Supabase-backed per-user and global daily model-call quotas. Every successful
turn in the investigator counts toward the quota. Configured production analysis and
generation require authentication, while the signed-out demo repository has a narrow
read-only exception and never exposes a generation path.

The repository contains the intended deployment split and configuration for Vercel,
Render, and Supabase. It also contains the verified webhook handler and secret
boundaries. The repository cannot prove external dashboard settings, currently
deployed environment values, or webhook activation; those remain operational checks.

---

## Post-launch hardening

These improvements were completed after the numbered phase work and are part of the
current product:

### One model contract

All generation and agentic work is pinned to `gpt-5.6-luna`. Structured and tool-free
calls use the configured reasoning effort. Function-tool turns use
`reasoning_effort="none"` because the Chat Completions endpoint rejects function tools
combined with reasoning effort for this request shape.

### Request-aware prompt fitting

Evidence is fitted against the complete rendered request, including system
instructions, user context, generated content, serialization, and tool schemas.
Higher-ranked evidence stays first, partial final excerpts are marked truncated, and
omitted files receive explicit prompt-budget skip reasons. Tool results are also
shortened against remaining conversation headroom. A final hard guard still rejects
oversized non-evidence context before any paid request.

### Progressive analysis and caching

The Analysis page moved from independent duplicate requests to one progressive core
stream followed by deferred commit activity. The backend:

- Resolves repository access once.
- Reuses one GitHub HTTP session per analysis build.
- Fetches metadata/tree once and shares the snapshot with ranking and stack detection.
- Keeps bounded process-memory LRU caches.
- Serves five-minute fresh entries and stale-while-revalidates up to thirty minutes.
- Deduplicates concurrent builds with single-flight coordination.
- Separates public and user/installation-scoped private cache keys.
- Revalidates GitHub resources with ETags.
- Caches installation tokens only until shortly before expiry.

The frontend keeps at most ten session repositories, deduplicates in-flight work,
preserves analysis across tab switches, clears private cache state on sign-out, lazy
mounts the tree, renders only expanded branches, and dynamically loads the commit
chart. A best-effort health warm-up begins when the repository input receives focus.

The JSON endpoint fallback remains intentionally available when a newly deployed
frontend temporarily reaches an older backend without the stream route.

### Commit activity reliability

One GitHub commit-statistics request supplies bundled 1M daily and 1Y weekly
timelines. Commit work starts after core analysis so GitHub's slower lazy statistics
endpoint does not compete with metadata and structure. The frontend validates the
network response, retries temporary 503 computation states, caches the result for the
session, guards every render access, and isolates card failures from the page.

### Documentation and cleanup

Retired feature flags, unused configuration placeholders, the former single-range
commit adapter, duplicated frontend HTTP helpers, stale phase comments, and
superseded planning documents were removed. Exact dependency pins and all backend
usage/metrics capabilities were preserved.

---

## Current validation snapshot

The cleanup baseline on 2026-07-23 was:

- Backend: 229 tests and 21 subtests passing.
- Frontend: 5 focused tests passing.
- Frontend ESLint passing.
- Next.js production build and TypeScript validation passing.

Validation is intentionally offline. Tests inject fake GitHub/OpenAI behavior and do
not call OpenAI, GitHub, Supabase, or deployed services. Live deployment behavior must
still be verified separately through operational smoke tests.

## Final product boundaries

- GitHub repositories only.
- Generation and Agentic Audit are explicit user actions.
- Repository evidence supports technical claims; user context supports personal claims.
- No arbitrary repository code execution.
- No frontend access to backend secrets.
- No payments, teams, organization roles, or multi-provider repository support.
- Process-memory caches improve one backend instance but are not shared across replicas.
