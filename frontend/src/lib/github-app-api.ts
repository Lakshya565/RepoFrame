import {
  API_BASE_URL,
  fetchWithAuthRetry,
  parseJsonResponse,
  throwResponseError,
} from "@/lib/api-client";

export type GitHubInstallation = {
  installationId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
  repoSelection: string;
  settingsUrl: string;
};

export type GitHubConnections = {
  status: "connected" | "not_connected" | "reauthorization_required";
  installations: GitHubInstallation[];
};

export type CompleteGitHubInstall = GitHubConnections & {
  returnTo: string;
  nextUrl: string | null;
  state: string | null;
};

export type GitHubConnectionStart = {
  authorizationUrl: string | null;
  installUrl: string | null;
  state: string;
  codeVerifier: string | null;
};

export type Connection = {
  installationId: number;
  accountLogin: string;
  repoSelection: string;
};

export async function getGitHubConnections(): Promise<GitHubConnections> {
  const response = await fetchWithAuthRetry(
    `${API_BASE_URL}/api/github/connections`,
  );
  return parseJsonResponse(
    response,
    "RepoFrame could not check your GitHub connection.",
  );
}

export async function startGitHubInstall(
  returnTo = "/",
  forceInstall = false,
): Promise<GitHubConnectionStart> {
  const response = await fetchWithAuthRetry(
    `${API_BASE_URL}/api/github/install/start`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnTo, forceInstall }),
    },
  );
  return parseJsonResponse<GitHubConnectionStart>(
    response,
    "RepoFrame could not start the GitHub connection.",
  );
}

export async function completeGitHubInstall(
  code: string,
  state: string,
  codeVerifier?: string | null,
): Promise<CompleteGitHubInstall> {
  const response = await fetchWithAuthRetry(
    `${API_BASE_URL}/api/github/install/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state, codeVerifier }),
    },
  );
  return parseJsonResponse(
    response,
    "RepoFrame could not finish the GitHub connection.",
  );
}

export async function disconnectGitHub(): Promise<void> {
  const response = await fetchWithAuthRetry(
    `${API_BASE_URL}/api/github/authorization`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    await throwResponseError(
      response,
      "RepoFrame could not disconnect GitHub.",
    );
  }
}

// One-release compatibility with a backend/frontend deployment mismatch.
export async function connectInstallation(
  installationId: number,
): Promise<Connection> {
  const response = await fetchWithAuthRetry(`${API_BASE_URL}/api/github/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ installationId }),
  });
  return parseJsonResponse(
    response,
    "RepoFrame could not connect the GitHub App.",
  );
}
