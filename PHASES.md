# RepoFrame Project Phases 
- Skip all phases that say (DONE, DO NOT TOUCH)
- Reminder - Consult AGENTS.md for best coding practices, workflows, and the way I want to implement things. Remember to comment out code for readability and understanding purposes.
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

# Phase 3(DONE, DO NOT TOUCH): GitHub Metadata Fetching

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
Implement GitHub public repo metadata fetching in the FastAPI backend. Add a GitHub service that fetches repo name, description, default branch, stars, forks, language, and HTML URL using the GitHub REST API. Add a POST /api/repo/metadata endpoint that accepts a repo URL, parses it, fetches metadata, and returns a typed response. Connect the frontend to display this metadata in a RepoSummaryCard. Include loading and error states, as well as all edge cases - account for this and make the RepoSummaryCard dynamically sized based on the number of outputs from the GitHub API. 
```

---

# Phase 4(DONE, DO NOT TOUCH): File Tree Fetching

## Goal

Pull the repo structure.

## Build

```text
Fetch recursive file tree
Normalize file paths
Return file list
Display top-level structure in UI
Create a simple text-based tree view
Keep the tree view component flexible for a future interactive version
```

## Codex Prompt

```text
Add GitHub file tree fetching. Use the repo default branch to fetch the recursive file tree from the GitHub API. Return normalized RepoFile objects with path, type, size if available, and URL if available. Add a backend endpoint POST /api/repo/tree. Display the fetched file tree summary in the frontend, including total files.

Create a dedicated but dynamic view for the tree, because later I want to replace it with a more interactive tree view. For now, keep it simple and text-based. Do not focus too much on advanced visualization yet.

Do not try to access metadata for the contents of the files themselves. Only use the structure returned by GitHub's API.
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
Return ranking reasons
```

## Codex Prompt

```text
Implement repo file filtering and ranking logic in the backend. Add utilities filter_repo_files and rank_important_files. Filter out dependency folders, build outputs, generated files, lock files, binaries, images, and oversized files. Prioritize README files, package/config files, src/app/pages/components/api/routes/models/schema files, and main entry points. Return the top-ranked files with importance scores and reasons. Display them in the frontend.

Keep the logic deterministic for now. Do not use OpenAI or any LLM calls in this phase.
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
Detected stack evidence
```

## Codex Prompt

```text
Implement tech stack detection in the backend. Use repository metadata, file paths, package.json if available, requirements.txt if available, and config files to detect technologies such as React, Next.js, TypeScript, Python, FastAPI, Flask, Node, Express, Tailwind, Supabase, PostgreSQL, SQLite, Pandas, OpenCV, and other common tools. This is not a comprehensive list, so try to detect any and all technologies. Return detected technologies with confidence and evidence. Display the detected stack in the frontend.

Each detected technology should include a short reason or evidence source, such as package.json, requirements.txt, file extension patterns, or config files. You can make this like a little bubble next to each entry in the stack. If the README already says what technologies were used, start with that but make sure you have at least one more source of evidence backing that up, to make sure that the user was accurate in their selection.
```

---

# Phase 7: Fetch Selected File Contents

## Goal

Gather enough repo evidence for the AI step without fetching too much.

## Build

```text
Fetch README
Fetch config files
Fetch top-ranked source files
Set file size limits
Set total content limits
Store excerpts
Handle rate limits
Handle missing README files
```

## Codex Prompt

```text
Implement selected file content fetching. Add backend logic to fetch README, package/config files, and the top-ranked source files from GitHub with strict size limits. Return file path, content excerpt, source type, and reason for selection. Do not fetch entire large repos. Add clear handling for missing README files, oversized files, and GitHub rate limits.

Add basic safety limits:
- max number of selected files
- max characters per file
- max total characters across all fetched content
- clear skipped-file reasons

