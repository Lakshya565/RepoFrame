# RepoFrame

Frame your project around what you actually built. RepoFrame is a full-stack developer tool that turns GitHub repositories into clear, evidence-backed project writeups.

The app will analyze a repository's structure and technical signals, ask the user for project context, and generate resume bullets, README sections, portfolio blurbs, and interview talking points grounded in actual repository evidence.

## Tech Stack

- Frontend: Next.js, TypeScript, Tailwind CSS
- Backend: FastAPI, Python, Pydantic
- Planned integrations: GitHub REST API, OpenAI API, Supabase/Postgres

## Project Structure

```text
RepoFrame/
  frontend/   Next.js app
  backend/    FastAPI app
```

Current frontend structure:

```text
frontend/
  public/
  src/app/
  src/components/
    user-context-form.tsx  ← Phase 9: user context questionnaire
  src/lib/
    user-context.ts        ← Phase 9: questionnaire data shapes and field metadata
  package.json
  tsconfig.json
```

Current backend structure:

```text
backend/
  app/
    main.py
    config.py          ← Phase 8: centralized limits, API key, rate-limit placeholders
    routers/
    schemas/
    services/
      token_estimator.py  ← Phase 8: prompt budget check and token estimation
      profile_generator.py  ← Phase 10: prompt construction + OpenAI profile generation
  requirements.txt
```

## Local Development

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on the port printed by Next.js, usually `http://localhost:3000`.

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend runs at `http://127.0.0.1:8000`. Check `GET /health` to confirm it is running.

Local backend secrets live in `backend/.env`, which is ignored by Git. Copy `backend/.env.example` as a starting point. `GITHUB_TOKEN` is optional; without it RepoFrame uses GitHub's unauthenticated public API rate limit. `OPENAI_API_KEY` will be required from Phase 10 onward and must only ever appear in the backend `.env` — it is never passed to the frontend.

The frontend uses `NEXT_PUBLIC_API_BASE_URL` when set, otherwise it calls `http://127.0.0.1:8000`.

Run backend tests with:

```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest discover -s tests
```

## MVP Goals

- Accept a GitHub repository URL from the user.
- Extract repository structure and identify important files.
- Detect technical evidence such as languages, frameworks, dependencies, and notable implementation details.
- Ask the user for missing project context.
- Generate evidence-backed resume bullets, README sections, portfolio blurbs, and interview talking points.

## Current Scope

Phases 1 through 10 are implemented. The app has a landing page with a GitHub repository URL input, loading and error states, and an analysis page driven by a FastAPI backend. The backend currently exposes:

- `GET /health` — service health check.
- `POST /api/repo/parse` — normalize a GitHub URL into owner/repo.
- `POST /api/repo/metadata` — fetch public repository metadata.
- `POST /api/repo/tree` — fetch the default-branch file tree.
- `POST /api/repo/ranked-files` — deterministic filtering and ranking of important files.
- `POST /api/repo/tech-stack` — detect technologies with evidence and confidence.
- `POST /api/repo/file-contents` — fetch bounded README, config, and top source file excerpts.
- `POST /api/generate/profile` — generate a structured, evidence-backed project profile via OpenAI.
- `GET /api/github/rate-limit` — report the current GitHub REST API budget.

Phase 7 file-content fetching is intentionally bounded: it selects README, dependency/config manifests, and the top-ranked source files, then enforces a maximum number of files, a per-file character limit, and a total character limit across all excerpts. Files that are missing, oversized, non-text, or beyond the limits are returned as skipped with a clear reason, so the evidence stays small and auditable.

Phase 8 added token, cost, and abuse protection in preparation for OpenAI integration:

- All safety limits (`MAX_SELECTED_FILES`, `MAX_CHARS_PER_FILE`, `MAX_TOTAL_PROMPT_CHARS`, `MAX_FILE_SIZE_BYTES`) are now centralized in `app/config.py` and readable from environment variables.
- `OPENAI_API_KEY` is read from the backend environment only and is never exposed to the frontend.
- `app/services/token_estimator.py` provides `estimate_input_tokens()` and `check_prompt_budget()` for validating evidence size before any OpenAI call.
- Per-session, per-IP, and global daily analysis caps are defined in config with placeholder comments marking where Phase 16 rate-limiting middleware should be wired in.
- An optional `ACCESS_PASSWORD` gate is available in config for early controlled deployments.

Phase 9 added a user context questionnaire on the analysis page. It collects the project facts the repository cannot reveal — purpose, solo/team status, the user's own contribution, target user or client, hardest technical part, and optional measurable impact. Answers are held in frontend state only (no backend or database persistence yet): the form saves to a read-only summary and can be re-opened for editing. This context grounds the generation phase so RepoFrame does not guess intent, ownership, or impact.

Phase 10 added OpenAI-based project profile generation (backend only). `POST /api/generate/profile` accepts a repo URL and the user-context answers, re-runs the deterministic pipeline (metadata, tree, ranking, tech-stack, bounded file evidence), and asks OpenAI for a validated JSON profile: project name, two-sentence summary, problem, solution, detected tech stack, core features, technical highlights, user contribution, technical challenges, resume angles, and an evidence array linking claims to sources. Cost is bounded on both sides: input is capped by `MAX_TOTAL_PROMPT_CHARS` (enforced by `check_prompt_budget()` before any call) and output by `OPENAI_MAX_OUTPUT_TOKENS`. The model is set by `OPENAI_MODEL` (default `gpt-5.4-mini`, a reasoning model). The generator detects reasoning models and adjusts the request automatically: it omits `temperature` (which those models reject) and instead sends `OPENAI_REASONING_EFFORT` (default `medium`), while non-reasoning models such as `gpt-4o-mini` use `OPENAI_TEMPERATURE`. Because reasoning tokens share the output budget, `OPENAI_MAX_OUTPUT_TOKENS` defaults to 6000 to avoid truncating the JSON answer. Note that `gpt-5.4-mini` costs more per analysis than `gpt-4o-mini`; switch `OPENAI_MODEL` to `gpt-5.4-nano` or `gpt-4o-mini` for lower cost.

The OpenAI client is reused across requests (connection pooling) and built with an explicit `OPENAI_TIMEOUT_SECONDS` (default 60, versus the SDK's 10-minute default) and `OPENAI_MAX_RETRIES` (default 2, using the SDK's exponential backoff). Transport and API errors map to specific HTTP statuses (timeout → 504, rate limit → 429, auth → 500, connection → 503), a response truncated at the token limit returns a clear actionable error, and raw error detail is logged server-side rather than returned to the client. The OpenAI call lives behind an injectable completion function so the unit tests run fully offline with zero token usage. Install dependencies with `pip install -r requirements.txt` to pull in the `openai` package before using this endpoint.

Database persistence and authentication are planned but not implemented yet.
