<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Frontend Agent Instructions

Follow the root `AGENTS.md` first. This file adds frontend-specific guidance for the Next.js app.

- Use TypeScript for components, hooks, utilities, and data shapes.
- Avoid `any` unless there is a clear reason and document the tradeoff locally.
- Keep UI components small, named by responsibility, and easy to scan.
- Move non-trivial data shaping, validation, and API calls out of page components.
- Add basic loading, error, disabled, and empty states for user-facing flows.
- Keep the interface modern, minimal, and developer-tool focused.
- Prefer product language from the root instructions, such as `Analyze repo`, `Project profile`, `Evidence`, `Technical highlights`, `Generated outputs`, and `Interview prep`.
- Do not add GitHub, OpenAI, auth, or database integration logic unless explicitly requested.
