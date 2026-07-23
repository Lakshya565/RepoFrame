# RepoFrame Interview Guide

This is a study guide, not a script. The first answer under each question is the
version I would actually say out loud. The deeper answer is there in case the
interviewer keeps digging.

The safest way to use this:

1. Learn the shape of the answer, not every sentence.
2. Start with the casual answer.
3. Stop talking and let the interviewer choose the follow-up.
4. Use the code evidence when I need to refresh how something really works.
5. Be honest about tradeoffs. RepoFrame is stronger when I can explain what it does
   not solve.

---

## Quick project explanations

### The 30-second version

> RepoFrame is a full-stack tool that turns a GitHub repository into useful project
> writeups, like resume bullets, a portfolio blurb, README copy, and interview prep.
> The main thing that makes it different from a basic AI wrapper is that it first
> analyzes the actual repository, ranks the important files, builds a bounded evidence
> set, and asks the user for context the code cannot prove. It can also run an Agentic
> Audit that searches the repository and checks whether the generated claims are
> actually supported.

### The two-minute version

> The frontend is Next.js and the backend is FastAPI. A user signs in with GitHub,
> pastes a repository URL, and the backend uses the GitHub API to collect metadata,
> the file tree, languages, and selected file contents. It does not just dump the
> whole repository into a prompt. I wrote deterministic ranking and filtering rules
> to choose files like the README, manifests, config, routes, schemas, and important
> source files.
>
> That analysis is streamed to the frontend in stages, so the user can see metadata
> and structure before every part is finished. The user then answers a few questions
> about their role and project goals, because code cannot prove personal contribution
> or business impact. RepoFrame combines both evidence sources into a structured
> project profile using OpenAI's Luna model, and the profile becomes the source for
> each generated output.
>
> The Agentic Audit is optional. It is a bounded tool-using loop that can search known
> repository paths, read safe text files, and search the evidence it has collected.
> It labels claims as supported, partially supported, needing user confirmation, or
> unsupported. Supabase handles auth and saved projects, while a GitHub App provides
> short-lived access to selected private repositories.

### Architecture at a glance

```text
Browser / Next.js
  - Auth and repository input
  - Progressive Analysis cards
  - User context and generation workspace
  - Saved projects and Agentic Audit UI
                 |
                 | JSON requests + server-sent events
                 v
FastAPI
  - Thin routers and Pydantic schemas
  - Repository analysis and bounded caches
  - Evidence selection and prompt fitting
  - Luna generation and Evidence Investigator
  - Auth, quotas, usage, metrics, persistence
        |                 |                  |
        v                 v                  v
    GitHub API         OpenAI API          Supabase
```

### End-to-end data flow

```text
Repository URL
  -> parse and normalize owner/repo
  -> resolve public or GitHub App access
  -> fetch metadata and recursive tree
  -> filter and rank important paths
  -> detect stack from multiple signals
  -> select bounded text evidence
  -> combine with reviewed user context
  -> fit evidence to the full prompt budget
  -> generate and validate a project profile
  -> reuse the profile for individual outputs
  -> optionally investigate generated claims
  -> save the complete snapshot for reopening
```

---

## 1. Product and architecture

### What problem does RepoFrame solve?

**Answer I would give**

> A lot of developers have solid projects but explain them badly. They either undersell
> the work or paste the repo into a chatbot and get confident-sounding claims that are
> not really grounded. RepoFrame tries to solve both problems. It extracts the
> technical story from the repository, asks the developer for the personal context
> that is missing, and generates useful writing from both.

**Likely follow-up:** Why is this better than pasting a README into ChatGPT?

**Deeper answer**

> A README is only one source and it is often incomplete or stale. RepoFrame also uses
> the actual tree, manifests, configuration, language data, and selected source files.
> It keeps source paths attached to claims and has a separate audit workflow. The
> difference is not just the prompt; it is the evidence pipeline around the model.

**Evidence in the code:** `backend/app/services/analysis_service.py`,
`file_ranker.py`, `file_content_service.py`, `profile_generator.py`.

### What is the main architectural idea?

**Answer I would give**

> The main idea is to keep deterministic repository understanding separate from model
> generation. GitHub fetching, file ranking, stack detection, evidence collection,
> prompt construction, model calls, and UI rendering are separate modules. That lets
> me test most of the product without calling GitHub or OpenAI.

**Likely follow-up:** Why not put the whole workflow in one endpoint?

**Deeper answer**

> A route handler should mainly translate HTTP into a service call and translate known
> failures back into statuses. If the route also owned GitHub requests, filtering,
> prompts, caching, and persistence, every change would become risky. Separating those
> concerns also let the progressive stream and the older JSON endpoints reuse the same
> analysis snapshot instead of duplicating logic.

