# RepoFrame Project Phases 
- Skip all phases that say (DONE, DO NOT TOUCH)
- Reminder - Consult AGENTS.md for best coding practices, workflows, and the way I want to implement things. Remember to comment out code for readability and understanding purposes, and update any stale code/comments as required.
---

# Phase 1(DONE, DO NOT TOUCH): Basic Frontend Flow

## Goal

Make the app feel real before connecting APIs.

## Build

```text
Landing page
GitHub repo URL input
Basic URL validation
Loading state
Error state
Placeholder analysis result page
```

## Codex Prompt

```text
Build the initial frontend flow for RepoFrame. Add a polished landing page with the product name, tagline, GitHub repo URL input, and a simple “How it works” section(which should just be telling the user to clone their repo using the https web url). Add client-side validation for GitHub repo URLs in the format https://github.com/{owner}/{repo}. On valid submission, navigate to a placeholder analysis page showing the parsed owner and repo. Do not call the backend yet. NOTE - these pages will be changed in the future, so just do a very basic structure that can easily be adapted/replaced. I want to expose it on localhost, so once you're finished, provide all the steps to spin up the frontend.
```

---

# Phase 2(DONE< DO NOT TOUCH): Backend Health and Repo URL Parsing

## Goal

Connect the frontend to FastAPI for the first time.

## Build

```text
GET /health
POST /api/repo/parse
Pydantic request/response models
CORS from frontend
Frontend calls backend
```

## Codex Prompt

```text
Implement a FastAPI endpoint for parsing GitHub repo URLs. This will REPLACE the current frontend system, we need to have all this done through the backend rather than the frontend, so please get rid of redundant frontend code that will now be replaced. Do not hallucinate values, and ask me for all example code you would like to include. Add POST /api/repo/parse that accepts a repoUrl string and returns owner, repo, and normalizedUrl.  Use Pydantic models for request and response validation. Add error handling for invalid GitHub URLs. Connect the frontend repo input form to this backend endpoint and display the parsed result.
```

---

# Phase 3(DONE, DO NOT TOUCH): GitHub Metadata Fetching

## Goal

Fetch real public repo data.

## Build

```text
GitHub API service
Fetch repo name, description, default branch, stars, primary language
Backend endpoint: POST /api/repo/metadata
Frontend repo summary card
```

## Codex Prompt

```text
Implement GitHub public repo metadata fetching in the FastAPI backend. Add a GitHub service that fetches repo name, description, default branch, stars, forks, language, and HTML URL using the GitHub REST API. Add a POST /api/repo/metadata endpoint that accepts a repo URL, parses it, fetches metadata, and returns a typed response. Connect the frontend to display this metadata in a RepoSummaryCard. Include loading and error states, as well as all edge cases - account for this and make the RepoSummaryCard dynamically sized based on the number of outputs from the GitHub API. 
```

---

# Phase 4(DONE, DO NOT TOUCH): File Tree Fetching

## Goal

Pull the repo structure.

## Build

```text
Fetch recursive file tree
Normalize file paths
Return file list
Display top-level structure in UI
Create a simple text-based tree view
Keep the tree view component flexible for a future interactive version
```

## Codex Prompt

```text
Add GitHub file tree fetching. Use the repo default branch to fetch the recursive file tree from the GitHub API. Return normalized RepoFile objects with path, type, size if available, and URL if available. Add a backend endpoint POST /api/repo/tree. Display the fetched file tree summary in the frontend, including total files.

Create a dedicated but dynamic view for the tree, because later I want to replace it with a more interactive tree view. For now, keep it simple and text-based. Do not focus too much on advanced visualization yet.

Do not try to access metadata for the contents of the files themselves. Only use the structure returned by GitHub's API.
```

---

# Phase 5(DONE, DO NOT TOUCH): File Filtering and Ranking

## Goal

Make the project smart before adding AI.

## Build

```text
filter_repo_files()
rank_important_files()
Ignore generated/dependency files
Prioritize README, config files, source files, routes, components
Show top ranked files
Return ranking reasons
```

## Codex Prompt

