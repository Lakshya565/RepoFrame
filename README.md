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
  backend/    FastAPI app dependencies and future backend source
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

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Backend source files have not been added yet. Once the FastAPI app exists, run it with a command like:

```bash
uvicorn app.main:app --reload
```

## MVP Goals

- Accept a GitHub repository URL from the user.
- Extract repository structure and identify important files.
- Detect technical evidence such as languages, frameworks, dependencies, and notable implementation details.
- Ask the user for missing project context.
- Generate evidence-backed resume bullets, README sections, portfolio blurbs, and interview talking points.

## Current Scope

Phase 1 is implemented on the frontend. The app has a landing page with a GitHub repository URL input, client-side URL validation, loading and error states, and a placeholder analysis page that displays the parsed repository owner and name.

GitHub API access, OpenAI generation, database persistence, and authentication are planned but not implemented yet.