Do not add OpenAI calls yet. This phase should only prepare safe, bounded repo evidence.
```

---

# Phase 8: Token, Cost, and Abuse Protection

## Goal

Prevent people from burning API credits once the app is deployed.

## Build

```text
Backend-only API keys
.env setup
Token/input size budgeting
Request size limits
Daily/global request limit placeholder
Basic usage estimation
Optional password gate placeholder
```

## Codex Prompt

```text
Add basic token, cost, and abuse protection before any OpenAI integration. Make sure API keys are only read from backend environment variables and are never exposed to the frontend. Add backend constants or config values for maximum selected files, maximum characters per file, maximum total prompt characters, and maximum requests per session or IP placeholder.

Add a simple utility to estimate input size before sending content to OpenAI. If the repo evidence is too large, return a clear error or trim the evidence safely. Add comments explaining where future rate limiting, auth, or usage caps should be integrated.

Do not implement paid billing or full auth yet. The goal is to make the OpenAI integration safe enough for a controlled deployment.
```

---

# Phase 9: User Context Questionnaire

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
Editable answers
Frontend state only for now
```

## Codex Prompt

```text
Add a user context questionnaire to the frontend. Ask for project purpose, solo/team status, user contribution, target user or client, hardest technical part, and measurable impact if available. Store the answers in frontend state for now. Make the form clean, concise, and easy to edit. Do not add database persistence yet.

Make it clear that these answers are used to prevent RepoFrame from guessing things that cannot be inferred from the repo alone.
```

---

# Phase 10: OpenAI Project Profile Generation

## Goal

Generate the first structured project profile.

## Build

```text
OpenAI API integration
Backend-only .env key
Structured JSON output
Project profile model
Evidence-aware generation
Backend endpoint: POST /api/generate/profile
```

## Codex Prompt

```text
Add OpenAI-based project profile generation in the FastAPI backend. Create a service that combines repo metadata, detected tech stack, selected file evidence, and user context into a structured prompt. The model should return a validated JSON project profile with projectName, oneSentenceSummary, problem, solution, detectedTechStack, coreFeatures, technicalHighlights, userContribution, technicalChallenges, resumeAngles, and evidence.

Use environment variables for the OpenAI API key. Do not expose secrets to the frontend. Respect the token/input limits created earlier. The output should be grounded in the selected repo evidence and user-provided context.

Do not generate final resume bullets or interview talking points yet. This phase should only generate the structured project profile.
```

---

# Phase 11: Generate Core Output Tabs

## Goal

Make the app useful without wasting tokens.

## Build

```text
Resume bullets
README intro
LinkedIn/project description
Portfolio blurb
Evidence panel
Copy buttons
Edit mode
Regenerate option
Optional interview prep button
```

## Codex Prompt

```text
Implement generated output tabs in the frontend and backend. Add a backend endpoint that takes a structured project profile and generates core outputs:
- resume bullets
- README intro
- portfolio blurb
- LinkedIn-style project description

Do not generate interview talking points by default. Add a separate frontend button or tab action that lets the user choose whether they want interview talking points. Only call the backend for interview prep if the user explicitly requests it.

In the frontend, display outputs in clean tabs with copy buttons. Add an EvidencePanel that shows supporting files or user context for major claims. Add simple edit mode so users can revise generated text directly. Add a regenerate option, but keep it scoped to one output section at a time.
```

---

# Phase 12: Agentic Claim Verification

## Goal

Add a bounded agentic workflow that verifies generated claims against repo evidence.

## Build

```text
Claim Verification Agent
Supported / partially supported / needs confirmation / unsupported labels
Evidence search over selected repo evidence
User-context checks
Structured verification JSON
Frontend claim status display
```

## Codex Prompt