```text
Implement repo file filtering and ranking logic in the backend. Add utilities filter_repo_files and rank_important_files. Prioritize README files, package/config files, src/app/pages/components/api/routes/models/schema files, and main entry points. Filter out dependency folders, build outputs, generated files, lock files, binaries, images, and oversized files. Return the top-ranked files with importance scores and reasons. Display them in the frontend.

Keep the logic deterministic for now. Do not use OpenAI or any LLM calls in this phase.
```

---

# Phase 6(DONE, DO NOT TOUCH): Tech Stack Detection

## Goal

Detect what the project uses.

## Build

```text
detect_tech_stack()
package.json parsing
requirements.txt parsing
file pattern detection
Frontend display
Detected stack evidence
```

## Codex Prompt

```text
Implement tech stack detection in the backend. Use repository metadata, file paths, package.json if available, requirements.txt if available, and config files to detect technologies such as React, Next.js, TypeScript, Python, FastAPI, Flask, Node, Express, Tailwind, Supabase, PostgreSQL, SQLite, Pandas, OpenCV, and other common tools. This is not a comprehensive list, so try to detect any and all technologies. Return detected technologies with confidence and evidence. Display the detected stack in the frontend in its own card. A cool feature, if possible, would be to have each tool's logo next to it at the same size as the text, but it's ok if you can't do that just yet. 

Each detected technology should include a short reason or evidence source, such as package.json, requirements.txt, file extension patterns, or config files(note - since you have the list of important files in the repo from Phase 5, you should ONLY use those files for your evidence gathering). You can make this like a little bubble(s) next to each entry in the stack. If the README already says what technologies were used, start with that but make sure you have at least one more source of evidence backing that up from anywhere else in the important files.
```

---

# Phase 7(DONE, DO NOT TOUCH): Fetch Selected File Contents

## Goal

Gather enough repo evidence for the AI step without fetching too much.

## Build

```text
Fetch README
Fetch config files
Fetch top-ranked source files
Set file size limits
Set total content limits
Store excerpts
Handle rate limits
Handle missing README files
```

## Codex Prompt

```text
Implement selected file content fetching. Add backend logic to fetch README, package/config files, and the top-ranked source files from GitHub with strict size limits. Return file path, content excerpt, source type, and reason for selection. Do not fetch entire large repos. Add clear handling for missing README files, oversized files, and GitHub rate limits.

Add basic safety limits:
- max number of selected files
- max characters per file
- max total characters across all fetched content
- clear skipped-file reasons

Do not add OpenAI calls yet. This phase should only prepare safe, bounded repo evidence.
```

---

# Phase 8(DONE, DO NOT TOUCH): Token, Cost, and Abuse Protection

## Goal

Prevent people from burning API credits once the app is deployed.

## Build

```text
Backend-only API keys
.env setup
Token/input size budgeting
Request size limits
Daily/global request limit placeholder
Basic usage estimation
Optional password gate placeholder
```

## Codex Prompt

```text
Add basic token, cost, and abuse protection before any OpenAI integration. Make sure API keys are only read from backend environment variables and are never exposed to the frontend. Add backend constants or config values for maximum selected files, maximum characters per file, maximum total prompt characters, and maximum requests per session or IP placeholder.

Add a simple utility to estimate input size before sending content to OpenAI. If the repo evidence is too large, return a clear error or trim the evidence safely. Add comments explaining where future rate limiting, auth, or usage caps should be integrated.

Do not implement paid billing or full auth yet. The goal is to make the OpenAI integration safe enough for a controlled deployment.
```

---

# Phase 9: User Context Questionnaire

## Goal

Fill in what the repo cannot know.

## Build

```text
Project purpose
Solo/team
User contribution
Target user/client
Hardest technical part
Impact/result
Editable answers
Frontend state only for now
```

## Codex Prompt

```text
Add a user context questionnaire to the frontend. Ask for project purpose, solo/team status, user contribution, target user or client, hardest technical part, and measurable impact if available. Store the answers in frontend state for now. Make the form clean, concise, and easy to edit. Do not add database persistence yet.

Make it clear that these answers are used to prevent RepoFrame from guessing things that cannot be inferred from the repo alone.
```

---

# Phase 10: OpenAI Project Profile Generation

## Goal

Generate the first structured project profile.

## Build

```text
OpenAI API integration
Backend-only .env key
Structured JSON output
Project profile model
Evidence-aware generation
Backend endpoint: POST /api/generate/profile
```

## Codex Prompt