**Evidence in the code:** `backend/app/routers/repo.py`,
`backend/app/services/analysis_service.py`, `backend/app/routers/generate.py`.

### Why use a frontend/backend split?

**Answer I would give**

> The browser is good at interaction and rendering, but it should never hold my OpenAI
> key, Supabase service-role key, or GitHub App private key. The backend is the trusted
> tier that owns external APIs, validation, quotas, and evidence rules. The frontend
> receives typed results and manages the workspace.

**Likely follow-up:** Would a Next.js-only app have been simpler?

**Deeper answer**

> It could have been simpler at the beginning, but Python was a better fit for the
> analysis and model pipeline, and FastAPI gave me a clean typed service boundary.
> Keeping the backend independent also makes it easier to test and deploy long-running
> or streamed work without mixing it into React server code.

**Evidence in the code:** `frontend/src/lib/api-client.ts`,
`backend/app/main.py`, `backend/app/config.py`.

### Why create a structured project profile before generating outputs?

**Answer I would give**

> I did not want every resume bullet or portfolio blurb to reinterpret the raw repo
> independently. The profile is the grounded middle layer. It captures the project
> facts once, and then every output is just a different presentation of that same
> understanding.

**Likely follow-up:** What happens when the user changes their context?

**Deeper answer**

> The generation state tracks whether the existing profile still matches the current
> questionnaire. If context changes, the next generation refreshes the profile before
> using it. If the context is unchanged, section generation and revision reuse the
> current profile and avoid repeating repository analysis and profile generation.

**Evidence in the code:** `frontend/src/lib/generation-context.tsx`,
`backend/app/services/profile_generator.py`,
`backend/app/services/output_generator.py`.

### What parts are deterministic and what parts use AI?

**Answer I would give**

> URL parsing, GitHub access, file filtering, ranking, evidence limits, and most stack
> detection are deterministic. Luna is used where synthesis matters: building the
> project profile, writing outputs, revising them, creating interview prep, and making
> the final audit judgment.

**Likely follow-up:** Why does that distinction matter?

**Deeper answer**

> Deterministic work is cheaper, faster, explainable, and easy to regression-test. The
> model should not be paid to discover that `node_modules` is irrelevant or that
> `package.json` matters. Saving the model for synthesis reduces cost and gives it a
> cleaner input.

**Evidence in the code:** `repo_parser.py`, `file_ranker.py`,
`tech_stack_detector.py`, `llm_client.py`.

---

## 2. GitHub analysis and evidence

### How does RepoFrame decide which files matter?

**Answer I would give**

> It starts with rules rather than asking a model. It filters dependencies, generated
> output, lockfiles, binaries, and oversized files. Then it scores useful paths like
> READMEs, manifests, configs, routes, schemas, services, components, and entry points.
> It also records the reasons for each score.

**Likely follow-up:** What is the weakness of rule-based ranking?

**Deeper answer**

> Rules can miss a strangely named but important file, and every ecosystem has
> conventions I may not know. I accepted that because the ranking is predictable and
> safe. The Evidence Investigator can later search the full allowlisted tree when a
> generated claim needs evidence outside the initial bundle.

**Evidence in the code:** `backend/app/services/file_ranker.py`,
`backend/app/services/evidence_investigator.py`.

### Why not send the entire repository to the model?

**Answer I would give**

> It would be slow, expensive, noisy, and unsafe for large repositories. More context
> is not automatically better context. RepoFrame selects a small evidence set, caps
> each file and the total request, and explains what was skipped.

**Likely follow-up:** How do you avoid cutting off the most useful evidence?

**Deeper answer**

> Evidence stays ranked. The prompt fitter keeps higher-priority files first. If only
> part of the last file fits, it marks that excerpt as truncated, then records a
> prompt-budget skip reason for lower-priority files. That is better than silently
> slicing a giant concatenated string.

**Evidence in the code:** `backend/app/services/file_content_service.py`,
`backend/app/services/prompt_budget.py`.

### How is technology detection evidence-backed?

**Answer I would give**

> It combines several signals: GitHub language totals, file extensions, package or
> requirements files, framework configs, and README mentions. The response includes
> confidence and the paths or sources that produced the result.

**Likely follow-up:** Why not trust `package.json` alone?

**Deeper answer**

> A dependency can be installed but unused, and not every technology appears in one
> package file. Combining manifests, configs, paths, and language totals reduces false
> positives. It also lets the UI show why a technology was detected instead of just
> showing a logo.

**Evidence in the code:** `backend/app/services/tech_stack_detector.py`.

### How do public and private repositories use the same pipeline?

**Answer I would give**

> The analysis code does not care where the credential came from. A repository-access
> service first decides whether the request can use public access or needs a GitHub App
> installation token. It then places that short-lived token into the GitHub request
> context and runs the same analysis services.

