# RepoFrame
Frame your project around what you actually built by turning your project repo into a clear, evidence-backed story. RepoFrame is a full-stack developer tool that analyzes GitHub repositories and turns them into clear, evidence-backed project writeups. A Next.js frontend handles the user flow, while a FastAPI backend fetches repo data, ranks important files, detects the tech stack, and uses an LLM pipeline to generate resume bullets, README sections, portfolio blurbs, and interview talking points grounded in actual project evidence.

Initial Tech Stack:
 Next.js frontend
    ↓
FastAPI backend
    ↓
GitHub REST API
    ↓
Repo parser + file ranker + stack detector
    ↓
OpenAI API
    ↓
Project profile + generated outputs
    ↓
Supabase/Postgres
