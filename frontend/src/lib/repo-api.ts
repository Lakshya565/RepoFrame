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
