import type { UserContext } from "@/lib/user-context";

export type ParsedRepoResponse = {
  owner: string;
  repo: string;
  normalizedUrl: string;
};

export type RepoMetadataResponse = ParsedRepoResponse & {
  name: string;
  description: string | null;
  defaultBranch: string;
  stars: number;
  forks: number;
  language: string | null;
  htmlUrl: string;
};

export type RepoFile = {
  path: string;
  type: "file" | "directory" | "submodule";
  size: number | null;
  url: string | null;
};

export type RepoTreeResponse = ParsedRepoResponse & {
  defaultBranch: string;
  files: RepoFile[];
  totalFiles: number;
  totalDirectories: number;
  isTruncated: boolean;
};

export type RankedRepoFile = {
  path: string;
  size: number | null;
  importanceScore: number;
  reasons: string[];
};

export type RepoFileRankingResponse = ParsedRepoResponse & {
  defaultBranch: string;
  rankedFiles: RankedRepoFile[];
  totalFiles: number;
  rankableFiles: number;
  returnedFiles: number;
};

export type TechStackEvidence = {
  source: string;
  detail: string;
  path: string | null;
};

export type DetectedTechnology = {
  name: string;
  category: string;
  confidence: number;
  evidence: TechStackEvidence[];
};

export type TechStackResponse = ParsedRepoResponse & {
  defaultBranch: string;
  technologies: DetectedTechnology[];
  evidenceFilesRead: number;
};

export type GitHubRateLimitResponse = {
  limit: number;
  used: number;
  remaining: number;
  reset: number;
  resetAt: string;
  isAuthenticated: boolean;
};

