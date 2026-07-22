import { getAccessToken } from "@/lib/supabase";
import type { UserContext } from "@/lib/user-context";
import {
  combineLegacyCommitActivity,
  parseCommitActivityPayload,
  type CommitActivityRange,
  type CommitActivityResponse,
} from "@/lib/commit-activity";

export type {
  CommitActivityRange,
  CommitActivityResponse,
  CommitActivityTimeline,
  CommitTimelineBucket,
} from "@/lib/commit-activity";

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

export type AnalysisCacheStatus = "hit" | "stale" | "miss" | "shared";

export type RepoAnalysisStreamEvent =
  | { type: "metadata"; data: RepoMetadataResponse }
  | {
      type: "structure";
      data: { tree: RepoTreeResponse; rankedFiles: RepoFileRankingResponse };
    }
  | { type: "techStack"; data: TechStackResponse }
  | {
      type: "complete";
      cacheStatus: AnalysisCacheStatus;
      generatedAt: string;
      durationMs: number;
    }
  | {
      type: "error";
      stage: "metadata" | "structure" | "techStack" | "analysis";
      detail: string;
      status: number;
      retryable: boolean;
    };

type ApiErrorResponse = {
  detail?: unknown;
};

// An error carrying the backend HTTP status, so callers can react to specific codes
// (e.g. auto-retry a 503 "still computing" from GitHub's lazy stats endpoints)
// rather than only having the message string.
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

let backendWarmupStarted = false;

// Best-effort process wake-up on analysis intent. The health endpoint does not
// touch GitHub or OpenAI, and a failure never blocks the actual submit flow.
export function warmBackend(): void {
  if (backendWarmupStarted) {
    return;
  }
  backendWarmupStarted = true;
  void fetch(`${API_BASE_URL}/health`, { method: "GET" }).catch(() => undefined);
}

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

// Opens the progressive core-analysis stream and forwards each validated event
// as soon as it arrives. An in-stream error becomes the same ApiError shape used
// by ordinary JSON requests, keeping card retry behavior consistent.
export async function streamRepoAnalysis(
  repoUrl: string,
  onEvent: (event: RepoAnalysisStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/repo/analysis/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify({ repoUrl }),
    signal,
  });

  if (!response.ok) {
    await parseResponse(response, "RepoFrame could not analyze this repository.");
    return;
  }
  if (!response.body) {
    throw new Error("RepoFrame could not open the repository analysis stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const event = parseAnalysisStreamFrame(frame);
      if (!event) {
        continue;
      }
      onEvent(event);
      if (event.type === "complete") {
        completed = true;
      } else if (event.type === "error") {
        throw new ApiError(event.detail, event.status);
      }
    }

    if (done) {
      break;
    }
  }

  if (!completed) {
    throw new Error("Repository analysis ended before it completed.");
  }
}

function parseAnalysisStreamFrame(
  frame: string,
): RepoAnalysisStreamEvent | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .join("\n");
  if (!data) {
    return null;
  }

  try {
    const event = JSON.parse(data) as unknown;
    if (
      typeof event === "object" &&
      event !== null &&
      "type" in event &&
      typeof event.type === "string"
    ) {
      return event as RepoAnalysisStreamEvent;
    }
  } catch {
    return null;
  }
  return null;
}

// Fetches both bucketed timelines together so range changes stay local. During
// one staggered deployment window, an older backend may still return one range;
// detect that contract and explicitly fetch the missing month before normalizing.
export async function fetchCommitActivity(
  repoUrl: string,
): Promise<CommitActivityResponse> {
  const payload = await postRepoRequest<unknown>(
    "/api/repo/commit-activity",
    repoUrl,
    "RepoFrame could not fetch commit activity.",
  );
  const parsed = parseCommitActivityPayload(payload);
  if (parsed.kind === "bundled") {
    return parsed.data;
  }

  const missingRange: CommitActivityRange =
    parsed.data.range === "year" ? "month" : "year";
  const fallbackPayload = await postJson<unknown>(
    "/api/repo/commit-activity",
    { repoUrl, range: missingRange },
    "RepoFrame could not fetch commit activity.",
  );
  const fallback = parseCommitActivityPayload(fallbackPayload);
  if (fallback.kind === "bundled") {
    return fallback.data;
  }
  return combineLegacyCommitActivity(parsed.data, fallback.data);
}

