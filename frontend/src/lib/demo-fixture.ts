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
      "Built RepoFrame, a full-stack Next.js, TypeScript, FastAPI, and Python platform that turns GitHub repositories into evidence-backed resume, README, portfolio, LinkedIn, and interview content.",
      "Designed a deterministic analysis pipeline that ingests repository metadata, structure, documentation, manifests, configuration, and selected source files, then filters and ranks the strongest evidence before generation.",
      "Implemented a budget-aware OpenAI workflow that separates repository facts from user-provided context, validates structured responses with Pydantic, and reuses a shared project profile for targeted revisions.",
      "Developed a bounded Agentic Audit that searches authorized paths, reads safe text files, and classifies generated claims by evidence strength without modifying or executing repository code.",
      "Improved reliability and speed with progressive analysis streaming, deferred commit statistics, bounded caching, ETag revalidation, isolated card failures, Supabase history, and GitHub App authorization.",
    ],
    readmeIntro:
      "# RepoFrame\n\nRepoFrame turns a GitHub repository into project writeups a developer can explain and defend. It analyzes repository metadata, structure, documentation, manifests, configuration, and selected source files, then uses that evidence to generate resume bullets, README copy, portfolio blurbs, LinkedIn descriptions, and interview preparation.\n\nBefore generation, RepoFrame filters low-value files, ranks the most useful evidence, detects the technology stack from multiple repository signals, and fits the complete request within a bounded prompt budget. Repository facts stay separate from user-provided context such as contribution, intent, and impact.\n\nAn optional Agentic Audit can search authorized repository paths and read additional safe text files before labeling claims by support level. The platform combines a Next.js and TypeScript frontend with FastAPI, Python, Pydantic, Supabase, GitHub, and OpenAI, with progressive analysis, cache reuse, saved history, and usage controls supporting the workflow.",
    portfolioBlurb:
      "RepoFrame is a full-stack developer platform I designed and built to turn GitHub repositories into clear, evidence-backed project narratives. It analyzes repository structure, documentation, manifests, configuration, and selected source files, then ranks the strongest evidence before building a reusable project profile. That profile powers resume bullets, README copy, portfolio and LinkedIn descriptions, revisions, and interview preparation without treating the repository description as the complete story.\n\nThe application uses Next.js and TypeScript on the frontend, FastAPI and Python on the backend, Supabase for authentication and persistence, a GitHub App for fine-grained repository access, and OpenAI for structured generation. I also built a bounded Evidence Investigator that can search authorized paths and inspect additional safe files before rating important claims. Progressive streaming, cache reuse, and isolated loading failures keep the analysis responsive. In my own workflow, RepoFrame can turn roughly an hour of manual project-writeup work into an evidence-backed first draft in under a minute.",
    linkedinDescription:
      "I built RepoFrame, a full-stack repository analysis platform that helps developers turn GitHub projects into clear, reusable project writeups. The goal was to solve a problem I kept seeing: developers understand their code but often struggle to explain the architecture, decisions, and personal contribution without becoming vague or overstating what the repository proves.\n\nRepoFrame analyzes the project before generating anything. It collects repository metadata, structure, documentation, manifests, configuration, and selected source files, then applies deterministic filtering and ranking to prioritize useful evidence. A bounded prompt pipeline keeps repository-backed facts separate from user context and uses GPT-5.6 Luna to create a validated project profile for resume, README, portfolio, LinkedIn, revision, and interview workflows.\n\nFor the Agentic Audit, I built a read-only Evidence Investigator that can search authorized repository paths and inspect additional safe text files when the initial evidence is not enough. It returns supported, partial, unsupported, or user-confirmation verdicts with the evidence behind each decision.\n\nRepoFrame uses Next.js, TypeScript, Tailwind CSS, FastAPI, Python, Pydantic, Supabase, GitHub, and OpenAI. To keep analysis responsive, I replaced several independent requests with a progressive core stream, deferred slower commit statistics, reused cached snapshots, and isolated card failures. Saved history, GitHub App authorization, token accounting, and model-call quotas make the workflow reusable while keeping credentials and paid operations in the backend.",
  },
  interviewTopics: [
    {
      question:
        "How do you keep the generated writeups grounded instead of hallucinated?",
      talkingPoints: [
        "Repository parsing, file filtering, ranking, stack detection, and evidence limits are deterministic rather than delegated to the model.",
        "The model receives selected excerpts with source paths, while personal contribution and impact remain clearly labeled as user context.",
        "Pydantic validates structured responses, and the optional Agentic Audit gives important claims a separate support verdict.",
      ],
    },
    {
      question: "How does RepoFrame decide what repository evidence matters?",
      talkingPoints: [
        "RepoFrame fetches the repository tree first, removes generated or unsupported files, and ranks the remaining paths before reading broad contents.",
        "Documentation, manifests, configuration, tests, entry points, and important source paths receive explicit ranking reasons.",
        "File counts, excerpt sizes, total evidence, and the complete prompt are bounded so stronger evidence survives first.",
      ],
    },
    {
      question: "Why is the Evidence Investigator genuinely agentic?",
      talkingPoints: [
        "The model receives bounded read-only tools instead of a fixed sequence of repository lookups.",
        "It decides whether to search the authorized tree or inspect an additional safe text file before reaching a verdict.",
        "Tool turns and file reads are capped, and a separate verdict step converts gathered evidence into consistent support classifications.",
      ],
    },
    {
      question: "What did you do to improve Analysis-page performance?",
      talkingPoints: [
        "The backend builds one shared core snapshot and streams analysis stages progressively instead of repeating repository discovery across cards.",
        "Commit activity remains separate because GitHub may compute those statistics slowly, so it cannot block the core page.",
        "Bounded caches, ETags, request deduplication, lazy rendering, and card-level error isolation improve repeat loads and resilience.",
      ],
    },
    {
      question: "What security and product tradeoffs did you make?",
      talkingPoints: [
        "Supabase handles identity and saved history, while a separate GitHub App grants fine-grained repository access with short-lived tokens.",
        "Secret-bearing requests and authorization decisions stay in FastAPI, and private cache entries are scoped to the verified user and installation.",
        "The investigator can still miss a claim, and process-memory caches reset on deploys; both are honest limitations rather than hidden guarantees.",
      ],
    },
  ],
  allGuidance: "",
  verifications: [
    {
      claim:
        "Built RepoFrame, a full-stack Next.js, TypeScript, FastAPI, and Python platform that turns GitHub repositories into evidence-backed resume, README, portfolio, LinkedIn, and interview content.",
      status: "supported",
      sections: ["resumeBullets"],
      supportingEvidence: [
        "backend/app/main.py",
        "backend/app/services/output_generator.py",
        "frontend/src/components/project-writeup-section.tsx",
      ],
      explanation:
        "The repository contains the FastAPI generation routes and services alongside the Next.js interface that renders each listed output type.",
      suggestedRevision: null,
    },
    {
      claim:
        "Before generation, RepoFrame filters low-value files, ranks the most useful evidence, detects the technology stack from multiple repository signals, and fits the complete request within a bounded prompt budget.",
      status: "supported",
      sections: ["readmeIntro"],
      supportingEvidence: [
        "backend/app/services/file_ranker.py",
        "backend/app/services/tech_stack_detector.py",
        "backend/app/services/prompt_budget.py",
      ],
      explanation:
        "Dedicated services implement deterministic file scoring, multi-signal stack detection, and complete rendered-request budget fitting before generation.",
      suggestedRevision: null,
    },
    {
      claim:
        "For the Agentic Audit, I built a read-only Evidence Investigator that can search authorized repository paths and inspect additional safe text files when the initial evidence is not enough.",
      status: "supported",
      sections: ["linkedinDescription"],
      supportingEvidence: [
        "backend/app/services/evidence_investigator.py",
        "backend/app/services/claim_verifier.py",
      ],
      explanation:
        "The investigator exposes bounded list, search, and safe-file read tools over the authorized repository index before a separate verdict step.",
      suggestedRevision: null,
    },
    {
      claim:
        "To keep analysis responsive, I replaced several independent requests with a progressive core stream, deferred slower commit statistics, reused cached snapshots, and isolated card failures.",
      status: "supported",
      sections: ["linkedinDescription"],
      supportingEvidence: [
        "backend/app/services/analysis_service.py",
        "backend/app/routers/repo.py",
        "frontend/src/lib/analysis-context.tsx",
      ],
      explanation:
        "The backend streams a reusable core snapshot, while the frontend starts commit activity separately and keeps each Analysis card behind its own failure boundary.",
      suggestedRevision: null,
    },
    {
      claim:
        "Saved history, GitHub App authorization, token accounting, and model-call quotas make the workflow reusable while keeping credentials and paid operations in the backend.",
      status: "supported",
      sections: ["linkedinDescription"],
      supportingEvidence: [
        "backend/app/services/project_store.py",
        "backend/app/services/github_app.py",
        "backend/app/services/usage_store.py",
        "backend/app/services/rate_limit.py",
      ],
      explanation:
        "Backend services scope saved projects, broker GitHub App access, record model usage, and enforce persistent call limits without returning service credentials to the browser.",
      suggestedRevision: null,
    },
    {
      claim:
        "In my own workflow, RepoFrame can turn roughly an hour of manual project-writeup work into an evidence-backed first draft in under a minute.",
      status: "needs_user_confirmation",
      sections: ["portfolioBlurb"],
      supportingEvidence: [],
      explanation:
        "The repository proves the automated workflow, but it cannot verify the author's previous manual baseline or the measured end-to-end completion time. This personal outcome should be confirmed by the user before publication.",
      suggestedRevision:
        "RepoFrame streamlines manual project-writeup work into an evidence-backed first draft.",
    },
  ],
  verificationModel: null,
};
