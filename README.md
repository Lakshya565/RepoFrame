# RepoFrame

RepoFrame turns GitHub repositories into evidence-backed project writeups. It
combines deterministic repository analysis with user-provided context, then generates
resume bullets, README copy, portfolio content, LinkedIn descriptions, and interview
preparation. An optional Agentic Audit investigates whether generated claims are
actually supported.

## How it works

```text
GitHub URL
   |
   v
Metadata + tree + languages
   |
   v
Deterministic filtering, ranking, and stack detection
   |
   v
Bounded README/config/source evidence + user context
   |
   v
Structured project profile (OpenAI)
   |
   +--> Resume / README / portfolio / LinkedIn outputs
   +--> Interview preparation
   +--> Optional Evidence Investigator audit
```

Repository evidence supports technical claims. User context supports facts that code
cannot prove, such as ownership, project purpose, team role, and measurable impact.

## Stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS, Motion, Recharts
- Backend: FastAPI, Python, Pydantic, Requests
- Generation: OpenAI `gpt-5.6-luna`
- Repository access: GitHub REST API and GitHub App installation tokens
- Auth and persistence: Supabase Auth and PostgreSQL
- Hosting: Vercel frontend, Render backend, Supabase data/auth

## Architecture

```text
frontend/
  src/app/             Routes and layouts
  src/components/      Product and UI components
  src/lib/             Typed clients, providers, state, and transformations
  tests/               Focused network-boundary transformation tests

backend/
  app/routers/         Thin FastAPI HTTP/SSE adapters
  app/schemas/         Pydantic request and response contracts
  app/services/        GitHub, analysis, evidence, generation, auth, and storage logic
  tests/               Offline unit and integration tests

supabase/
  migrations/          Project and usage persistence schema
```

Important service boundaries:

- `analysis_service.py` coordinates the shared repository snapshot and caches.
- `github_service.py` owns GitHub HTTP behavior, ETags, errors, and timeouts.
- `file_ranker.py`, `tech_stack_detector.py`, and `file_content_service.py` own
  deterministic repository understanding.
- `profile_generator.py` and `output_generator.py` build model requests.
- `evidence_investigator.py` exposes safe read-only repository tools.
- `claim_verifier.py` runs the bounded investigation and structured verdict.
- `prompt_budget.py` fits evidence to the complete rendered request.
- `usage_store.py`, `rate_limit.py`, and `metrics_store.py` track and bound work.

See [PHASES.md](PHASES.md) for the implementation history and
[REPOFRAME_INTERVIEW_GUIDE.md](REPOFRAME_INTERVIEW_GUIDE.md) for a conversational
architecture walkthrough.

## Local setup

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

`backend/.env` is git-ignored. Never place backend secrets in the frontend.

Key backend settings:

| Variable | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | Optional higher public GitHub API rate limit |
| `OPENAI_API_KEY` | Required for generation and Agentic Audit |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend-only database credential |
| `GITHUB_APP_ID` | GitHub App identity |
| `GITHUB_APP_PRIVATE_KEY` or `GITHUB_APP_PRIVATE_KEY_PATH` | Signs App JWTs |
| `GITHUB_APP_WEBHOOK_SECRET` | Verifies installation webhooks |
| `CORS_ALLOW_ORIGINS` | Comma-separated allowed frontend origins |
| `MAX_LLM_CALLS_PER_USER_PER_DAY` | Per-user paid-call quota |
| `MAX_LLM_CALLS_PER_DAY` | Global paid-call quota |

The complete safe template is `backend/.env.example`.

### Frontend

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Create `frontend/.env.local` when using hosted auth/backend services:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_GITHUB_APP_SLUG=
```

These four values are intentionally browser-visible. OpenAI, Supabase service-role,
GitHub App private-key, and webhook secrets are backend-only.

If Supabase is not configured, RepoFrame keeps a public-repository local-development
flow and uses a git-ignored local token ledger. When Supabase is configured,
authentication, saved projects, private-repository access, persistent usage, and paid
call quotas become active.

## API overview

### Repository analysis

- `GET /health`
- `POST /api/repo/parse`
- `POST /api/repo/analysis/stream`
- `POST /api/repo/metadata`
- `POST /api/repo/tree`
- `POST /api/repo/ranked-files`
- `POST /api/repo/tech-stack`
- `POST /api/repo/file-contents`
- `POST /api/repo/commit-activity`
- `GET /api/github/rate-limit`

The Analysis page normally uses one progressive core stream, then starts commit
activity after the core analysis completes. The older JSON endpoints remain useful
individually and provide a deployment-skew fallback if a new frontend briefly reaches
an older backend.

### Generation and audit

- `POST /api/generate/profile`
- `POST /api/generate/outputs`
- `POST /api/generate/outputs/revise`
- `POST /api/generate/interview-prep`
- `POST /api/generate/interview-prep/revise`
- `POST /api/generate/verify`
- `POST /api/generate/verify/stream`

These routes call OpenAI only after an explicit user action. All use the shared Luna
client, rendered-request budget checks, timeouts, retries, structured validation, and
usage recording.

### Persistence and operations

- `GET/POST /api/projects`
- `GET/DELETE /api/projects/{project_id}`
- `POST /api/github/install`
- `POST /api/github/webhook`
- `GET /api/usage/total`
- `GET /api/metrics`

Project and GitHub App routes are scoped by the verified Supabase identity. Backend
usage and metrics remain available even though no developer metrics panel is shown in
the product UI.

## Performance and reliability

- Core analysis streams metadata, structure/ranking, and tech stack as each stage is ready.
- Backend caches are bounded LRUs with five-minute freshness, thirty-minute
  stale-while-revalidate behavior, and single-flight request deduplication.
- Public and private repositories use different cache scopes.
- GitHub ETags avoid downloading unchanged resources.
- GitHub App tokens stay in memory and expire before GitHub's reported deadline.
- Frontend session caches hold at most ten repositories and clear private data on sign-out.
- Commit statistics are deferred, retried when GitHub is still computing, and cached.
- The repository tree lazy-mounts and renders only expanded branches.
- The commit chart is dynamically imported.
- Each analysis card has independent loading/error behavior so one failure cannot take
  down the route.

## Validation

Offline checks:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
.\.venv\Scripts\python.exe -m pip check

cd ..\frontend
npm.cmd test
npm.cmd run lint
npm.cmd run build

cd ..
git diff --check
```

Tests use fake GitHub/OpenAI/Supabase boundaries and do not spend tokens. A production
smoke test is separate because repository tests cannot prove hosted environment values,
OAuth dashboard settings, webhook activation, or external service availability.

## Deployment

### Backend

- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check: `GET /health`
- Set `CORS_ALLOW_ORIGINS` to the deployed frontend origin.
- Configure all backend-only secrets from `backend/.env.example`.
- Apply every migration in `supabase/migrations/`.

### Frontend

- Set `NEXT_PUBLIC_API_BASE_URL` to the deployed backend.
- Set the public Supabase URL/key and GitHub App slug.
- Deploy the `frontend` directory to Vercel.

### External dashboard checks

- Supabase Site URL and redirect allowlist include the production frontend.
- Supabase's GitHub provider has the current OAuth client ID and secret.
- The GitHub App Setup URL points to `/github/installed`.
- The GitHub App webhook points to `/api/github/webhook` and uses the configured secret.
- A signed-in user can analyze, generate, audit, save, reopen, and access an authorized
  private repository.