**Likely follow-up:** How do you keep private data out of public caches?

**Deeper answer**

> Public cache keys are repository-scoped. Private cache keys include the verified
> user, GitHub installation, and repository. The frontend also clears its private
> session cache on sign-out. Installation tokens are never persisted and are removed
> before their reported expiry.

**Evidence in the code:** `backend/app/services/repo_access.py`,
`analysis_service.py`, `github_app.py`,
`frontend/src/lib/analysis-context.tsx`.

### How do you handle GitHub failures and rate limits?

**Answer I would give**

> GitHub errors are normalized into typed service errors with useful statuses instead
> of leaking raw responses. Normal resources use tight timeouts. Commit statistics get
> a separate longer timeout and bounded retry behavior because GitHub calculates that
> endpoint lazily. There is also a backend rate-limit endpoint for operational checks.

**Likely follow-up:** What does the user see if one GitHub call fails?

**Deeper answer**

> Analysis cards have their own loading and error states, and a card error boundary
> prevents a rendering bug from taking down the whole route. The progressive stream
> reports stage-scoped failures, while the commit card can retry independently.

**Evidence in the code:** `backend/app/services/github_service.py`,
`backend/app/routers/repo.py`, `frontend/src/components/states.tsx`,
`repo-commit-timeline.tsx`.

---

## 3. OpenAI generation and the Agentic Audit

### Why use GPT-5.6 Luna for everything?

**Answer I would give**

> I wanted one reliable model contract for profile generation, output writing, and the
> audit instead of tuning the product around several models with different behavior.
> Luna gave me stronger responses without enough cost difference to justify a smaller
> default model for this product.

**Likely follow-up:** Why pin the model in code?

**Deeper answer**

> A stale deployment variable had previously allowed the wrong model to return. Pinning
> the model removes that hidden source of drift. Limits like reasoning effort, output
> size, timeout, and retries are still configurable, but the product's core behavior
> cannot silently downgrade.

**Evidence in the code:** `backend/app/config.py`,
`backend/app/services/llm_client.py`.

### Why are function-tool turns configured differently?

**Answer I would give**

> The Chat Completions request shape rejects function tools when reasoning effort is
> enabled for this model. So investigation turns use `reasoning_effort="none"` while
> the final tool-free verdict restores the configured reasoning effort. That keeps the
> tools working and still gives the final judgment room to reason.

**Likely follow-up:** Why not migrate the whole app to the Responses API?

**Deeper answer**

> That would have been a larger API migration with new response parsing and test
> surface. The existing Chat Completions integration was stable, and separating the
> tool turns from the final reasoning turn solved the actual product problem. I would
> reconsider Responses if it offered a capability the product needed, not just for API
> novelty.

**Evidence in the code:** `backend/app/services/llm_client.py`,
`backend/app/services/claim_verifier.py`.

### What makes the audit agentic instead of a normal model call?

**Answer I would give**

> The model can inspect the initial evidence, decide it is missing something, choose a
> repository tool, use the returned result, and continue across multiple turns. The
> sequence is not hardcoded. What is hardcoded is the safety boundary and maximum
> amount of work.

**Likely follow-up:** What tools does it have?

**Deeper answer**

> It can search allowlisted repository paths, read a specific safe text file, and
> search the evidence already collected. It cannot run code, write anything, access an
> arbitrary URL, use a shell, or escape the known repository and ref.

**Evidence in the code:** `backend/app/services/evidence_investigator.py`,
`backend/app/services/claim_verifier.py`.

### How do you keep the agent from looping forever or spending too much?

**Answer I would give**

> There are hard caps on model turns, tool calls, additional files, additional
> characters, and total prompt size. The loop also reserves a final model turn that
> cannot call tools, so it always has a chance to return the structured verdict.

**Likely follow-up:** What if tool results make the conversation too large?

**Deeper answer**

> Every new result is fitted against the remaining conversation headroom. Oversized
> results are shortened while preserving valid assistant/tool message pairs. If the
> user-provided or generated content itself is too large, the final hard guard rejects
> the request before another paid call.

**Evidence in the code:** `claim_verifier.py`, `prompt_budget.py`,
`token_estimator.py`.

### How are audit results represented?

**Answer I would give**

> Each discrete claim gets one of four labels: supported, partially supported, needs
> user confirmation, or unsupported. It also gets supporting evidence, an explanation,
> and an optional suggested revision. The UI shows how many model calls, tool calls,
> and extra files the investigation used.

**Likely follow-up:** Why have “needs user confirmation” separately?

**Deeper answer**

> Some claims are not technical repository facts. A repo cannot prove that I personally
> designed a feature, that a client loved it, or that performance improved by a
> specific percentage. Those claims may be completely reasonable but need human
> confirmation rather than being treated as false.

