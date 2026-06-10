# RepoFrame Project Phases

RepoFrame is a full-stack web app that turns GitHub repositories into clear, evidence-backed project writeups.

This file only lists the main project phases from the current point forward. Phase 0, the initial setup/docs stage, is already complete.

---

# Phase 1(DONE, DO NOT TOUCH): Basic Frontend Flow

## Goal

Make the app feel real before connecting APIs.

## Build

```text
Landing page
GitHub repo URL input
Basic URL validation
Loading state
Error state
Placeholder analysis result page
```

## Codex Prompt

```text
Build the initial frontend flow for RepoFrame. Add a polished landing page with the product name, tagline, GitHub repo URL input, and a simple “How it works” section(which should just be telling the user to clone their repo using the https web url). Add client-side validation for GitHub repo URLs in the format https://github.com/{owner}/{repo}. On valid submission, navigate to a placeholder analysis page showing the parsed owner and repo. Do not call the backend yet. NOTE - these pages will be changed in the future, so just do a very basic structure that can easily be adapted/replaced. I want to expose it on localhost, so once you're finished, provide all the steps to spin up the frontend.
```

---

# Phase 2(DONE< DO NOT TOUCH): Backend Health and Repo URL Parsing

## Goal

Connect the frontend to FastAPI for the first time.

## Build

```text
GET /health
POST /api/repo/parse
Pydantic request/response models
CORS from frontend
Frontend calls backend
```

## Codex Prompt

```text
Implement a FastAPI endpoint for parsing GitHub repo URLs. This will REPLACE the current frontend system, we need to have all this done through the backend rather than the frontend, so please get rid of redundant frontend code that will now be replaced. Do not hallucinate values, and ask me for all example code you would like to include. Add POST /api/repo/parse that accepts a repoUrl string and returns owner, repo, and normalizedUrl.  Use Pydantic models for request and response validation. Add error handling for invalid GitHub URLs. Connect the frontend repo input form to this backend endpoint and display the parsed result.
```

---

# Phase 3: GitHub Metadata Fetching

## Goal

Fetch real public repo data.

## Build

```text
GitHub API service
Fetch repo name, description, default branch, stars, primary language
Backend endpoint: POST /api/repo/metadata
Frontend repo summary card
```

## Codex Prompt

```text
Implement GitHub public repo metadata fetching in the FastAPI backend. Add a GitHub service that fetches repo name, description, default branch, stars, forks, language, and HTML URL using the GitHub REST API. Add a POST /api/repo/metadata endpoint that accepts a repo URL, parses it, fetches metadata, and returns a typed response. Connect the frontend to display this metadata in a RepoSummaryCard. Include loading and error states.
```

---

# Phase 4: File Tree Fetching

## Goal

Pull the repo structure.

## Build

```text
Fetch recursive file tree
Normalize file paths
Return file list
Display top-level structure in UI
```

## Codex Prompt

```text
Add GitHub file tree fetching. Use the repo default branch to fetch the recursive file tree from the GitHub API. Return normalized RepoFile objects with path, type, size if available, and URL if available. Add a backend endpoint POST /api/repo/tree. Display the fetched file tree summary in the frontend, including total files and a preview of important-looking paths. Make sure to create a dedicated view for the tree, because later I want to replace it with a more interactive tree view. However, don't focus too much on that, just create the file tree as a text based visual for right now.
```

---

# Phase 5: File Filtering and Ranking

## Goal

Make the project smart before adding AI.

## Build

```text
filter_repo_files()
rank_important_files()
Ignore generated/dependency files
Prioritize README, config files, source files, routes, components
Show top ranked files
```

## Codex Prompt

```text
Implement repo file filtering and ranking logic in the backend. Add utilities filter_repo_files and rank_important_files. Filter out dependency folders, build outputs, generated files, lock files, binaries, images, and oversized files. Prioritize README files, package/config files, src/app/pages/components/api/routes/models/schema files, and main entry points. Return the top-ranked files with importance scores and reasons. Display them in the frontend.
```

---

# Phase 6: Tech Stack Detection

## Goal

Detect what the project uses.

## Build

```text
detect_tech_stack()
package.json parsing
requirements.txt parsing
file pattern detection
Frontend display
```

## Codex Prompt

```text
Implement tech stack detection in the backend. Use repository metadata, file paths, package.json if available, requirements.txt if available, and config files to detect technologies such as React, Next.js, TypeScript, Python, FastAPI, Flask, Node, Express, Tailwind, Supabase, PostgreSQL, SQLite, Pandas, OpenCV, and other common tools. Return detected technologies with confidence and evidence. Display the detected stack in the frontend.
```