```text
Implement a bounded agentic claim-verification workflow for RepoFrame. The goal is to verify generated project claims against selected repo evidence and user-provided context.

The agent should review generated claims from resume bullets, README intro, portfolio blurb, and LinkedIn-style description. For each claim, return a structured verification result:
- claim
- status: supported, partially_supported, needs_user_confirmation, or unsupported
- supportingEvidence
- explanation
- suggestedRevision if needed

Keep the agent bounded and safe:
- it may only use already-selected repo evidence and user context
- it should not fetch unlimited new files
- it should not run code from the repo
- it should return structured JSON
- it should respect the existing token/input limits

Display claim verification results in the frontend, ideally near the EvidencePanel or under each generated output. This should make RepoFrame feel like an agentic repo analysis tool, not just a generic AI writing app.
```

---

# Phase 13: Usage Metrics and Cost Tracking

## Goal

Track real numbers for deployment, resume bullets, and cost control.

## Build

```text
Repos analyzed
Files scanned
Files selected
Claims generated
Claims verified
Supported vs unsupported claims
Estimated input/output tokens
Estimated cost per analysis
LLM latency
Backend latency
Error counts
```

## Codex Prompt

```text
Add basic usage and system metrics tracking. Track useful metrics such as repos analyzed, total files scanned, selected evidence files, generated claims, verified claims, supported/unsupported claim counts, estimated token usage, estimated cost per analysis, LLM latency, backend latency, and error counts.

For now, keep the implementation simple. Store metrics in memory, local logs, or a lightweight structure that can later be moved to Supabase. Do not add a complex analytics dashboard yet. Add a simple backend endpoint or developer-only view that exposes recent metrics for debugging and future resume/project reporting.
```

---

# Phase 14: Polish the MVP

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
Subtle animations
Better evidence display
Better claim verification display
README screenshots
```

## Codex Prompt

```text
Polish the RepoFrame MVP. Improve loading, error, and empty states across the frontend. Make the UI feel like a clean developer tool, not a generic AI app. Add example repo cards on the landing page, improve spacing and typography, and make the analysis flow easy to demo in under 60 seconds.

Add subtle animations only where they improve clarity, such as loading states, tab transitions, collapsible evidence cards, or analysis progress steps. Do not add distracting animations or major new features.
```

---

# Phase 15: Save Projects with Supabase

Only do this after the local MVP works.

## Build

```text
Supabase setup
projects table
generated_outputs table
claim_verifications table
usage_metrics table
save/load project profiles
session history
optional auth later
```

## Codex Prompt

```text
Add Supabase persistence for generated project profiles, outputs, claim verifications, and basic usage metrics. Create database models or API logic for saving repo metadata, user context, project profiles, generated outputs, claim verification results, and analysis metrics.

Keep auth optional for now. Add a simple saved projects page that lists saved analyses and lets the user reopen them. Do not add payments, teams, or complex permissions yet.
```

---

# Phase 16: Deployment

## Goal

Get it online with controlled access and measurable usage.

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
MAX_SELECTED_FILES
MAX_CHARS_PER_FILE
MAX_TOTAL_PROMPT_CHARS
MAX_ANALYSES_PER_DAY
```

## Codex Prompt

```text
Prepare RepoFrame for controlled deployment. Add production environment variable documentation, deployment instructions for the frontend and backend, and clear notes about backend-only secrets. Make sure the frontend uses the deployed backend URL through an environment variable.

Add or document basic controlled-access protections such as request limits, optional password gate placeholder, and daily analysis cap. Do not expose OpenAI or GitHub tokens to the frontend. Do not deploy automatically.
```

---

# Updated Recommended Build Order

```text
1. Frontend input flow
2. Backend URL parser
3. GitHub metadata
4. GitHub file tree
5. File filtering/ranking
6. Tech stack detection
7. Selected file content fetching
8. Token, cost, and abuse protection
9. User context questionnaire
10. Project profile generation
11. Core output tabs + optional interview prep
12. Agentic claim verification
13. Usage metrics and cost tracking
14. UI polish
15. Supabase save/load
16. Deployment
```

# Codex Usage Rule

Do not tell Codex:

```text
Build the full app.
```

Tell it one exact feature, verify it, then move on.

Codex should not commit anything unless explicitly asked.