```text
Add OpenAI-based project profile generation in the FastAPI backend. Create a service that combines repo metadata, detected tech stack, selected file evidence, and user context into a structured prompt. The model should return a validated JSON project profile with projectName, twoSentenceSummary, problem, solution, detectedTechStack, coreFeatures, technicalHighlights, userContribution, technicalChallenges, resumeAngles, and evidence.

Use environment variables for the OpenAI API key. Do not expose secrets to the frontend. Respect the token/input limits created earlier. The output should be grounded in the selected repo evidence and user-provided context.

Do not generate final resume bullets or interview talking points yet. This phase should only generate the structured project profile.
```

---

# Phase 11: Generate Core Output Tabs

## Goal

Make the app useful without wasting tokens.

## Build

```text
Resume bullets
README intro
LinkedIn/project description
Portfolio blurb
Evidence panel
Copy buttons
Edit mode
Regenerate option
Optional interview prep button
```

## Codex Prompt

```text
Implement generated output tabs in the frontend and backend. Add a backend endpoint that takes a structured project profile and generates core outputs:
- resume bullets
- README intro
- portfolio blurb
- LinkedIn-style project description

Do not generate interview talking points by default. Add a separate frontend button or tab action that lets the user choose whether they want interview talking points. Only call the backend for interview prep if the user explicitly requests it.

In the frontend, display outputs in clean tabs with copy buttons. Add an EvidencePanel that shows supporting files or user context for major claims. Add simple edit mode so users can revise generated text directly. Add a regenerate option, but keep it scoped to one output section at a time.
```

---

# Phase 12(DONE, DO NOT TOUCH): Agentic Claim Verification + Token Metering

## Goal

Add a bounded agentic workflow that verifies generated claims against repo
evidence, and make token spend visible (per-analysis and lifetime) before the
agentic loop multiplies it. The token-usage slice of Phase 13 is intentionally
pulled forward here (see Phase 13 note below).

## Build

```text
--- Token metering (pulled forward from Phase 13) ---
Capture real usage (prompt/completion/reasoning/total) at the LLM chokepoint
Per-analysis usage total returned by every generate + verify endpoint
Per-repo session token meter in the frontend, with per-step breakdown
Lifetime persistent token ledger: JSON file + GET /api/usage/total + UI badge
(No dollar/cost estimate — explicitly descoped)

--- Agentic claim verification ---
Bounded tool-calling agent (loop with hard caps, not single-pass)
Tools scoped to already-selected evidence only: search_evidence, read_evidence_file
Supported / partially_supported / needs_user_confirmation / unsupported labels
User-context checks
Structured verification JSON
Opt-in only ("Verify claims" button; never auto-runs)
Frontend claim status display near the EvidencePanel
```

## Codex Prompt

```text
Implement Phase 12 in this order:

1. Token-metering foundation. Capture real OpenAI usage at the single LLM
   chokepoint (llm_client). Add prompt/completion/reasoning/total token fields to
   CompletionResult, populated from response.usage. Keep llm_client side-effect
   free (it reports usage, never writes files) so the injected-fake tests stay
   offline and zero-token.

2. Per-analysis usage meter. Aggregate usage across all calls in one analysis and
   return it from every generate + verify endpoint. Show a running per-repo
   session total in the frontend with a per-step breakdown.

3. Lifetime persistent ledger. Add a usage_store service backed by a single JSON
   file (atomic writes, configurable path), incremented once per analysis at the
   route layer (not in llm_client). Add GET /api/usage/total and a small lifetime
   badge in the UI. Gitignore the data file. Document it as a stopgap to be
   replaced by Supabase in Phase 15 behind the same interface. No dollar cost.

4. Bounded agentic claim verification. Add POST /api/generate/verify taking the
   repo URL, user context, and the generated outputs. Re-run the deterministic
   pipeline to rebuild the already-selected evidence bundle, then run a bounded
   tool-calling agent over it. The agent reviews generated claims from resume
   bullets, README intro, portfolio blurb, and LinkedIn-style description. For
   each claim return: claim, status (supported, partially_supported,
   needs_user_confirmation, unsupported), supportingEvidence, explanation,
   suggestedRevision if needed.

Keep the agent bounded and safe:
- it may only use already-selected repo evidence and user context
- tools (search_evidence, read_evidence_file) query in-memory evidence only;
  it must not fetch new files or run repo code
- hard caps on iterations and tool calls (config), plus the existing prompt
  budget gate per call
- structured JSON output
- verification is opt-in: it runs only on an explicit "Verify claims" button and
  never as part of the default/Generate-all flow, so it can't spend tokens
  without a deliberate click

Add a new tool-calling path in the LLM layer (complete_with_tools) that accepts a
growing message list + tool schemas, captures usage on every iteration, and stays
injectable so the loop is tested offline with a scripted fake (call -> tool ->
final). Display claim verification results near the EvidencePanel / under each
generated output. This should make RepoFrame feel like an agentic repo analysis
tool, not just a generic AI writing app.
```

