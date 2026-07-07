import { getAccessToken } from "@/lib/supabase";

// Frontend client for the GitHub App connection endpoints (backend Phase 15.4).
// Authenticated with the Supabase JWT: the backend binds the installation to the
// signed-in user only if the GitHub account matches (ownership check).

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

// Public GitHub App slug, used to build the install URL (Phase 15.6).
const GITHUB_APP_SLUG = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG ?? "";

// The GitHub "install this App" URL, with the user id as state so the post-install
// landing can associate it. null when the slug isn't configured (feature off).
// GitHub's own screen is where the user picks All vs Selected repositories.
export function installAppUrl(userId: string): string | null {
  if (!GITHUB_APP_SLUG) {
    return null;
  }
  return `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new?state=${encodeURIComponent(userId)}`;
}

// The stored connection: which installation, whose account, and the repo scope.
export type Connection = {
  installationId: number;
  accountLogin: string;
  repoSelection: string;
};

type ApiErrorResponse = { detail?: unknown };

// Bind a just-completed App installation to the current user. Called by the
// /github/installed landing after GitHub redirects back with an installation_id.
export async function connectInstallation(
  installationId: number,
): Promise<Connection> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE_URL}/api/github/install`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ installationId }),
  });
  if (!response.ok) {
    const errorBody = (await response
      .json()
      .catch(() => ({}))) as ApiErrorResponse;
    const message =
      typeof errorBody.detail === "string"
        ? errorBody.detail
        : "RepoFrame could not connect the GitHub App.";
    throw new Error(message);
  }
  return (await response.json()) as Connection;
}