---

# Phase 7: Fetch Selected File Contents

## Goal

Gather enough evidence for the AI step.

## Build

```text
Fetch README
Fetch config files
Fetch top-ranked source files
Set size limits
Store excerpts
```

## Codex Prompt

```text
Implement selected file content fetching. Add backend logic to fetch README, package/config files, and the top-ranked source files from GitHub with strict size limits. Return file path, content excerpt, source type, and reason for selection. Do not fetch entire large repos. Add clear handling for missing README files, oversized files, and GitHub rate limits.
```

---

# Phase 8: User Context Questionnaire

## Goal

Fill in what the repo cannot know.

## Build

```text
Project purpose
Solo/team
User contribution
Target user/client
Hardest technical part
Impact/result
```

## Codex Prompt

```text
Add a user context questionnaire to the frontend. Ask for project purpose, solo/team status, user contribution, target user or client, hardest technical part, and measurable impact if available. Store the answers in frontend state for now. Make the form clean, concise, and easy to edit. Do not add database persistence yet.
```

---

# Phase 9: OpenAI Project Profile Generation

## Goal

Generate the first structured output.

## Build

```text
OpenAI API integration
.env setup
Structured JSON output
Project profile model
Backend endpoint: POST /api/generate/profile
```

## Codex Prompt

```text
Add OpenAI-based project profile generation in the FastAPI backend. Create a service that combines repo metadata, detected tech stack, selected file evidence, and user context into a structured prompt. The model should return a validated JSON project profile with projectName, oneSentenceSummary, problem, solution, detectedTechStack, coreFeatures, technicalHighlights, userContribution, technicalChallenges, resumeAngles, and evidence. Use environment variables for the OpenAI API key. Do not expose secrets to the frontend.
```

---

# Phase 10: Generate Output Tabs

## Goal

Make the app useful.

## Build

```text
Resume bullets
README intro
LinkedIn/project description
Portfolio blurb
Interview talking points
Evidence panel
Copy buttons
```

## Codex Prompt

```text
Implement generated output tabs in the frontend and backend. Add a backend endpoint that takes a structured project profile and generates resume bullets, a README intro, a portfolio blurb, a LinkedIn-style project description, and interview talking points. In the frontend, display these outputs in clean tabs with copy buttons. Include an EvidencePanel that shows supporting files or user context for major claims.
```

---

# Phase 11: Polish the MVP

## Goal

Make the app demoable.

## Add

```text
Better loading states
Better error states
Empty states
Mobile layout
Consistent styling
Clean landing page
Demo repo examples
README screenshots
```

## Codex Prompt

```text
Polish the RepoFrame MVP. Improve loading, error, and empty states across the frontend. Make the UI feel like a clean developer tool, not a generic AI app. Add example repo cards on the landing page, improve spacing and typography, and make the analysis flow easy to demo in under 60 seconds. Do not add new major features.
```

---

# Phase 12: Save Projects with Supabase

Only do this after the MVP works.

## Build

```text
Supabase setup
projects table
generated_outputs table
save/load project profiles
optional auth later
```

## Codex Prompt

```text
Add Supabase persistence for generated project profiles and outputs. Create database models or API logic for saving repo metadata, user context, project profiles, and generated outputs. Keep auth optional for now. Add a simple saved projects page that lists saved analyses and lets the user reopen them.
```

---

# Phase 13: Deployment

## Goal

Get it online.

## Deploy

```text
Frontend: Vercel
Backend: Render, Fly.io, or Railway
Database: Supabase
```

## Environment Variables

```text
OPENAI_API_KEY
GITHUB_TOKEN optional but useful
BACKEND_URL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY only backend-side if needed
```

Do not deploy until the local MVP works.

---

# Recommended Build Order

```text
1. Frontend input flow
2. Backend URL parser
3. GitHub metadata
4. GitHub file tree
5. File filtering/ranking
6. Tech stack detection
7. Selected file content fetching
8. User context questionnaire
9. Project profile generation
10. Output tabs + evidence panel
11. UI polish
12. Supabase save/load
13. Deployment
```

# Codex Usage Rule

Do not tell Codex:

```text
Build the full app.
```

Tell it one exact feature, verify it, then move on.

Codex should not commit anything unless explicitly asked.
