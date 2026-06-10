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
  src/lib/
  package.json
  tsconfig.json
```

Current backend structure:

```text
backend/
  app/
    main.py
    routers/
    schemas/
    services/
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

Local backend secrets live in `backend/.env`, which is ignored by Git. `GITHUB_TOKEN` is optional for public repository metadata fetching. Without it, RepoFrame uses GitHub's unauthenticated public API rate limit.

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

Phase 3 is implemented. The app has a landing page with a GitHub repository URL input, a FastAPI backend health endpoint, backend repository URL parsing, public GitHub repository metadata fetching, loading and error states, and an analysis page that displays a repository summary card.

OpenAI generation, database persistence, and authentication are planned but not implemented yet.
