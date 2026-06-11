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

export async function parseRepoUrl(
  repoUrl: string,
): Promise<ParsedRepoResponse> {
  const response = await fetch(`${API_BASE_URL}/api/repo/parse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ repoUrl }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(
      () => ({}),
    )) as ApiErrorResponse;

    throw new Error(
      getApiErrorMessage(errorBody, "RepoFrame could not parse that URL."),
    );
  }

  return (await response.json()) as ParsedRepoResponse;
}

export async function fetchRepoMetadata(
  repoUrl: string,
): Promise<RepoMetadataResponse> {
  const response = await fetch(`${API_BASE_URL}/api/repo/metadata`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ repoUrl }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(
      () => ({}),
    )) as ApiErrorResponse;

    throw new Error(
      getApiErrorMessage(
        errorBody,
        "RepoFrame could not fetch repository metadata.",
      ),
    );
  }

  return (await response.json()) as RepoMetadataResponse;
}

export async function fetchRepoTree(repoUrl: string): Promise<RepoTreeResponse> {
  const response = await fetch(`${API_BASE_URL}/api/repo/tree`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ repoUrl }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(
      () => ({}),
    )) as ApiErrorResponse;

    throw new Error(
      getApiErrorMessage(
        errorBody,
        "RepoFrame could not fetch the repository file tree.",
      ),
    );
  }

  return (await response.json()) as RepoTreeResponse;
}

export async function fetchGitHubRateLimit(): Promise<GitHubRateLimitResponse> {
  const response = await fetch(`${API_BASE_URL}/api/github/rate-limit`);

  if (!response.ok) {
    const errorBody = (await response.json().catch(
      () => ({}),
    )) as ApiErrorResponse;

    throw new Error(
      getApiErrorMessage(
        errorBody,
        "RepoFrame could not fetch GitHub rate limit status.",
      ),
    );
  }

  return (await response.json()) as GitHubRateLimitResponse;
}

function getApiErrorMessage(
  errorBody: ApiErrorResponse,
  fallbackMessage: string,
): string {
  if (typeof errorBody.detail === "string") {
    return errorBody.detail;
  }

  return fallbackMessage;
}