**Evidence in the code:** `backend/app/schemas/verify.py`,
`frontend/src/components/claim-verification-panel.tsx`,
`verification-agent.tsx`.

### Can the Evidence Investigator still miss a bad claim?

**Answer I would give**

> Yes. It is a safety and review tool, not a proof system. It can miss a claim, choose
> the wrong search, or interpret weak evidence too generously. The point is to make
> unsupported claims much easier to catch and inspect, not promise perfect truth.

**Likely follow-up:** How would you improve its recall?

**Deeper answer**

> I would build a stronger deterministic claim-extraction pass, evaluate it against a
> labeled set of good and bad project claims, and measure misses by claim type. I could
> also add targeted search strategies for metrics, architecture, and ownership claims.
> I would do that with evaluation data rather than just increasing model turns.

**Evidence in the code:** `backend/app/services/claim_verifier.py`,
`backend/tests/test_claim_verifier.py`.

### Why validate model output with Pydantic?

**Answer I would give**

> The frontend needs a real contract, not “probably JSON.” Pydantic checks required
> fields, types, allowed statuses, lengths, and nested shapes. If the model returns an
> incomplete or malformed response, the backend returns a controlled error instead of
> pushing broken data into React.

**Likely follow-up:** Do you retry schema failures?

**Deeper answer**

> Transport retries are handled by the OpenAI client for transient failures. Schema
> validation failures are surfaced clearly instead of blindly paying for repeated
> calls. A future improvement could use a targeted repair pass, but only with a strict
> retry cap and measured benefit.

**Evidence in the code:** `backend/app/schemas/`,
`profile_generator.py`, `output_generator.py`, `claim_verifier.py`.

---

## 4. Performance and reliability

### What was slow in the first version?

**Answer I would give**

> The Analysis page originally made several separate requests that repeated metadata,
> tree, ranking, and stack work. It also started GitHub's slower commit-statistics call
> too early. On a cold backend or large repo, that created a lot of dead time.

**Likely follow-up:** What changed?

**Deeper answer**

> The backend now builds one shared core snapshot and streams metadata, then structure
> plus ranking, then stack. The frontend renders each stage as it arrives. Commit
> activity begins after core analysis. Profile generation reuses the same cached core
> analysis rather than rediscovering the repository.

**Evidence in the code:** `backend/app/services/analysis_service.py`,
`backend/app/routers/repo.py`, `frontend/src/lib/analysis-context.tsx`.

### How does caching work?

**Answer I would give**

> The backend has bounded in-memory LRU caches. Results are fresh for five minutes,
> served stale while revalidating between five and thirty minutes, and rebuilt after
> thirty minutes. Concurrent requests for the same repo share one in-flight build.

**Likely follow-up:** Why use process memory instead of Redis?

**Deeper answer**

> RepoFrame currently values simple deployment and has a modest workload. A bounded
> process cache gives most of the latency benefit without another service. The tradeoff
> is that caches reset on deploy and are not shared across backend replicas. Redis
> becomes worthwhile when multiple instances or durable cache hit rates matter.

**Evidence in the code:** `backend/app/services/analysis_service.py`.

### What is stale-while-revalidate buying you?

**Answer I would give**

> A user who revisits a repository gets useful data immediately instead of waiting for
> GitHub again. The backend refreshes it in the background, so the next request gets
> newer data. After the maximum stale window, correctness wins and the caller waits for
> a fresh build.

**Likely follow-up:** Could stale data be misleading?

**Deeper answer**

> Yes, for a recently changed repository. That is why the stale period is bounded and
> why GitHub ETags are used during revalidation. This is an analysis aid, not a
> transactional system, so a short stale window is a reasonable latency tradeoff.

**Evidence in the code:** `analysis_service.py`, `github_service.py`.

### What is single-flight deduplication?

**Answer I would give**

> If several components or users request the same uncached repo at the same time, only
> one request does the GitHub work. The others wait on the same future. Without that,
> a cache miss could turn into a burst of identical API calls.

**Likely follow-up:** What happens if the shared build fails?

**Deeper answer**

> Every waiter receives the same exception, the failure is not cached, and the in-flight
> entry is removed in a `finally` block. A later request can try again instead of being
> poisoned by a cached error.

**Evidence in the code:** `_SingleFlightCache` in
`backend/app/services/analysis_service.py`.

### Why are commit statistics handled separately?

**Answer I would give**

> GitHub's commit-statistics endpoint behaves differently from normal metadata. It can
> return a “still computing” response and take longer. I did not want that optional
> chart to block the repository summary, stack, or structure.

**Likely follow-up:** How did you make the chart reliable?

**Deeper answer**

