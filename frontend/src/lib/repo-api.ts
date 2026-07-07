import { getAccessToken } from "@/lib/supabase";
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
  // Maintainer-applied subject tags (may be empty) and the detected license's
  // short id (e.g. "MIT"), or null when unlicensed/unrecognized.
  topics: string[];
  license: string | null;
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

// Authorization header for backend calls that are login-gated when Supabase is
// configured (analyze / generate / verify). Returns the signed-in user's Supabase
// access token as a Bearer, or {} when signed out / unconfigured — so the public
// dev flow sends no header and is unchanged. The backend decides whether the
// header is required (require_user_when_configured).
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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

// The time window a commit-activity timeline covers: last month (daily points),
// last year (weekly), or full history (adaptive grain).
export type CommitActivityRange = "month" | "year" | "all";

// One bar of the commit-activity timeline: the UTC ISO date the bucket starts on
// and the commits summed into it.
export type CommitTimelineBucket = {
  periodStart: string;
  commitCount: number;
};

// The commit-activity timeline: adaptive-interval bars plus the grain's label, the
// total commits over the window, the window's start/end dates (null when the
// repository has no commit activity), the charted range, and whether the "all time"
// data may be truncated (GitHub caps contributor stats at the top 100 contributors).
export type CommitActivityResponse = ParsedRepoResponse & {
  range: CommitActivityRange;
  intervalLabel: string;
  totalCommits: number;
  rangeStart: string | null;
  rangeEnd: string | null;
  contributorsTruncated: boolean;
  buckets: CommitTimelineBucket[];
};