// GitHub computes its /stats/* endpoints lazily and returns "still computing" (which
// the backend surfaces as a retryable 503) on the first hit for a repo. Retry the
// fetch a few times with a short delay before giving up. Because this runs inside the
// resource fetcher, the card keeps showing its loading state while GitHub finishes,
// instead of erroring on a condition that resolves within seconds. Non-503 errors
// (and the final 503) propagate normally to the error state + manual retry.
const COMMIT_ACTIVITY_RETRY_ATTEMPTS = 4;
const COMMIT_ACTIVITY_RETRY_DELAY_MS = 2500;
const SESSION_CACHE_FRESH_MS = 5 * 60 * 1000;
const SESSION_CACHE_MAX_REPOS = 10;
const commitSessionCache = new Map<
  string,
  { data: CommitActivityResponse; cachedAt: number }
>();
const commitInflight = new Map<string, Promise<CommitActivityResponse>>();

async function fetchCommitActivityPollingUncached(
  repoUrl: string,
): Promise<CommitActivityResponse> {
  for (let attempt = 0; attempt < COMMIT_ACTIVITY_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fetchCommitActivity(repoUrl);
    } catch (caught) {
      const stillComputing = caught instanceof ApiError && caught.status === 503;
      const attemptsLeft = attempt < COMMIT_ACTIVITY_RETRY_ATTEMPTS - 1;
      if (!stillComputing || !attemptsLeft) {
        throw caught;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, COMMIT_ACTIVITY_RETRY_DELAY_MS),
      );
    }
  }
  // Unreachable — the loop always returns or throws — but keeps the return type sound.
  return fetchCommitActivity(repoUrl);
}

export async function fetchCommitActivityPolling(
  repoUrl: string,
): Promise<CommitActivityResponse> {
  const cacheKey = repoUrl.toLowerCase();
  const cached = commitSessionCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < SESSION_CACHE_FRESH_MS) {
    commitSessionCache.delete(cacheKey);
    commitSessionCache.set(cacheKey, cached);
    return cached.data;
  }

  const existing = commitInflight.get(cacheKey);
  if (existing) {
    return existing;
  }

  const request = fetchCommitActivityPollingUncached(repoUrl).then((data) => {
    commitSessionCache.set(cacheKey, { data, cachedAt: Date.now() });
    while (commitSessionCache.size > SESSION_CACHE_MAX_REPOS) {
      const oldest = commitSessionCache.keys().next().value;
      if (typeof oldest === "string") {
        commitSessionCache.delete(oldest);
      }
    }
    return data;
  });

  commitInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    commitInflight.delete(cacheKey);
  }
}

export function clearRepoSessionCaches(): void {
  commitSessionCache.clear();
  commitInflight.clear();
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

// Bounded-work audit returned with every verification result. It makes the
// agent's actual model/tool activity visible without exposing prompts or secrets.
export type VerifyInvestigation = {
  modelCalls: number;
  toolCalls: number;
  additionalFilesInspected: string[];
};

export type VerifyClaimsResponse = {
  verifications: ClaimVerification[];
  model: string;
  estimatedInputTokens: number;
  usage: UsageTotals;
  investigation: VerifyInvestigation;
};

// The real progress stages the Evidence Investigator passes through, in display
// order. Mirrors the backend's closed vocabulary so the UI maps each event to a
// fixed step:
//   - gathering_evidence: build initial evidence and a safe repository index.
//   - analyzing: review claims and decide whether evidence gaps need tools.
//   - checking: search/read targeted evidence (detail says what, live).
//   - compiling: run the separate tool-free reasoning verdict.
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

// Runs the bounded Evidence Investigator via the streaming endpoint. onProgress
// fires for each real stage/tool detail, and the promise resolves with the final
// report. It remains opt-in, and streamed or pre-stream errors reject with the
// backend's message.
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
            investigation: event.investigation,
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

    throw new ApiError(
      getApiErrorMessage(errorBody, fallbackMessage),
      response.status,
    );
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