> One backend request fetches the available year and derives both the 1M daily and 1Y
> weekly views. The frontend validates the bundled response, retries temporary 503s,
> caches it, and guards every property access. A malformed response becomes a card
> error, not a page crash.

**Evidence in the code:** `backend/app/services/commit_activity.py`,
`analysis_service.py`, `frontend/src/lib/commit-activity.ts`,
`repo-commit-timeline.tsx`.

### What frontend performance work was done?

**Answer I would give**

> The analysis provider survives tab switches and keeps a small session cache. The
> tree lazy-mounts near the viewport and only renders expanded branches. The commit
> chart is dynamically imported, and nonessential animation waits until data is ready.
> The repo input also sends a one-time health warm-up when the user focuses it.

**Likely follow-up:** Why not prefetch everything immediately?

**Deeper answer**

> Prefetching everything can compete with the data the user needs first. RepoFrame
> prioritizes metadata, structure, and stack, then commit history and heavier visuals.
> The warm-up only touches `/health`; it never starts GitHub or OpenAI work without a
> user action.

**Evidence in the code:** `frontend/src/lib/analysis-context.tsx`,
`repo-tree-view.tsx`, `repo-commit-timeline.tsx`, `repo-api.ts`.

### How do you handle independent frontend/backend deployments?

**Answer I would give**

> Vercel and Render can deploy at different times, so the frontend cannot assume the
> new backend contract is already live. If the progressive stream route returns a
> route-not-supported status, the frontend falls back to the existing JSON endpoints.

**Likely follow-up:** Why remove the old commit adapter but keep this fallback?

**Deeper answer**

> The stream fallback protects a real deployment boundary between two independently
> deployed services and uses endpoints that are still part of the supported API. The
> single-range commit response was a retired data contract after both sides aligned.
> Keeping every old payload forever would increase test and maintenance cost without
> the same operational value.

**Evidence in the code:** `fetchLegacyRepoAnalysis` in
`frontend/src/lib/repo-api.ts`.

---

## 5. Authentication, persistence, and security

### Why use Supabase?

**Answer I would give**

> I needed GitHub login, a Postgres database, and a reasonable security model without
> building an auth platform. Supabase gave me those pieces while still letting the
> FastAPI backend own authorization and data access.

**Likely follow-up:** Why not Firebase or a custom database?

**Deeper answer**

> The data is relational and fits Postgres well: users, saved projects, installations,
> and usage records. Supabase also provides SQL migrations and Row Level Security.
> Firebase could work, but its document model was not an advantage here. Custom auth
> would have added high-risk work unrelated to RepoFrame's core value.

**Evidence in the code:** `supabase/migrations/`,
`backend/app/services/supabase_client.py`, `project_store.py`.

### How do you authorize saved projects?

**Answer I would give**

> The backend verifies the Supabase bearer token and gets a trusted user ID. Every
> project query includes that user ID, so knowing another project's UUID is not enough
> to read or delete it. Row Level Security is a second layer, not an excuse to skip
> explicit scoping.

**Likely follow-up:** Why is explicit scoping important with a service-role key?

**Deeper answer**

> The service-role key can bypass RLS. That makes the backend powerful but dangerous.
> The safe rule is that every repository method takes the verified user identity and
> includes it in the query. RLS still helps protect against mistakes through other
> access paths.

**Evidence in the code:** `backend/app/services/auth.py`,
`project_store.py`, `backend/app/routers/projects.py`.

### Why use both GitHub OAuth and a GitHub App?

**Answer I would give**

> OAuth answers “who is this user?” The GitHub App answers “which repositories may
> RepoFrame read?” Keeping them separate gives selected-repository access and
> short-lived tokens instead of asking users for a broad personal access token.

**Likely follow-up:** Why not store one user token?

**Deeper answer**

> Long-lived user tokens increase the impact of a leak and can carry broader scopes.
> GitHub App installation tokens are fine-grained, expire quickly, and can be revoked by
> uninstalling the App or changing repository selection.

**Evidence in the code:** `backend/app/services/github_app.py`,
`repo_access.py`, `installation_store.py`.

### How are secrets protected?

**Answer I would give**

> Only the API base URL, Supabase public URL/key, and GitHub App slug are exposed to
> the frontend. OpenAI keys, the Supabase service-role key, the GitHub App private key,
> and webhook secret exist only in backend environment variables. Tokens are not
> logged or stored in saved projects.

**Likely follow-up:** What about private repo content in caches?

**Deeper answer**

> Private cache keys include the user and installation, and the cache is bounded
> process memory rather than persistent shared storage. The frontend clears private
> session data on sign-out. A future distributed cache would need encryption,
> tenant-scoped keys, and explicit retention rules.

**Evidence in the code:** `backend/app/config.py`, `repo_access.py`,
`analysis_service.py`, `frontend/src/lib/analysis-context.tsx`.

