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
      "RepoFrame turns a GitHub repository into evidence-backed project writeups — resume bullets, README sections, portfolio blurbs, and interview prep. Every claim is tied back to real repository content the user can verify.",
    problem:
      "Developers struggle to describe their own projects accurately: writeups are either vague or overstate what the code actually shows.",
    solution:
      "A deterministic evidence pipeline reads the repo's most relevant files and detected stack, then a budget-bounded LLM step generates writeups grounded in that evidence, with an agent that verifies each claim.",
    detectedTechStack: [
      "TypeScript",
      "Next.js",
      "React",
      "Python",
      "FastAPI",
      "OpenAI",
      "Tailwind CSS",
    ],
    coreFeatures: [
      "Deterministic file ranking and tech-stack detection from real repository content",
      "Grounded generation of resume bullets, README intro, portfolio blurb, and LinkedIn copy",
      "Agentic claim verification that labels each statement by how well the evidence supports it",
      "Per-analysis and lifetime token metering so generation cost is always visible",
    ],
    technicalHighlights: [
      "A prompt-budget guard caps the characters of evidence sent to the model, bounding cost per analysis",
      "Streamed verification progress surfaces the agent's real tool calls as they happen",
      "A stateless-JWT auth boundary (Supabase) verified against the project's public JWKS",
    ],
    userContribution:
      "Sole author: designed the evidence pipeline, backend services, and the entire frontend.",
    technicalChallenges: [
      "Bounding LLM spend without starving the model of the evidence it needs",
      "Verifying generated claims against selected repo evidence rather than trusting the model",
    ],
    resumeAngles: [
      "Built a full-stack developer tool (Next.js + FastAPI) that generates evidence-backed project writeups",
      "Designed a budget-bounded LLM pipeline with agentic claim verification",
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
        claim: "A prompt-budget guard bounds cost per analysis",
        source: "backend/app/services/token_estimator.py",
      },
    ],
  },
  outputs: {
    resumeBullets: [
      "Built RepoFrame, a full-stack developer tool (Next.js + FastAPI) that turns any GitHub repository into evidence-backed resume bullets, README sections, and interview prep.",
      "Designed a deterministic evidence pipeline that ranks the most relevant files and detects the tech stack from real repository content rather than guesses.",
      "Implemented a budget-bounded LLM generation step with an agent that verifies each generated claim against the selected repo evidence.",
      "Added per-analysis and lifetime token metering so generation cost is transparent at every step.",
    ],
    readmeIntro:
      "# RepoFrame\n\nRepoFrame turns a GitHub repository into writeups you can defend. It reads a repo's structure, files, and detected tech stack, then generates resume bullets, README sections, portfolio blurbs, and interview prep — each tied to evidence you can verify, not generic AI filler.",
    portfolioBlurb:
      "RepoFrame is a developer tool that reads a GitHub repository and produces evidence-backed project writeups. A deterministic pipeline selects the most relevant files and detects the stack; a budget-bounded generation step then drafts resume bullets, README copy, and interview prep, with an agent that checks every claim against the repo itself.",
    linkedinDescription:
      "I built RepoFrame — a tool that turns a GitHub repo into an evidence-backed project writeup. It reads real repository content, detects the stack, and generates resume bullets, README sections, and interview prep, then verifies each claim against the code. Built with Next.js and FastAPI.",
  },
  interviewTopics: [
    {
      question:
        "How do you keep the generated writeups grounded instead of hallucinated?",
      talkingPoints: [
        "A deterministic pipeline selects evidence (ranked files + detected stack) before any model call.",
        "A prompt-budget guard caps how much evidence is sent, bounding cost and focus.",
        "An agent verifies each claim against the selected evidence and labels its support level.",
      ],
    },
    {
      question: "How is generation cost controlled?",
      talkingPoints: [
        "Character-budget enforcement on the evidence bundle before the request.",
        "Per-analysis and lifetime token metering surfaced in the UI.",
        "Verification and interview prep are opt-in, so nothing spends tokens by default.",
      ],
    },
  ],
  allGuidance: "",
  verifications: [
    {
      claim:
        "Built a full-stack developer tool (Next.js + FastAPI) that generates evidence-backed project writeups",
      status: "supported",
      sections: ["resumeBullets"],
      supportingEvidence: ["backend/app/main.py", "frontend/src/app/page.tsx"],
      explanation:
        "The repository contains both a Next.js frontend and a FastAPI backend implementing the described flow.",
      suggestedRevision: null,
    },
    {
      claim:
        "Added per-analysis and lifetime token metering so generation cost is transparent",
      status: "supported",
      sections: ["resumeBullets"],
      supportingEvidence: ["backend/app/services/usage_store.py"],
      explanation: "A lifetime usage ledger and per-analysis meter back this claim.",
      suggestedRevision: null,
    },
  ],
  verificationModel: null,
};
