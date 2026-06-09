# RepoFrame Agent Instructions

Write clean, readable, maintainable code. Prefer simple architecture over clever abstractions, and avoid overengineering unless the project clearly needs it.

## Project Boundaries

- `frontend/` contains the Next.js, TypeScript, and Tailwind application.
- `backend/` contains the FastAPI and Python backend.
- Do not add GitHub API, OpenAI API, database, or authentication logic unless the task explicitly asks for it.
- Keep frontend, backend, data processing, models, and utility logic separated by responsibility.

## Frontend Conventions

- Use TypeScript and avoid `any` unless there is a strong reason.
- Keep components small and focused.
- Add basic loading, error, and empty states for user-facing flows.
- Keep UI modern, minimal, and developer-tool focused.
- Follow `frontend/AGENTS.md` before changing Next.js code.

## Backend Conventions

- Use typed Python and Pydantic models for request, response, and domain data.
- Keep route handlers thin; move parsing, ranking, and generation logic into services or helpers.
- Add basic validation and clear error handling.
- Keep integration clients isolated from core business logic.

## Documentation

- Update the README when setup steps, project structure, or major behavior changes.
- Keep examples current with the actual scripts and package layout.