---

# Phase 13(DONE, DO NOT TOUCH): Usage Metrics and System Metrics

> Note: token usage tracking (real per-analysis usage + a persistent lifetime
> token ledger) was pulled forward into Phase 12. Phase 13 now covers the
> remaining non-token metrics. The dollar/cost estimate was descoped entirely.

## Goal

Track the remaining real numbers for deployment, resume bullets, and debugging —
the operational and claim-quality metrics not already captured by Phase 12's
token meter.

## Build

```text
Repos analyzed
Files scanned
Files selected
Claims generated
Claims verified
Supported vs unsupported claims
LLM latency
Backend latency
Error counts
(Token usage already handled in Phase 12; no dollar cost estimate)
```

## Codex Prompt

```text
Add basic usage and system metrics tracking, building on the token metering
already implemented in Phase 12 (do not re-implement token capture). Track the
remaining metrics: repos analyzed, total files scanned, selected evidence files,
generated claims, verified claims, supported/unsupported claim counts, LLM
latency, backend latency, and error counts.

For now, keep the implementation simple. Store metrics in memory, local logs, or a
lightweight structure that can later be moved to Supabase (mirroring the Phase 12
usage_store stopgap approach). Do not add a complex analytics dashboard yet, and
do not add a dollar cost estimate. Add a simple backend endpoint or developer-only
view that exposes recent metrics for debugging and future resume/project
reporting.
```

---

# Phase 14: Polish the MVP

## Goal

Make the app demoable.

> Note: more UI ideas are coming from the user — this section will be expanded
> before Phase 14 is built.

## Add

```text
Better loading states
Better error states
Empty states
Mobile layout
Consistent styling
Clean landing page
Demo repo examples
Subtle animations
Better evidence display
Better claim verification display
README screenshots
Developer metrics panel (floating button → metrics drawer)
```

## Codex Prompt

```text
Polish the RepoFrame MVP. Improve loading, error, and empty states across the frontend. Make the UI feel like a clean developer tool, not a generic AI app. Add example repo cards on the landing page, improve spacing and typography, and make the analysis flow easy to demo in under 60 seconds. Add a mobile layout so the website is viewable on mobile devices as well as computers(essentially, the design should be dynamically resizable).

Add subtle animations only where they improve clarity, such as loading states, tab transitions, collapsible evidence cards, or analysis progress steps. Do not add distracting animations or major new features.
```

## Developer metrics panel (moved here from Phase 13 discussion)

A small, self-contained UI surface for the metrics the backend already records.
Deferred from Phase 13 into Phase 14 so it lands with the rest of the UI work.

```text
- A small fixed button in the bottom-right corner opens a slide-in metrics drawer.
- Pure frontend + read-only: it fetches the existing zero-cost GET endpoints
  GET /api/usage/total (lifetime tokens) and GET /api/metrics (counters + latency).
  It spends no tokens and the backend stays the single source of truth — the panel
  only displays; all recording keeps happening backend-side as it does now.
- Show, grouped: Tokens (lifetime: prompt/completion/reasoning/total + runs);
  Activity (repos analyzed, files scanned/selected, outputs generated); Claim
  quality (verified + supported/partial/needs-confirmation/unsupported); Reliability
  (requests, errors → error rate, LLM latency avg/max, backend latency avg/max).
- Label scope honestly: token totals are persistent/lifetime; the system metrics
  are in-memory and reset on backend restart ("since restart"), so label them so.
- Gate visibility behind a NEXT_PUBLIC_SHOW_METRICS env flag: these metrics are
  backend-GLOBAL (not per-user), so the panel is on for local/dev and can be hidden
  in public builds until per-user metrics + auth exist (Phase 15+).
- Reuse existing card styling; ~2 components (floating button + drawer) and one new
  api helper (fetchMetrics; fetchLifetimeUsage already exists).
```

