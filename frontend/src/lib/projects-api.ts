import type {
  ClaimVerification,
  GeneratedOutputs,
  InterviewTopic,
  ProjectProfileData,
  RepoMetadataResponse,
} from "@/lib/repo-api";
import type { UserContext } from "@/lib/user-context";
import {
  API_BASE_URL,
  authHeaders,
  parseJsonResponse,
  throwResponseError,
} from "@/lib/api-client";

// Frontend client for the saved-projects API (backend Phase 15.2). Every call is
// authenticated: these endpoints always require a signed-in user (unlike the
// analyze/generate endpoints, which are only gated when Supabase is configured), so
// a missing token surfaces as the backend's 401. Shapes mirror the backend's
// camelCase JSON and reuse the existing per-feature types so a saved project
// round-trips through the same shapes the live workspace uses.

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

// Save or re-save a project (upserts on the repo URL). Returns the stored snapshot.
export async function saveProject(
  body: SaveProjectRequest,
): Promise<ProjectDetail> {
  const response = await fetch(`${API_BASE_URL}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  return parseJsonResponse(response, "RepoFrame could not save this project.");
}

// List the signed-in user's saved projects, newest first (identity + timestamps).
export async function listProjects(): Promise<ProjectSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/projects`, {
    headers: { ...(await authHeaders()) },
  });
  return parseJsonResponse(
    response,
    "RepoFrame could not load your saved projects.",
  );
}

// Load one full saved snapshot to reopen it.
export async function getProject(projectId: string): Promise<ProjectDetail> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}`,
    { headers: { ...(await authHeaders()) } },
  );
  return parseJsonResponse(response, "RepoFrame could not open that project.");
}

// Delete one saved project. Resolves on success (204); throws on 404/error.
export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}`,
    { method: "DELETE", headers: { ...(await authHeaders()) } },
  );
  if (!response.ok) {
    await throwResponseError(
      response,
      "RepoFrame could not delete that project.",
    );
  }
}
