# RepoFrame Agent Instructions

## Project goal

RepoFrame is a full-stack developer tool that turns GitHub repositories into clear, evidence-backed project writeups. The app should analyze repo structure, README content, config files, selected source files, and user-provided context to generate resume bullets, README sections, portfolio blurbs, and interview talking points.

The core differentiator is evidence-backed generation. Important claims should connect back to repo evidence, such as file paths, README sections, config files, source snippets, or user-provided context.

## Tech stack

- Frontend: Next.js, TypeScript, Tailwind CSS
- Backend: FastAPI, Python, Pydantic
- Future database/auth: Supabase, PostgreSQL
- External APIs: GitHub REST API, OpenAI API
- Hosting: Vercel frontend, Render backend

## Coding style

Write clean, readable, maintainable code. Prefer simple architecture over clever abstractions. Keep files organized by responsibility.

Use TypeScript types on the frontend and Pydantic models on the backend. Avoid `any` unless there is a strong reason. Add basic error handling and loading states instead of only coding for the happy path.

Do not make the project feel like a generic AI wrapper. The repo-analysis logic, evidence mapping, file ranking, and project profile pipeline should be treated as core product logic.

## Architecture preferences

Keep these concerns separated:

- GitHub API fetching
- repo URL parsing
- file filtering
- file ranking
- tech stack detection
- user context collection
- LLM prompt construction
- project profile generation
- generated output rendering
- evidence display

Do not put large amounts of logic directly inside UI components or API route handlers.

## Frontend conventions

Use small, reusable components. Keep UI modern, minimal, and developer-tool focused. Prefer clear names over clever names.

Use terms like:
- Analyze repo
- Project profile
- Evidence
- Technical highlights
- Generated outputs
- Interview prep

Avoid terms like:
- AI magic
- Perfect resume
- Dream job
- Career hack

## Backend conventions

Use FastAPI routers, services, and Pydantic models. Keep API routes thin and move business logic into service files.

Use environment variables for API keys and secrets. Never expose secrets to the frontend or commit `.env` files.

## Development behavior

Before making large changes, briefly explain the plan. After implementing, summarize what changed, what files were touched, and any assumptions or follow-up steps.

When something is unclear, make a reasonable assumption and state it instead of blocking progress.

When the OpenAI API is implemented, I want you to be VERY WARY of running tests on RepoFrame itself. I don't want to be burning tokens because you decided it was optimal to run 20 different tests. Only run tests that are absolutely necessary, and inform me before you try running ANYTHING that might even be remotely related to the AI. I will stop you if you go wild with it.

Do not start frontend dev servers, browser smoke tests, or local UI preview sessions unless I explicitly ask for them. I can run and visually verify the frontend myself. Prefer static checks such as lint, TypeScript checks, and focused backend tests when they are enough to validate the change.

## Documentation

- Update the README when setup steps, project structure, or major behavior changes.
- Keep examples current with the actual scripts and package layout.
- Add comments for your code - these should be updated with every change you make, and should explain in an overview style a certain line/lines of code. Try to keep it generalized - if theres a function, explain what the function is and how it accomplishes what it intends to do.