// Fetches commit activity as a bucketed timeline for the Analysis graph, over the
// given range. The backend does the GitHub call(s) and all the bucketing; a "still
// computing" stats-cache state surfaces as a retryable error the card handles.
export async function fetchCommitActivity(
  repoUrl: string,
  range: CommitActivityRange,
): Promise<CommitActivityResponse> {
  return postJson(
    "/api/repo/commit-activity",
    { repoUrl, range },
    "RepoFrame could not fetch commit activity.",
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

// Revises the existing interview prep from the current topics plus an optional
// instruction (the feedback-driven "Regenerate" for the interview card). Mirrors
// reviseOutput: it refines the current prep instead of redoing it from scratch,
// and returns the same shape as generateInterviewPrep.
export async function reviseInterviewPrep(
  profile: ProjectProfileData,
  currentTopics: InterviewTopic[],
  instruction: string,
): Promise<GenerateInterviewPrepResponse> {
  return postJson(
    "/api/generate/interview-prep/revise",
    { profile, currentTopics, instruction },
    "RepoFrame could not regenerate interview prep.",
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

// The real progress stages the verification agent passes through, in display
// order. Mirrors the backend's closed stage vocabulary (claim_verifier) so the UI
// checklist maps each event to a fixed step:
//   - gathering_evidence: the deterministic pipeline rebuilds the repo evidence.
//   - analyzing: the agent reads the writeup + evidence and extracts the claims.
//   - checking: the agent searches/reads the evidence (detail says what, live).
//   - compiling: the agent is producing its final verdict.
export type VerifyStage =
  | "gathering_evidence"
  | "analyzing"
  | "checking"
  | "compiling";

// One progress update from the streaming verify endpoint. detail is a short human
// line for the "checking" stage (e.g. the term being searched) or null.
export type VerifyProgressEvent = {
  stage: VerifyStage;
  detail: string | null;
};

// The SSE frames the streaming endpoint emits, as a discriminated union. The
// "result" frame carries the exact VerifyClaimsResponse shape (plus the tag), so a
// completed stream parses identically to a plain JSON verify response.
type VerifyStreamEvent =
  | ({ type: "result" } & VerifyClaimsResponse)
  | { type: "progress"; stage: VerifyStage; detail: string | null }
  | { type: "error"; detail: string; status: number };

// Runs the bounded verification agent over the generated outputs via the STREAMING
// endpoint: onProgress fires as each real stage is reached (so the UI checklist
// tracks the agent's actual work), and the promise resolves with the final result
// once the stream completes. Like interview prep it is opt-in — nothing runs until
// an explicit press, so it never spends tokens in the default flow. The backend
// rebuilds the repo evidence from the URL. A streamed { type: "error" } frame (or a
// pre-stream HTTP error) rejects with the backend's message.
export async function verifyClaimsStream(
  repoUrl: string,
  userContext: UserContext,
  outputs: GeneratedOutputs,
  handlers: {
    onProgress: (event: VerifyProgressEvent) => void;
    signal?: AbortSignal;
  },
): Promise<VerifyClaimsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/generate/verify/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(await authHeaders()),
    },
    body: JSON.stringify({ repoUrl, userContext, outputs }),
    signal: handlers.signal,
  });

  // A request rejected before streaming begins (e.g. body validation) returns a
  // normal JSON error, so surface it exactly like the other API helpers do.
  if (!response.ok || !response.body) {
    const errorBody = (await response.json().catch(() => ({}))) as ApiErrorResponse;
    throw new Error(
      getApiErrorMessage(
        errorBody,
        "RepoFrame could not verify the generated claims.",
      ),
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: VerifyClaimsResponse | null = null;

  // SSE frames are separated by a blank line. Accumulate decoded text and process
  // each complete frame as soon as it arrives so progress is live, not batched.
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const event = parseVerifyStreamFrame(frame);
      if (event) {
        if (event.type === "progress") {
          handlers.onProgress({ stage: event.stage, detail: event.detail });
        } else if (event.type === "error") {
          throw new Error(
            event.detail || "RepoFrame could not verify the generated claims.",
          );
        } else {
          // The result frame is the VerifyClaimsResponse plus a tag; copy the
          // response fields off it (dropping the tag).
          result = {
            verifications: event.verifications,
            model: event.model,
            estimatedInputTokens: event.estimatedInputTokens,
            usage: event.usage,
          };
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }

  if (!result) {
    throw new Error("The verification stream ended without a result.");
  }
  return result;
}

// Parses one SSE frame into its JSON event. An SSE frame may carry several lines;
// the payload is the concatenation of every line after a "data:" prefix. Returns
// null for keep-alive/comment frames or anything that is not valid JSON, so a stray
// frame never breaks the stream.
function parseVerifyStreamFrame(frame: string): VerifyStreamEvent | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .join("\n");

  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as VerifyStreamEvent;
  } catch {
    return null;
  }
}

// Fetches the persistent lifetime token totals so the UI can show project spend
// without anyone opening the OpenAI dashboard.
export async function fetchLifetimeUsage(): Promise<LifetimeUsage> {
  const response = await fetch(`${API_BASE_URL}/api/usage/total`);

  return parseResponse(response, "RepoFrame could not fetch usage totals.");
}

// ── Phase 13: operational metrics (GET /api/metrics) ─────────────────────────
// In-memory counters + latency aggregates, reset on backend restart. Keys are
// snake_case (the backend MetricsResponse is unaliased) and dict-shaped so new
// counters/categories can appear without breaking this client. Read-only — the
// developer metrics drawer only displays these; it never records anything.

// Latency aggregate for one category (llm, backend), in milliseconds.
export type LatencyMetric = {
  count: number;
  avg_ms: number;
  max_ms: number;
};

export type MetricsResponse = {
  counters: Record<string, number>;
  latency: Record<string, LatencyMetric>;
};

// Fetches the developer metrics snapshot. Spends no tokens; the backend stays the
// single source of truth and this only displays what it has already recorded.
export async function fetchMetrics(): Promise<MetricsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/metrics`);

  return parseResponse(response, "RepoFrame could not fetch metrics.");
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
      ...(await authHeaders()),
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
      ...(await authHeaders()),
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
