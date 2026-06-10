export type ParsedRepoResponse = {
  owner: string;
  repo: string;
  normalizedUrl: string;
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

    throw new Error(getApiErrorMessage(errorBody));
  }

  return (await response.json()) as ParsedRepoResponse;
}

function getApiErrorMessage(errorBody: ApiErrorResponse): string {
  if (typeof errorBody.detail === "string") {
    return errorBody.detail;
  }

  return "RepoFrame could not parse that URL.";
}