### How do quotas work?

**Answer I would give**

> When Supabase is configured, the backend counts successful OpenAI model calls per
> user and globally per day. It checks the quota before paid work. A multi-turn audit
> counts each model turn instead of pretending the whole investigation was one call.

**Likely follow-up:** Why count model calls instead of user button clicks?

**Deeper answer**

> One click can create very different spend. A section generation may use one call,
> while an investigation can use several. Model-call accounting is not a perfect cost
> model, but it is much closer to the thing being bounded and works across generation
> paths.

**Evidence in the code:** `backend/app/services/rate_limit.py`,
`usage_store.py`, `backend/app/routers/generate.py`.

### What happens when a saved project is reopened?

**Answer I would give**

> The Analysis page still loads fresh repository data, because the repo may have
> changed. The Generate workspace is hydrated from the saved snapshot, so the user gets
> their previous context and outputs without another model call.

**Likely follow-up:** How do you avoid immediately autosaving the same snapshot?

**Deeper answer**

> The frontend calculates a stable signature of the savable workspace. Hydration seeds
> the persisted signature. Autosave only runs after the workspace settles and the
> current signature differs, so reopening does not bump the record until something
> actually changes.

**Evidence in the code:** `frontend/src/components/project-hydrator.tsx`,
`frontend/src/lib/project-snapshot.ts`, `use-project-autosave.ts`.

---

## 6. Frontend and UX decisions

### Why Next.js instead of plain React with Vite?

**Answer I would give**

> RepoFrame has several real routes, nested repository layouts, authentication state,
> a demo, saved projects, and production deployment on Vercel. Next.js gave me routing,
> layouts, font optimization, metadata, and a clear deployment path without assembling
> those pieces myself.

**Likely follow-up:** Did RepoFrame need server components?

**Deeper answer**

> Not as its core value. Most workspace behavior is client-side because it is
> interactive and stateful. I still benefit from the App Router and layouts, while
> keeping external API and secret-bearing work in FastAPI instead of relying on Next
> server actions.

**Evidence in the code:** `frontend/src/app/`,
`frontend/src/app/analysis/[owner]/[repo]/layout.tsx`.

### Why Tailwind and small UI primitives?

**Answer I would give**

> I wanted a consistent developer-tool interface without a huge design-system
> dependency. Tailwind made spacing, responsive states, and semantic theme tokens easy
> to keep consistent. Small Radix/shadcn-style primitives handle accessibility-heavy
> pieces while product components stay specific to RepoFrame.

**Likely follow-up:** What prevents utility classes from becoming messy?

**Deeper answer**

> Shared variants live in components like Button, Card, Badge, Skeleton, and states.
> Conditional classes use `cn`, and nontrivial data logic stays outside JSX. I also use
> named constants for motion and layout values that are likely to be tuned.

**Evidence in the code:** `frontend/src/components/ui/`,
`frontend/src/lib/utils.ts`, `frontend/src/app/globals.css`.

### How do you manage state without a large state library?

**Answer I would give**

> The state is naturally split into a few domains. Auth, repository analysis, demo
> mode, and generation each have a provider. Local component state handles temporary
> interactions. That was enough without adding Redux or another global store.

**Likely follow-up:** What is the risk of Context here?

**Deeper answer**

> A giant context can cause unclear ownership and unnecessary rerenders. RepoFrame
> avoids one global bag and keeps providers responsibility-based. If the workspace grew
> into complex collaborative state, I would reevaluate a dedicated store rather than
> forcing Context past its useful size.

**Evidence in the code:** `frontend/src/lib/auth-context.tsx`,
`analysis-context.tsx`, `generation-context.tsx`, `demo-mode.tsx`.

### How did you make loading feel faster?

**Answer I would give**

> I changed both actual latency and perceived latency. The backend avoids repeated
> GitHub work and caches results. The frontend shows each analysis stage when it
> arrives, uses skeletons shaped like the final cards, defers commit history, and keeps
> loaded state across tab changes.

**Likely follow-up:** What is the difference between actual and perceived performance?

**Deeper answer**

> Actual performance is fewer requests, reused connections, caching, ETags, and less
> DOM work. Perceived performance is progressive disclosure, stable skeletons, and not
> blocking the whole page on the slowest optional card. Both matter because a fast
> backend can still feel slow if the UI waits for everything.

**Evidence in the code:** `analysis_service.py`,
`frontend/src/lib/analysis-context.tsx`, `frontend/src/components/states.tsx`.

---

## 7. Testing, observability, and deployment

### How did you test code that normally calls GitHub and OpenAI?

**Answer I would give**

> The service boundaries accept fake fetchers or patched clients, so the test suite is
> offline. Tests cover parsing, ranking, stack detection, evidence limits, prompt
> fitting, model response validation, agent tool behavior, caching, authentication,
> persistence, and error mapping without spending tokens.

