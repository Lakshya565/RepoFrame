import type {
  ClaimVerification,
  GeneratedOutputs,
  InterviewTopic,
  ProjectProfileData,
  RepoMetadataResponse,
} from "@/lib/repo-api";
import { getAccessToken } from "@/lib/supabase";
import type { UserContext } from "@/lib/user-context";

// Frontend client for the saved-projects API (backend Phase 15.2). Every call is
// authenticated: these endpoints always require a signed-in user (unlike the
// analyze/generate endpoints, which are only gated when Supabase is configured), so
// a missing token surfaces as the backend's 401. Shapes mirror the backend's
// camelCase JSON and reuse the existing per-feature types so a saved project
// round-trips through the same shapes the live workspace uses.

// Backend base URL — same default the rest of the app uses. Kept local (repo-api
// does not export it) so this module has no import cycle with repo-api.
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

// Identity + timestamps for a row in the History / Saved list.
export type ProjectSummary = {
  id: string;
  owner: string;
  repo: string;
  normalizedUrl: string;
  defaultBranch: string | null;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
};

// The full saved snapshot returned when a project is reopened.
export type ProjectDetail = ProjectSummary & {
  metadata: RepoMetadataResponse;
  userContext: UserContext;
  profile: ProjectProfileData | null;
  outputs: GeneratedOutputs;
  interviewTopics: InterviewTopic[] | null;
  allGuidance: string;
  verifications: ClaimVerification[] | null;
  verificationModel: string | null;
};

// What the client posts to save (or re-save) a project. Everything but identity +
// metadata is optional so a project can be saved right after analysis.
export type SaveProjectRequest = {
  owner: string;
  repo: string;
  normalizedUrl: string;
  defaultBranch?: string | null;
  isPrivate?: boolean;
  metadata: RepoMetadataResponse;
  userContext: UserContext;
  profile?: ProjectProfileData | null;
  outputs?: GeneratedOutputs;
  interviewTopics?: InterviewTopic[] | null;
  allGuidance?: string;
  verifications?: ClaimVerification[] | null;
  verificationModel?: string | null;
};

type ApiErrorResponse = { detail?: unknown };

// Bearer header for the (always-authenticated) project endpoints.
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Shared response handling: preserve the backend's { detail } message on failure.
async function parseResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  if (!response.ok) {
    const errorBody = (await response
      .json()
      .catch(() => ({}))) as ApiErrorResponse;
    const message =
      typeof errorBody.detail === "string" ? errorBody.detail : fallbackMessage;
    throw new Error(message);
  }
  return (await response.json()) as T;
}

// Save or re-save a project (upserts on the repo URL). Returns the stored snapshot.
export async function saveProject(
  body: SaveProjectRequest,
): Promise<ProjectDetail> {
  const response = await fetch(`${API_BASE_URL}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  return parseResponse(response, "RepoFrame could not save this project.");
}

// List the signed-in user's saved projects, newest first (identity + timestamps).
export async function listProjects(): Promise<ProjectSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/projects`, {
    headers: { ...(await authHeaders()) },
  });
  return parseResponse(response, "RepoFrame could not load your saved projects.");
}

// Load one full saved snapshot to reopen it.
export async function getProject(projectId: string): Promise<ProjectDetail> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}`,
    { headers: { ...(await authHeaders()) } },
  );
  return parseResponse(response, "RepoFrame could not open that project.");
}

// Delete one saved project. Resolves on success (204); throws on 404/error.
export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}`,
    { method: "DELETE", headers: { ...(await authHeaders()) } },
  );
  if (!response.ok) {
    const errorBody = (await response
      .json()
      .catch(() => ({}))) as ApiErrorResponse;
    const message =
      typeof errorBody.detail === "string"
        ? errorBody.detail
        : "RepoFrame could not delete that project.";
    throw new Error(message);
  }
}