type ApiErrorResponse = {
  detail?: unknown;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

// Sends raw repo input to the backend parser and returns the normalized identity
// that downstream UI uses for display and routing.
export async function parseRepoUrl(
  repoUrl: string,
): Promise<ParsedRepoResponse> {
  return postRepoRequest(
    "/api/repo/parse",
    repoUrl,
    "RepoFrame could not parse that URL.",
  );
}

// Fetches the repo facts used by the summary card. Components call this helper
// instead of knowing backend URLs or response parsing details.
export async function fetchRepoMetadata(
  repoUrl: string,
): Promise<RepoMetadataResponse> {
  return postRepoRequest(
    "/api/repo/metadata",
    repoUrl,
    "RepoFrame could not fetch repository metadata.",
  );
}

// Fetches the recursive repository tree for the structure panel. The backend
// intentionally returns paths and metadata only, not file contents.
export async function fetchRepoTree(repoUrl: string): Promise<RepoTreeResponse> {
  return postRepoRequest(
    "/api/repo/tree",
    repoUrl,
    "RepoFrame could not fetch the repository file tree.",
  );
}

// Fetches the deterministic file ranking used by later evidence-gathering
// phases. The frontend displays backend reasons instead of reimplementing score
// rules in TypeScript.
export async function fetchRankedRepoFiles(
  repoUrl: string,
): Promise<RepoFileRankingResponse> {
  return postRepoRequest(
    "/api/repo/ranked-files",
    repoUrl,
    "RepoFrame could not rank important repository files.",
  );
}

// Fetches the deterministic Phase 6 stack detection results. The backend owns
// evidence gathering and confidence rules so the UI can stay display-focused.
export async function fetchTechStack(
  repoUrl: string,
): Promise<TechStackResponse> {
  return postRepoRequest(
    "/api/repo/tech-stack",
    repoUrl,
    "RepoFrame could not detect the repository tech stack.",
  );
}

// Fetches GitHub's current core REST API budget through FastAPI so the frontend
// can show usage without receiving the token itself.
export async function fetchGitHubRateLimit(): Promise<GitHubRateLimitResponse> {
  const response = await fetch(`${API_BASE_URL}/api/github/rate-limit`);

  return parseResponse(
    response,
    "RepoFrame could not fetch GitHub rate limit status.",
  );
}

// ── Phase 11: generated outputs ──────────────────────────────────────────────
// These mirror the backend generation schemas. The endpoints call OpenAI, so the
// UI only ever invokes them in response to an explicit user action.

export type ProfileEvidenceItem = {
  claim: string;
  source: string;
};

export type ProjectProfileData = {
  projectName: string;
  twoSentenceSummary: string;
  problem: string;
  solution: string;
  detectedTechStack: string[];
  coreFeatures: string[];
  technicalHighlights: string[];
  userContribution: string;
  technicalChallenges: string[];
  resumeAngles: string[];
  evidence: ProfileEvidenceItem[];
};

// Real OpenAI token usage for one generation (Phase 12). Mirrors the backend
// UsageTotals; reasoningTokens is the slice spent on hidden reasoning, broken out
// because it is where a reasoning model's cost mostly hides.
export type UsageTotals = {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

// Cumulative lifetime totals from GET /api/usage/total, plus how many generation
// runs the backend has recorded.
export type LifetimeUsage = UsageTotals & {
  runs: number;
};

export type GenerateProfileResponse = ParsedRepoResponse & {
  defaultBranch: string;
  profile: ProjectProfileData;
  model: string;
  estimatedInputTokens: number;
  evidenceFileCount: number;
  usage: UsageTotals;
};

// The four core output sections. Used to scope a regenerate to one section.
export type OutputSection =
  | "resumeBullets"
  | "readmeIntro"
  | "portfolioBlurb"
  | "linkedinDescription";

export type GeneratedOutputs = {
  resumeBullets: string[] | null;
  readmeIntro: string | null;
  portfolioBlurb: string | null;
  linkedinDescription: string | null;
};

export type GenerateOutputsResponse = {
  outputs: GeneratedOutputs;
  model: string;
  estimatedInputTokens: number;
  usage: UsageTotals;
};

export type InterviewTopic = {
  question: string;
  talkingPoints: string[];
};

export type GenerateInterviewPrepResponse = {
  topics: InterviewTopic[];
  model: string;
  estimatedInputTokens: number;
  usage: UsageTotals;
};

// Generates the structured project profile from a repo URL plus the user's
// questionnaire answers. This is the first paid OpenAI step and is only ever
// triggered by an explicit user action in the UI.
export async function generateProfile(
  repoUrl: string,
  userContext: UserContext,
): Promise<GenerateProfileResponse> {
  return postJson(
    "/api/generate/profile",
    { repoUrl, userContext },
    "RepoFrame could not generate a project profile.",
  );
}

// Generates the core written outputs from an existing profile. An optional
// sections list scopes a regenerate to a single output so the others are not
// regenerated (or paid for) again.
export async function generateOutputs(
  profile: ProjectProfileData,
  sections?: OutputSection[],
  guidance?: string,
): Promise<GenerateOutputsResponse> {
  return postJson(
    "/api/generate/outputs",
    { profile, sections, guidance },
    "RepoFrame could not generate outputs.",
  );
}

// Generates interview talking points from an existing profile. Called only when
// the user explicitly opts in, so it never spends tokens in the default flow.
export async function generateInterviewPrep(
  profile: ProjectProfileData,
  guidance?: string,
): Promise<GenerateInterviewPrepResponse> {
  return postJson(
    "/api/generate/interview-prep",
    { profile, guidance },
    "RepoFrame could not generate interview prep.",
  );
}

// Revises one existing section from the user's current draft plus an optional
// instruction (feedback-driven regenerate). Returns the same shape as
// generateOutputs with only the revised section populated.
export async function reviseOutput(
  profile: ProjectProfileData,
  section: OutputSection,
  currentText: string,
  instruction: string,
): Promise<GenerateOutputsResponse> {
  return postJson(
    "/api/generate/outputs/revise",
    { profile, section, currentText, instruction },
    "RepoFrame could not regenerate that section.",
  );
}

// ── Phase 12: claim verification + usage tracking ────────────────────────────

// How well one generated claim is backed by the repo evidence and user context.
// Matches the backend's closed status set so the UI can map each to a fixed badge.
export type ClaimStatus =
  | "supported"
  | "partially_supported"
  | "needs_user_confirmation"
  | "unsupported";

export type ClaimVerification = {
  claim: string;
  status: ClaimStatus;
  // The output tab(s) this claim appears in. A fact shared across tabs is
  // verified once and tagged with every tab it shows up in. Typed as string[]
  // (not OutputSection[]) because the value comes from the model.
  sections: string[];
  supportingEvidence: string[];
  explanation: string;
  suggestedRevision: string | null;
};

export type VerifyClaimsResponse = {
  verifications: ClaimVerification[];
  model: string;
  estimatedInputTokens: number;
  usage: UsageTotals;
};

// Runs the bounded verification agent over the generated outputs. Like interview
// prep this is opt-in (an explicit press), so it never spends tokens in the
// default flow. The backend rebuilds the repo evidence from the URL. An optional
// sections list scopes a per-tab verification to specific tabs; omit it to verify
// every tab that has content.
export async function verifyClaims(
  repoUrl: string,
  userContext: UserContext,
  outputs: GeneratedOutputs,
  sections?: OutputSection[],
): Promise<VerifyClaimsResponse> {
  return postJson(
    "/api/generate/verify",
    { repoUrl, userContext, outputs, sections },
    "RepoFrame could not verify the generated claims.",
  );
}

// Fetches the persistent lifetime token totals so the UI can show project spend
// without anyone opening the OpenAI dashboard.
export async function fetchLifetimeUsage(): Promise<LifetimeUsage> {
  const response = await fetch(`${API_BASE_URL}/api/usage/total`);

  return parseResponse(response, "RepoFrame could not fetch usage totals.");
}

// Posts an arbitrary JSON body and returns typed JSON or a useful Error. The
// generation endpoints take richer bodies than the shared { repoUrl } shape, so
// they use this instead of postRepoRequest.
async function postJson<T>(
  path: string,
  body: unknown,
  fallbackMessage: string,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return parseResponse(response, fallbackMessage);
}

// Posts to repo-analysis endpoints that share the same { repoUrl } request
// shape. This keeps component-level API functions short and consistent.
async function postRepoRequest<T>(
  path: string,
  repoUrl: string,
  fallbackMessage: string,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ repoUrl }),
  });

  return parseResponse(response, fallbackMessage);
}

// Converts a Fetch response into typed JSON or a useful Error. FastAPI returns
// { detail } for expected failures, so this preserves backend messages.
async function parseResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  if (!response.ok) {
    const errorBody = (await response.json().catch(
      () => ({}),
    )) as ApiErrorResponse;

    throw new Error(getApiErrorMessage(errorBody, fallbackMessage));
  }

  return (await response.json()) as T;
}

// Chooses the backend's explicit error detail when available, otherwise falls
// back to the caller-specific message for network or malformed error bodies.
function getApiErrorMessage(
  errorBody: ApiErrorResponse,
  fallbackMessage: string,
): string {
  if (typeof errorBody.detail === "string") {
    return errorBody.detail;
  }

  return fallbackMessage;
}