**Likely follow-up:** Why is dependency injection important here?

**Deeper answer**

> If a service directly created and hid every external client, tests would either call
> the network or patch fragile internals. Small injectable call boundaries make the
> core transformation testable and let me simulate rate limits, malformed responses,
> private access, and model failures deterministically.

**Evidence in the code:** `backend/tests/`, especially
`test_github_service.py`, `test_analysis_service.py`,
`test_claim_verifier.py`, and `test_prompt_budget.py`.

### What does the validation pipeline check?

**Answer I would give**

> The backend runs the full pytest suite. The frontend runs focused Node tests, ESLint,
> and a production Next.js build, which also performs TypeScript checking. I finish with
> dependency and whitespace checks. The normal validation does not call OpenAI, live
> GitHub, Supabase, or a browser.

**Likely follow-up:** What does that not prove?

**Deeper answer**

> It does not prove OAuth dashboard settings, production environment variables,
> webhook activation, a hosting cold start, or current external API availability. Those
> require a separate controlled smoke test. Keeping that distinction prevents me from
> treating a green unit suite as proof that deployment configuration is correct.

**Evidence in the code:** `backend/tests/`, `frontend/tests/`, `README.md`.

### What observability exists?

**Answer I would give**

> The backend records request IDs, request and error counts, backend and model latency,
> repository-analysis stages, cache status, files selected, generated outputs, and
> audit status totals. Token usage is persisted separately because it also drives
> quotas.

**Likely follow-up:** Why is the metrics store in memory?

**Deeper answer**

> High-frequency operational counters did not justify another persistent write path for
> the current scale. They reset on restart, which is an explicit limitation. Token
> usage is different because it affects quotas and long-term reporting, so that is
> persisted.

**Evidence in the code:** `backend/app/services/metrics_store.py`,
`usage_store.py`, `backend/app/main.py`.

### Why Vercel, Render, and Supabase?

**Answer I would give**

> They match the architecture. Vercel is straightforward for Next.js, Render can run
> the independent Python API, and Supabase provides hosted Postgres and auth. That let
> me focus on RepoFrame's evidence and generation pipeline instead of operating every
> infrastructure layer.

**Likely follow-up:** What tradeoff does the split deployment create?

**Deeper answer**

> More services mean CORS, environment configuration, independent deploy timing, and
> separate cold-start behavior. The stream fallback specifically handles brief
> frontend/backend contract skew. At higher scale I would also evaluate colocating
> services or using a platform with shared private networking.

**Evidence in the code:** `backend/app/main.py`, `frontend/src/lib/api-client.ts`,
`README.md`.

---

## 8. Failures, tradeoffs, and lessons

### Tell me about a difficult bug.

**Answer I would give**

> One bad bug came from changing commit activity from a single-range response to a
> bundled 1M/1Y response. The frontend assumed `ranges` existed, so an older backend
> response could crash the entire Analysis route during render. The fix was not just
> optional chaining. I added runtime validation at the network boundary, isolated card
> failures, and treated deployment skew as a real system behavior.

**Likely follow-up:** What did you learn from it?

**Deeper answer**

> TypeScript only protects data after I have validated it. A network response typed
> with `as SomeType` is still untrusted at runtime. I also learned that independently
> deployed services need tolerant rollout strategies. Today the bundled commit
> contract is enforced, while the progressive stream keeps a deliberate fallback to
> supported JSON routes.

**Evidence in the code:** `frontend/src/lib/commit-activity.ts`,
`repo-commit-timeline.tsx`, `repo-api.ts`.

### Tell me about an API integration issue.

**Answer I would give**

> The audit failed when function tools were sent with reasoning effort on the Chat
> Completions endpoint. The error looked model-related at first, but the real issue was
> the combination of parameters. I changed tool-enabled turns to use no reasoning
> effort and kept reasoning for the final tool-free verdict.

**Likely follow-up:** Why is that a better fix than disabling reasoning everywhere?

**Deeper answer**

> Tool selection mainly needs to choose and call the right constrained function. The
> final verdict is where deeper synthesis is most useful. Splitting the two preserves
> the agent loop and keeps the strongest reasoning at the point that affects the user.

**Evidence in the code:** `backend/app/services/llm_client.py`,
`backend/tests/test_llm_client.py`.

### What would you change if you started over?

**Answer I would give**

> I would design the shared analysis snapshot and progressive stream earlier. The first
> version grew endpoint by endpoint, which was useful for learning, but it duplicated
> GitHub work. I would also define runtime validators for every important frontend API
> boundary from the beginning.

**Likely follow-up:** Would you remove the phased approach?

**Deeper answer**

