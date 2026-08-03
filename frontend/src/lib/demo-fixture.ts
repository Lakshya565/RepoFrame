import type { ProjectDetail } from "@/lib/projects-api";
import type { AuthStatus } from "@/lib/auth-context";

// The frozen, signed-out demo (Phase 15.3c). RepoFrame's own repo, analyzed and
// written up ONCE and committed here as static data. Serving it costs nothing — no
// GitHub calls, no OpenAI tokens, no backend request — so an anonymous visitor can
// see exactly what RepoFrame produces without any spend or abuse surface. The
// content is authored by hand (the plan allows "by hand or a one-off script") and
// kept accurate to the real project; refresh it if the project's story changes.

export const DEMO_REPO_OWNER = "Lakshya565";
export const DEMO_REPO_NAME = "RepoFrame";
export const DEMO_REPO_URL = "https://github.com/Lakshya565/RepoFrame";

// True when a visitor should see the demo instead of the live app: production
// (Supabase configured) AND signed out. In local dev (unconfigured → status
// "disabled") the normal no-login flow runs, so the demo never shows.
export function isDemoActive(status: AuthStatus, configured: boolean): boolean {
  return configured && status === "signedOut";
}

export const DEMO_PROJECT: ProjectDetail = {
  id: "demo",
  owner: DEMO_REPO_OWNER,
  repo: DEMO_REPO_NAME,
  normalizedUrl: DEMO_REPO_URL,
  defaultBranch: "main",
  isPrivate: false,
  createdAt: "2026-07-06T00:00:00Z",
  updatedAt: "2026-07-06T00:00:00Z",
  metadata: {
    owner: DEMO_REPO_OWNER,
    repo: DEMO_REPO_NAME,
    normalizedUrl: DEMO_REPO_URL,
    name: "RepoFrame",
    description:
      "Frame your project around what you actually built by turning your project repo into a clear, evidence-backed story.",
    defaultBranch: "main",
    stars: 0,
    forks: 0,
    language: "TypeScript",
    htmlUrl: DEMO_REPO_URL,
    topics: ["nextjs", "fastapi", "openai", "developer-tools"],
    license: null,
  },
  userContext: {
    purpose: "A portfolio piece and a genuinely useful tool for other developers.",
    targetUser: "Developers writing up their own projects for resumes and portfolios.",
    technicalFocus:
      "The evidence pipeline (deterministic file ranking + stack detection) and grounded LLM generation.",
    collaboration: "solo",
    contribution: "Sole author — designed and built the full stack end to end.",
    hardestPart:
      "Keeping generation grounded: budgeting the evidence sent to the model and verifying every claim against real repo content.",
    impact:
      "Turns an hour of manual resume/README writing into an evidence-backed draft in under a minute.",
    guardrails:
      "Do not claim production users, scale, or metrics the repository cannot prove.",
  },
  profile: {
    projectName: "RepoFrame",
    twoSentenceSummary:
      "RepoFrame is a full-stack repository analysis platform that turns GitHub projects into evidence-backed resume bullets, README copy, portfolio content, LinkedIn descriptions, and interview preparation. It combines deterministic repository analysis with bounded AI generation and an optional tool-using audit so developers can explain what they built without relying on vague or unsupported claims.",
    problem:
      "Developers often understand their own code but struggle to turn it into a concise, accurate project story. Generic writing tools usually see only a short prompt or README, which can lead to vague summaries, missed architectural decisions, or claims about ownership and impact that the repository cannot actually prove.",
    solution:
      "RepoFrame separates repository-backed facts from user-provided context. It analyzes metadata, language totals, the recursive tree, manifests, configuration files, README content, and selected source files; ranks the most useful evidence; fits that evidence to the complete prompt budget; and uses a structured project profile to generate multiple reusable outputs. An optional Evidence Investigator can then search the repository index and read additional safe text files before classifying generated claims by support level.",
    detectedTechStack: [
      "TypeScript",
      "Next.js",
      "React",
      "Python",
      "FastAPI",
      "Pydantic",
      "OpenAI",
      "Tailwind CSS",
      "Supabase",
      "PostgreSQL",
      "GitHub REST API",
      "Recharts",
    ],
    coreFeatures: [
      "Progressive repository analysis covering metadata, recursive structure, ranked files, technology evidence, and commit activity",
      "Deterministic file filtering and ranking that prioritizes documentation, manifests, configuration, tests, entry points, and important source files",
      "Technology detection based on GitHub languages, file paths, dependency manifests, configuration files, README references, and selected contents",
      "Structured generation of resume bullets, README introductions, portfolio blurbs, LinkedIn descriptions, and interview preparation",
      "Per-section regeneration and revision that reuses the current project profile instead of repeating the entire analysis",
      "An Evidence Investigator with bounded read-only tools for listing paths, reading safe text files, and searching collected evidence",
      "GitHub authentication, private-repository authorization, saved-project history, and reopening of previously generated work",
      "Persistent token accounting and per-user and global model-call quotas for controlling API spend",
    ],
    technicalHighlights: [
      "A bounded evidence pipeline caps selected files, individual file size, total evidence characters, and the fully rendered request before any paid model call",
      "One progressive server-sent event stream delivers metadata, structure, ranked files, and technology results before deferred commit statistics finish",
      "Bounded LRU caches, stale-while-revalidate behavior, GitHub ETags, and single-flight coordination reduce repeated upstream repository work",
      "Public repositories and user-authorized private repositories use separate cache scopes so private results cannot be shared across users",
      "GitHub OAuth establishes identity while a separate GitHub App grants fine-grained, short-lived repository access",
      "Pydantic validates request bodies, structured model responses, and stored project snapshots at backend trust boundaries",
      "Each Analysis card owns its loading and error state, preventing one malformed or delayed upstream response from crashing the entire route",
      "The signed-in workspace persists repository context, generated outputs, interview preparation, guidance, and audit results through Supabase",
    ],
    userContribution:
      "Sole author: designed the product architecture, repository-analysis and evidence-selection pipelines, FastAPI services, model workflows, authentication and persistence boundaries, performance strategy, and the complete Next.js interface.",
    technicalChallenges: [
      "Selecting enough repository evidence to explain the project accurately without sending an entire codebase to the model",
      "Separating facts proven by code from personal contribution, intent, and impact that require user context",
      "Building a meaningful tool-using verification loop without giving the investigator unsafe repository or execution access",
      "Keeping progressive analysis responsive while GitHub's lazily computed commit statistics can be significantly slower than ordinary endpoints",
      "Preventing duplicate GitHub work across components, tab switches, cache misses, and concurrent requests",
      "Maintaining authentication, private-repository authorization, persistence, and model-cost boundaries across independently deployed services",
    ],
    resumeAngles: [
      "Built an end-to-end developer platform with Next.js, TypeScript, FastAPI, Python, Supabase, GitHub, and OpenAI",
      "Designed deterministic repository ranking and bounded evidence selection to ground language-model generation in real source material",
      "Implemented a read-only agentic verification workflow that can gather additional evidence before classifying generated claims",
      "Reduced initial Analysis orchestration from six independent browser requests to one progressive core stream and one deferred commit request",
      "Added bounded caching, ETag revalidation, and single-flight request deduplication to reduce repeated GitHub work",
      "Built secure authentication, private-repository access, saved history, token accounting, and model-call quotas across Vercel, Render, and Supabase",
    ],
    evidence: [
      {
        claim: "Deterministic file ranking drives evidence selection",
        source: "backend/app/services/file_ranker.py",
      },
      {
        claim: "Tech stack is detected from real repository content",
        source: "backend/app/services/tech_stack_detector.py",
      },
      {
        claim: "The complete rendered model request is fitted to a hard prompt budget",
        source: "backend/app/services/prompt_budget.py",
      },
      {
        claim: "One shared analysis service streams repository stages and reuses cached snapshots",
        source: "backend/app/services/analysis_service.py",
      },
      {
        claim: "GitHub access uses conditional requests, typed failures, and bounded statistics retries",
        source: "backend/app/services/github_service.py",
      },
      {
        claim: "The Evidence Investigator exposes bounded read-only repository tools",
        source: "backend/app/services/evidence_investigator.py",
      },
      {
        claim: "Generated claims receive structured support verdicts",
        source: "backend/app/services/claim_verifier.py",
      },
      {
        claim: "Saved projects are scoped to the verified Supabase user",
        source: "backend/app/services/project_store.py",
      },
      {
        claim: "Model usage is recorded through a persistent token ledger",
        source: "backend/app/services/usage_store.py",
      },
    ],
  },
  outputs: {
    resumeBullets: [
      "Built RepoFrame, a full-stack repository analysis platform using Next.js, TypeScript, FastAPI, and Python that converts GitHub projects into structured profiles, resume bullets, README copy, portfolio blurbs, LinkedIn descriptions, and interview preparation grounded in repository evidence.",
      "Designed a deterministic evidence pipeline that analyzes GitHub metadata, language totals, recursive file trees, README content, manifests, configuration files, and selected source files, then filters and ranks high-value evidence before any language-model request.",
      "Implemented a budget-aware OpenAI generation workflow that separates code-backed facts from user-provided contribution and impact context, validates structured responses with Pydantic, and reuses a shared project profile across generation and revision workflows.",
      "Developed an Agentic Audit through a bounded Evidence Investigator that can list authorized repository paths, read safe text files, search accumulated evidence, and classify claims as supported, partially supported, unsupported, or requiring user confirmation.",
      "Improved Analysis-page performance by replacing six independent browser requests with one progressive server-sent event stream plus deferred commit activity, backed by bounded LRU caching, stale revalidation, GitHub ETags, and single-flight request deduplication.",
      "Implemented Supabase authentication and saved-project persistence, fine-grained private-repository access through a GitHub App, persistent token accounting, and per-user and global model-call quotas while keeping secret-bearing operations inside the FastAPI backend.",
    ],
    readmeIntro:
      "# RepoFrame\n\nRepoFrame turns a GitHub repository into project writeups you can actually defend. It analyzes repository metadata, language totals, structure, documentation, dependency manifests, configuration files, and selected source files before producing a structured project profile and generating resume bullets, README copy, portfolio content, LinkedIn descriptions, and interview preparation.\n\nThe core difference is the evidence pipeline around the model. RepoFrame deterministically filters and ranks repository files, detects technologies from multiple signals, keeps repository facts separate from user-provided contribution and impact context, and fits the complete request within a bounded prompt budget. This keeps generation focused on the most useful source material instead of sending an entire codebase or relying on a repository description alone.\n\nAn optional Agentic Audit uses a bounded, read-only Evidence Investigator to examine the initial evidence, search the authorized repository index, read additional safe text files when necessary, and classify generated claims by how strongly the available evidence supports them. The investigator cannot modify the repository, execute code, or access arbitrary resources.\n\nRepoFrame is built with Next.js, React, TypeScript, Tailwind CSS, FastAPI, Python, Pydantic, Supabase, the GitHub REST API, a GitHub App, and OpenAI. Progressive analysis, cache reuse, ETag revalidation, request deduplication, isolated card failures, saved history, token accounting, and model-call quotas support a responsive and controlled end-to-end workflow.",
    portfolioBlurb:
      "RepoFrame is a full-stack developer platform I designed and built to turn GitHub repositories into clear, evidence-backed project narratives. It addresses a common problem for developers: understanding a project deeply but struggling to explain its architecture, technical decisions, and personal contribution without becoming vague or overstating what the code proves.\n\nThe application uses the GitHub REST API to analyze repository metadata, languages, file structure, README content, manifests, configuration, and selected source files. A deterministic ranking pipeline prioritizes useful evidence and removes low-value repository noise before a bounded OpenAI workflow builds a structured project profile. That profile becomes the shared source for resume bullets, README introductions, portfolio blurbs, LinkedIn descriptions, section-level revisions, and interview talking points.\n\nI also implemented an optional Evidence Investigator that performs a bounded Agentic Audit. It can search the authorized repository index and read additional safe text files when the initial evidence is not enough, then labels important generated claims by their support level and explains the result.\n\nThe system uses a Next.js and TypeScript frontend, a FastAPI and Python backend, Supabase authentication and PostgreSQL persistence, GitHub OAuth for identity, and a GitHub App for fine-grained repository access. Progressive streaming, bounded caches, ETags, single-flight request deduplication, lazy rendering, saved-project history, token accounting, and model-call quotas improve responsiveness and control operating cost. In my own workflow, RepoFrame can turn roughly an hour of manual project-writeup work into an evidence-backed first draft in under a minute.",
    linkedinDescription:
      "I built RepoFrame, a full-stack repository analysis platform that helps developers turn GitHub projects into clear, accurate, and reusable project writeups. The idea came from a problem I kept seeing: developers often understand the code they wrote but struggle to explain it effectively on a resume, portfolio, README, LinkedIn profile, or in an interview. Generic AI writing tools can make that worse by producing vague descriptions or technical claims that the project does not actually support.\n\nRepoFrame analyzes the repository before it generates anything. It uses the GitHub REST API to collect metadata, language totals, the recursive file tree, README content, dependency manifests, configuration files, and selected source files. I built deterministic filtering and ranking logic to prioritize documentation, infrastructure, entry points, tests, manifests, and important implementation files while excluding generated content, binaries, dependency directories, and other low-value context.\n\nThe selected evidence passes through a bounded prompt-building pipeline that limits file counts, individual file sizes, total evidence, and the complete rendered request. Repository-backed facts stay separate from user-provided context such as personal contribution, team role, intent, challenges, or impact. OpenAI's GPT-5.6 Luna model then constructs a validated project profile that becomes the source for resume bullets, README introductions, portfolio blurbs, LinkedIn descriptions, individual revisions, and interview preparation.\n\nI also built an optional Evidence Investigator for the Agentic Audit. Instead of asking the model to verify itself in one prompt, the investigator can use bounded, read-only tools to list authorized repository paths, search accumulated evidence, and inspect additional safe text files. It then classifies generated claims as supported, partially supported, unsupported, or requiring user confirmation and returns the evidence and explanation behind each verdict.\n\nThe frontend uses Next.js, React, TypeScript, Tailwind CSS, Motion, and Recharts. The backend uses FastAPI, Python, Pydantic, the GitHub API, and OpenAI. Supabase provides GitHub authentication and PostgreSQL persistence, while a separate GitHub App grants fine-grained access to selected public or private repositories. Secret-bearing API calls and authorization decisions remain inside the backend.\n\nI spent significant time on performance and reliability as the project grew. I replaced six independent Analysis requests with one progressive server-sent event stream plus deferred commit activity, added bounded LRU caches and stale-while-revalidate behavior, reused GitHub HTTP sessions, implemented ETag revalidation, and collapsed concurrent duplicate requests through single-flight coordination. Individual cards keep independent loading and error states so one slow or malformed upstream response does not take down the entire page.\n\nRepoFrame also supports saved-project history, reopening completed work without paying for another generation, per-section regeneration, token accounting, per-user and global model-call quotas, private cache isolation, and a signed-in workflow that persists project context, outputs, interview preparation, guidance, and audit results. In my own workflow, it can turn roughly an hour of manual project-writeup work into an evidence-backed first draft in under a minute.\n\nThe project taught me that building a trustworthy AI feature is mostly about the system surrounding the model: deciding what evidence matters, enforcing request limits, separating code-backed facts from human context, validating structured output, handling partial failures, preserving authorization boundaries, and making the model's conclusions inspectable rather than treating generated text as automatically correct.",
  },
  interviewTopics: [
    {
      question:
        "How do you keep the generated writeups grounded instead of hallucinated?",
      talkingPoints: [
        "Repository URL parsing, GitHub access, file filtering, ranking, stack detection, and evidence limits are deterministic rather than delegated to the model.",
        "The model receives selected README, configuration, manifest, and source excerpts together with explicit source paths instead of an unstructured repository dump.",
        "Repository evidence and user context are separate evidence classes, so code is not used to invent personal ownership, intent, team role, or business impact.",
        "Pydantic validates structured model responses, and the optional Evidence Investigator gives important claims a separate support verdict.",
      ],
    },
    {
      question: "How is generation cost controlled?",
      talkingPoints: [
        "The backend limits selected files, characters per file, total evidence characters, and the complete rendered prompt before calling OpenAI.",
        "Higher-ranked evidence is preserved first, truncated excerpts are marked, and requests that cannot fit safely are rejected before spending tokens.",
        "Generation remains button-triggered, while interview preparation, revisions, and the Agentic Audit are separate explicit actions.",
        "Actual prompt, completion, reasoning, and total tokens are persisted, and Supabase-backed per-user and global model-call quotas cap daily spend.",
      ],
    },
    {
      question: "How does RepoFrame decide which repository files matter?",
      talkingPoints: [
        "It fetches structure before broad file contents, which makes the first ranking pass inexpensive and deterministic.",
        "Filtering removes generated assets, binaries, dependency folders, lockfile noise, and unsupported file types.",
        "Ranking rewards README files, manifests, configuration, infrastructure, tests, entry points, and important source paths with explicit reasons.",
        "The Evidence Investigator can later search the allowlisted tree when a particular claim needs evidence outside the initial bundle.",
      ],
    },
    {
      question: "Why is the Evidence Investigator genuinely agentic?",
      talkingPoints: [
        "The model receives a bounded set of read-only tools rather than a prewritten chain of repository lookups.",
        "It decides whether the initial evidence is sufficient, which search to perform, and which safe text file needs closer inspection.",
        "Tool turns, searches, additional file reads, and model calls are bounded to control latency, cost, and access scope.",
        "A separate tool-free verdict step compiles the gathered evidence into consistent supported, partial, confirmation-required, or unsupported classifications.",
      ],
    },
    {
      question: "What did you do to improve Analysis-page performance?",
      talkingPoints: [
        "The first design made six independent browser requests and repeated repository discovery work across components.",
        "The current backend builds one core snapshot and streams metadata, structure, ranking, and technology results progressively, then starts commit activity separately.",
        "Bounded LRU caches, five-minute freshness, stale-while-revalidate behavior, ETags, reusable GitHub sessions, and single-flight coordination reduce repeat work.",
        "The frontend keeps a small session cache across tabs, lazy-loads the repository tree and chart, and renders only expanded tree branches.",
      ],
    },
    {
      question: "How do authentication and private-repository access work?",
      talkingPoints: [
        "Supabase GitHub OAuth establishes user identity, and the FastAPI backend verifies the bearer token before trusting the user ID.",
        "A separate GitHub App handles repository authorization and issues fine-grained, short-lived installation tokens for selected repositories.",
        "Private cache keys include the verified user and GitHub installation, while frontend private session data clears on sign-out.",
        "OpenAI credentials, the Supabase service-role key, GitHub App private keys, and installation tokens never enter the browser bundle or saved project records.",
      ],
    },
    {
      question: "What are RepoFrame's main limitations and next improvements?",
      talkingPoints: [
        "The Evidence Investigator can still miss a weak claim because tool choice and evidence interpretation remain model decisions.",
        "Process-memory caches are simple and effective for the current workload but reset during deploys and are not shared across multiple backend replicas.",
        "GitHub commit statistics can be slow or temporarily unavailable because GitHub computes them lazily, so the chart remains intentionally isolated and retryable.",
        "A future labeled evaluation set would be needed before making accuracy, precision, or recall claims about the audit workflow.",
      ],
    },
  ],
  allGuidance: "",
  verifications: [
    {
      claim:
        "Built a full-stack repository analysis platform with Next.js, TypeScript, FastAPI, and Python that generates multiple evidence-backed project writeups",
      status: "supported",
      sections: [
        "resumeBullets",
        "readmeIntro",
        "portfolioBlurb",
        "linkedinDescription",
      ],
      supportingEvidence: [
        "backend/app/main.py",
        "backend/app/services/output_generator.py",
        "frontend/src/components/project-writeup-section.tsx",
      ],
      explanation:
        "The backend exposes the generation workflow, while the frontend renders the profile, resume, README, portfolio, LinkedIn, and interview-preparation surfaces described in the claim.",
      suggestedRevision: null,
    },
    {
      claim:
        "Designed a deterministic GitHub evidence pipeline that filters and ranks repository files and detects the technology stack from multiple repository signals",
      status: "supported",
      sections: [
        "resumeBullets",
        "readmeIntro",
        "portfolioBlurb",
        "linkedinDescription",
      ],
      supportingEvidence: [
        "backend/app/services/github_service.py",
        "backend/app/services/file_ranker.py",
        "backend/app/services/tech_stack_detector.py",
      ],
      explanation:
        "The GitHub service gathers repository inputs, the ranker scores high-value paths with explicit reasons, and stack detection combines languages, filenames, manifests, configuration, README references, and selected file contents.",
      suggestedRevision: null,
    },
    {
      claim:
        "Implemented a budget-aware OpenAI workflow that separates repository evidence from user context and validates structured generation results with Pydantic",
      status: "supported",
      sections: [
        "resumeBullets",
        "readmeIntro",
        "portfolioBlurb",
        "linkedinDescription",
      ],
      supportingEvidence: [
        "backend/app/services/prompt_budget.py",
        "backend/app/services/prompt_format.py",
        "backend/app/services/profile_generator.py",
      ],
      explanation:
        "The prompt pipeline applies a complete request budget, formats repository and user-provided evidence separately, and parses the result into the backend's structured project-profile model.",
      suggestedRevision: null,
    },
    {
      claim:
        "Built a bounded Agentic Audit that can search authorized repository paths, read safe text files, and return structured support verdicts",
      status: "supported",
      sections: [
        "resumeBullets",
        "readmeIntro",
        "portfolioBlurb",
        "linkedinDescription",
      ],
      supportingEvidence: [
        "backend/app/services/evidence_investigator.py",
        "backend/app/services/claim_verifier.py",
      ],
      explanation:
        "The investigator defines allowlisted read-only repository tools with bounded calls and file reads, and the verifier converts the gathered material into supported, partial, confirmation-required, or unsupported findings.",
      suggestedRevision: null,
    },
    {
      claim:
        "Reduced the initial Analysis workflow from six browser requests to one progressive core stream plus one deferred commit-activity request",
      status: "supported",
      sections: ["resumeBullets", "portfolioBlurb", "linkedinDescription"],
      supportingEvidence: [
        "backend/app/services/analysis_service.py",
        "backend/app/routers/repo.py",
        "frontend/src/lib/analysis-context.tsx",
      ],
      explanation:
        "The backend builds and streams a shared core-analysis snapshot, while the frontend consumes that stream and starts the independently retryable commit request after core analysis completes.",
      suggestedRevision: null,
    },
    {
      claim:
        "Implemented signed-in project history, private-repository access, persistent token accounting, and model-call quotas without exposing service credentials to the frontend",
      status: "supported",
      sections: [
        "resumeBullets",
        "readmeIntro",
        "portfolioBlurb",
        "linkedinDescription",
      ],
      supportingEvidence: [
        "backend/app/services/auth.py",
        "backend/app/services/project_store.py",
        "backend/app/services/github_app.py",
        "backend/app/services/usage_store.py",
        "backend/app/services/rate_limit.py",
      ],
      explanation:
        "The backend verifies Supabase identity, scopes stored projects to that user, brokers GitHub App installation access, records model usage, and enforces persistent usage limits using server-side credentials.",
      suggestedRevision: null,
    },
    {
      claim:
        "In my own workflow, RepoFrame can turn roughly an hour of manual project-writeup work into an evidence-backed first draft in under a minute",
      status: "needs_user_confirmation",
      sections: ["portfolioBlurb", "linkedinDescription"],
      supportingEvidence: [],
      explanation:
        "The repository proves the automated workflow, but it cannot verify the author's previous manual baseline or the measured end-to-end completion time. This personal outcome should be confirmed by the user before publication.",
      suggestedRevision:
        "RepoFrame streamlines manual project-writeup work into an evidence-backed first draft.",
    },
    {
      claim:
        "Added bounded caching, stale revalidation, GitHub ETags, and single-flight coordination to reduce repeated repository work",
      status: "supported",
      sections: ["resumeBullets", "readmeIntro", "portfolioBlurb", "linkedinDescription"],
      supportingEvidence: [
        "backend/app/services/analysis_service.py",
        "backend/app/services/github_service.py",
      ],
      explanation:
        "The shared analysis service owns bounded repository caches and concurrent-build coordination, while GitHub requests preserve validators for conditional revalidation of unchanged resources.",
      suggestedRevision: null,
    },
  ],
  verificationModel: null,
};
