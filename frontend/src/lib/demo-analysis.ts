import {
  type RepoMetadataResponse,
  type TechStackResponse,
} from "@/lib/repo-api";
import { DEMO_PROJECT, DEMO_REPO_URL } from "@/lib/demo-fixture";

// Hardcoded pieces of the demo's Analysis tab. The demo loads its commit history,
// file tree, and ranked files LIVE from the backend (the public demo repo is allowed
// unauthenticated — see backend require_user_or_public_demo), so those stay real and
// current. Only the two things that don't need to be live are frozen here: the
// overview title card's metadata and the detected tech stack behind the icon cloud.
// Fed into the same Analysis cards via useDemo, so the page looks identical.

// How long each hardcoded "fetch" waits before resolving, so the card still plays its
// loading → reveal animation like a live fetch. Tunable in one place.
export const DEMO_FETCH_DELAY_MS = 500;

function withDelay<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(value), DEMO_FETCH_DELAY_MS),
  );
}

// The detected tech stack behind the overview icon cloud + the Tech stack section.
// Kept curated (and accurate to RepoFrame's real stack) rather than re-detected on
// every demo view.
const DEMO_TECH_STACK: TechStackResponse = {
  owner: DEMO_PROJECT.owner,
  repo: DEMO_PROJECT.repo,
  normalizedUrl: DEMO_REPO_URL,
  defaultBranch: "main",
  evidenceFilesRead: 14,
  technologies: [
    {
      name: "TypeScript",
      category: "language",
      confidence: 0.98,
      evidence: [
        { source: "config", detail: "tsconfig.json present", path: "frontend/tsconfig.json" },
        { source: "files", detail: "Predominant .ts/.tsx source", path: null },
      ],
    },
    {
      name: "Next.js",
      category: "framework",
      confidence: 0.96,
      evidence: [
        { source: "dependency", detail: "next in package.json", path: "frontend/package.json" },
      ],
    },
    {
      name: "React",
      category: "framework",
      confidence: 0.95,
      evidence: [
        { source: "dependency", detail: "react + react-dom", path: "frontend/package.json" },
      ],
    },
    {
      name: "Python",
      category: "language",
      confidence: 0.93,
      evidence: [
        { source: "files", detail: "FastAPI backend package", path: "backend/app" },
      ],
    },
    {
      name: "FastAPI",
      category: "framework",
      confidence: 0.92,
      evidence: [
        { source: "dependency", detail: "fastapi in requirements.txt", path: "backend/requirements.txt" },
      ],
    },
    {
      name: "OpenAI",
      category: "service",
      confidence: 0.88,
      evidence: [
        { source: "dependency", detail: "openai client used in generation", path: "backend/app/services" },
      ],
    },
    {
      name: "Tailwind CSS",
      category: "styling",
      confidence: 0.9,
      evidence: [
        { source: "config", detail: "Tailwind directives in globals.css", path: "frontend/src/app/globals.css" },
      ],
    },
  ],
};

export function demoFetchRepoMetadata(): Promise<RepoMetadataResponse> {
  return withDelay(DEMO_PROJECT.metadata);
}

export function demoFetchTechStack(): Promise<TechStackResponse> {
  return withDelay(DEMO_TECH_STACK);
}