> No. The phases kept the project understandable and testable. I would keep the phases
> but establish cross-cutting contracts earlier: repository identity, shared access,
> one analysis snapshot, API validation, and observability.

**Evidence in the code:** `PHASES.md`, `analysis_service.py`,
`frontend/src/lib/api-client.ts`.

### What are the biggest current limitations?

**Answer I would give**

> The audit can still miss claims, process-memory caches do not work across replicas,
> operational metrics reset on restart, and GitHub's API still controls some latency.
> The product only supports GitHub, and generation quality still depends on the
> evidence and context the user provides.

**Likely follow-up:** What would you prioritize next?

**Deeper answer**

> I would first build a real evaluation set for generation and audit quality. After
> that, I would add distributed caching or background jobs only if usage data showed
> the single-instance design was the bottleneck. I would rather improve measurable
> correctness than add infrastructure because it sounds impressive.

**Evidence in the code:** cache constants in `analysis_service.py`,
metrics comments in `metrics_store.py`, bounded audit code in `claim_verifier.py`.

### How did you use AI coding tools on this project?

**Answer I would give**

> I used Claude Code and Codex as implementation partners, but I kept the work divided
> into explicit phases and reviewed the architecture, diffs, tests, and product
> behavior. The AI tools were useful for moving quickly across frontend and backend
> code, but they also made it obvious why strong boundaries and validation matter. I
> had to catch wrong assumptions, deployment-contract mistakes, and API parameter
> incompatibilities.

**Likely follow-up:** How do you show that you understand the generated code?

**Deeper answer**

> I can trace the full request from the React action through the typed client, FastAPI
> route, service pipeline, external boundary, validated schema, and UI state. I can
> explain why each boundary exists, what failure modes it handles, and what I would
> change at higher scale. I also kept offline tests and this retrospective so the
> architecture is based on working code rather than an AI-generated description.

**Evidence in the code:** the separation documented in `PHASES.md`, the full test
suite, and the service boundaries throughout `backend/app/services/`.

### What part are you most proud of?

**Answer I would give**

> The evidence pipeline. The visible feature is generated writing, but the hard part is
> deciding what the model should be allowed to claim. RepoFrame ranks evidence,
> distinguishes code facts from human context, fits large repositories safely, lets an
> agent investigate gaps, and still shows the user where the answer came from.

**Likely follow-up:** Why is that technically interesting?

**Deeper answer**

> It combines deterministic analysis, external API reliability, typed model contracts,
> bounded agent tools, prompt budgeting, multi-tenant security, progressive UX, and
> observability. None of those pieces alone is unusual; the interesting part is making
> them agree on one evidence-backed product contract.

**Evidence in the code:** `file_ranker.py`, `file_content_service.py`,
`prompt_budget.py`, `evidence_investigator.py`, `claim_verifier.py`.

---

## Technology-choice cheat sheet

| Choice | Why it fit RepoFrame | Main tradeoff |
| --- | --- | --- |
| Next.js | Nested routes, layouts, Vercel deployment, fonts and metadata | More framework behavior than a Vite SPA |
| FastAPI | Typed Python APIs, Pydantic, streaming responses, clean services | Separate deployment and CORS |
| Pydantic | Runtime validation for HTTP and model-generated JSON | Schemas must be maintained deliberately |
| Tailwind | Fast consistent responsive styling and semantic tokens | Utility-heavy JSX without good primitives |
| Motion | Polished transitions with reduced-motion handling | Animation can distract or cost performance |
| Supabase | GitHub auth, Postgres, migrations, RLS | Service-role use requires careful user scoping |
| GitHub App | Selected repos and short-lived installation tokens | More setup than a simple PAT |
| GitHub REST | Direct metadata/tree/content/statistics support | Rate limits and lazy statistics behavior |
| GPT-5.6 Luna | One strong model contract across generation and audit | Higher cost than using a small model everywhere |
| Chat Completions | Stable existing structured/tool integration | Tool turns require reasoning effort to be disabled |
| Process LRU cache | Simple and fast for current deployment | Resets and is not shared across replicas |
| Server-sent events | Natural one-way progressive status/data stream | Requires careful framing and disconnect handling |
| Vercel + Render | Good fit for independent Next.js/Python services | Deployment skew and separate cold starts |

---

## Final reminders for an interview

- Do not say the audit guarantees truth. Say it investigates and makes evidence visible.
- Do not say the repository proves production dashboard configuration. It proves the
  code and intended deployment contract.
- Do not describe user context as repository evidence. It is a separate, explicit
  source for personal facts.
- Do not call every model response “agentic.” The Agentic Audit is agentic because it
  can choose tools and continue across bounded turns.
- Lead with the product reason, then explain the technical mechanism.
- A good tradeoff answer is stronger than pretending the architecture has no limits.
