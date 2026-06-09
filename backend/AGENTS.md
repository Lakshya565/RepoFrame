# Backend Agent Instructions

Use typed Python, FastAPI, and Pydantic in a clear, maintainable style.

- Keep API routes thin and move business logic into service modules.
- Use Pydantic models for request and response schemas.
- Avoid global mutable state for request-specific data.
- Keep future GitHub, OpenAI, and database clients isolated behind small modules.
- Add minimal tests for non-trivial parsing, ranking, or transformation logic.
- Do not implement GitHub API, OpenAI API, database, or authentication logic unless explicitly requested.