---

# Phase 15: Save Projects with Supabase + GitHub Auth (App) & Private Repos

Only do this after the local MVP works.

> **Scope updated 2026-07-05.** Auth is now IN for Phase 15: GitHub login for accounts
> and, via a **GitHub App** (not the broad OAuth `repo` scope), fine-grained, read-only,
> per-repo access so users can analyze their **private** repos. The full, structured,
> sub-phased build plan — including exactly what I must register/provide, the env vars,
> the security model, and per-sub-phase tests — lives in **`PHASE_15_PLAN.md`**. Build
> from that document, sub-phase by sub-phase (15.0 → 15.8).

## Build

```text
Supabase setup (projects, generated_outputs, claim_verifications, usage_metrics,
  user_installations tables; RLS on)
Identity via Supabase Auth GitHub OAuth (identity scopes only) -> real user_id
Repo access via a GitHub App (Contents+Metadata read-only) with per-repo install
  selection (all / public-only / selected); EPHEMERAL installation tokens, none stored
save/load project snapshots + auto-save
session history + a saved projects page
thread installation tokens through the GitHub service for private-repo analysis
migrate the lifetime usage ledger into Supabase behind its existing interface
```

## Codex Prompt

```text
Implement Phase 15 by following PHASE_15_PLAN.md one sub-phase at a time (15.0 -> 15.8),
verifying each before the next.

Add Supabase persistence for saved project snapshots (repo metadata, user context,
project profile, generated outputs, claim verifications, usage). Add accounts: identity
via Supabase Auth's GitHub OAuth provider (identity scopes only) giving a real user_id;
repo access via a separate GitHub App with read-only Contents+Metadata permission, so a
user installs it on all or selected repositories (public and/or private). Mint short-lived
installation tokens per request and NEVER store a repo token; store only the
user<->installation mapping (verified by ownership). Verify the Supabase JWT on the backend,
scope every row by user_id, and turn RLS on. Add a saved projects page + History tab that
list and reopen saved analyses.

Security is first-class: least-privilege read-only App, ephemeral tokens, private key and
all secrets backend-only (only the Supabase URL + anon key are public), webhook signature
verification, and strict per-user isolation. Keep the signed-out public-repo flow working
exactly as today. Do not add payments, teams, or complex permissions. Keep every test
offline and zero-token (fake repos, fake HTTP client, crafted JWTs).
```

---

# Phase 16: Deployment

## Goal

Get it online with controlled access and measurable usage.

## Deploy

```text
Frontend: Vercel
Backend: Render, Fly.io, or Railway
Database: Supabase
```

## Environment Variables

```text
OPENAI_API_KEY
GITHUB_TOKEN optional but useful
BACKEND_URL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY only backend-side if needed
MAX_SELECTED_FILES
MAX_CHARS_PER_FILE
MAX_TOTAL_PROMPT_CHARS
MAX_ANALYSES_PER_DAY
```

## Codex Prompt

```text
Prepare RepoFrame for controlled deployment. Add production environment variable documentation, deployment instructions for the frontend and backend, and clear notes about backend-only secrets. Make sure the frontend uses the deployed backend URL through an environment variable.

Add or document basic controlled-access protections such as request limits, optional password gate placeholder, and daily analysis cap. Do not expose OpenAI or GitHub tokens to the frontend. Do not deploy automatically.
```

---

# Updated Recommended Build Order

```text
1. Frontend input flow
2. Backend URL parser
3. GitHub metadata
4. GitHub file tree
5. File filtering/ranking
6. Tech stack detection
7. Selected file content fetching
8. Token, cost, and abuse protection
9. User context questionnaire
10. Project profile generation
11. Core output tabs + optional interview prep
12. Agentic claim verification
13. Usage metrics and cost tracking
14. UI polish
15. Supabase save/load
16. Deployment
```

# Codex Usage Rule

Do not tell Codex:

```text
Build the full app.
```

Tell it one exact feature, verify it, then move on.

Codex should not commit anything unless explicitly asked.
