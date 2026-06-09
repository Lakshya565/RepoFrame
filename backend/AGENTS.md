# Backend Agent Instructions

Follow the root `AGENTS.md` first. This file adds backend-specific guidance for the FastAPI app.

- Use typed Python, FastAPI, and Pydantic in a clear, maintainable style.
- Organize backend code by responsibility: routers, schemas/models, services, clients, and utilities.
- Keep API routes thin; move repo parsing, file filtering, ranking, stack detection, evidence mapping, and prompt construction into service modules.
- Use Pydantic models for request, response, and domain schemas.
- Avoid global mutable state for request-specific data.
- Load secrets from environment variables only. Never commit `.env` files or expose secrets to the frontend.
- Keep future GitHub, OpenAI, Supabase, and database clients isolated behind small modules.
- Add minimal tests for non-trivial parsing, ranking, or transformation logic.
- Do not implement GitHub API, OpenAI API, database, or authentication logic unless explicitly requested.
