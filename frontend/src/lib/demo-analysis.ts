import {
  type CommitActivityRange,
  type CommitActivityResponse,
  type CommitTimelineBucket,
  type RepoMetadataResponse,
  type TechStackResponse,
} from "@/lib/repo-api";
import { DEMO_PROJECT, DEMO_REPO_URL } from "@/lib/demo-fixture";

// Hardcoded pieces of the demo's Analysis tab. The file tree and ranked files load
// LIVE from the backend (the public demo repo is allowed unauthenticated — see
// backend require_user_or_public_demo), so those stay real and current. The rest is
// frozen here because it doesn't need to be live: the overview title card's
// metadata, the detected tech stack behind the icon cloud, and the commit activity
// (GitHub's stats endpoints are slow, especially the heavier "all" range, so the
// demo serves a frozen snapshot of the REAL history instead of paying that latency
// on every visit). Fed into the same Analysis cards via useDemo, so it looks
// identical — the snapshot just slowly goes stale as the real repo gains commits.

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

// ── Commit activity (frozen snapshot of the REAL RepoFrame history) ───────────
// Captured from `git log` at freeze time: 45 commits, 2026-06-08 → 2026-07-10,
// solo, front-loaded in June. Daily counts drive the 1M view; weekly counts drive
// 1Y and All. Update these maps if the demo's story should reflect newer history.
const DAILY_COMMITS: Record<string, number> = {
  "2026-06-08": 6,
  "2026-06-09": 2,
  "2026-06-10": 4,
  "2026-06-11": 3,
  "2026-06-12": 5,
  "2026-06-15": 4,
  "2026-06-16": 1,
  "2026-06-17": 2,
  "2026-06-18": 2,
  "2026-06-22": 4,
  "2026-06-23": 1,
  "2026-06-24": 2,
  "2026-06-26": 1,
  "2026-06-29": 1,
  "2026-06-30": 2,
  "2026-07-02": 1,
  "2026-07-05": 2,
  "2026-07-06": 1,
  "2026-07-10": 1,
};

// Commits per ISO (Monday-start) week, keyed by the week's Monday.
const WEEKLY_COMMITS: Record<string, number> = {
  "2026-06-08": 20,
  "2026-06-15": 9,
  "2026-06-22": 8,
  "2026-06-29": 6,
  "2026-07-06": 2,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Contiguous daily buckets from `startISO` for `days` days, zero-filled.
function dailyBuckets(startISO: string, days: number): CommitTimelineBucket[] {
  const startMs = new Date(`${startISO}T00:00:00Z`).getTime();
  return Array.from({ length: days }, (_, index) => {
    const periodStart = isoDate(startMs + index * DAY_MS);
    return { periodStart, commitCount: DAILY_COMMITS[periodStart] ?? 0 };
  });
}

// `weeks` weekly buckets ending on `endMondayISO`, oldest first, zero-filled.
function weeklyBuckets(endMondayISO: string, weeks: number): CommitTimelineBucket[] {
  const endMs = new Date(`${endMondayISO}T00:00:00Z`).getTime();
  return Array.from({ length: weeks }, (_, index) => {
    const periodStart = isoDate(endMs - (weeks - 1 - index) * 7 * DAY_MS);
    return { periodStart, commitCount: WEEKLY_COMMITS[periodStart] ?? 0 };
  });
}

// Assembles a full response for one range from its buckets.
function commitActivity(
  range: CommitActivityRange,
  intervalLabel: string,
  buckets: CommitTimelineBucket[],
  rangeEnd: string,
): CommitActivityResponse {
  return {
    owner: DEMO_PROJECT.owner,
    repo: DEMO_PROJECT.repo,
    normalizedUrl: DEMO_REPO_URL,
    range,
    intervalLabel,
    totalCommits: buckets.reduce((sum, bucket) => sum + bucket.commitCount, 0),
    rangeStart: buckets[0]?.periodStart ?? null,
    rangeEnd,
    contributorsTruncated: false,
    buckets,
  };
}

const DEMO_COMMIT_ACTIVITY: Record<CommitActivityRange, CommitActivityResponse> = {
  // Last 30 days, daily.
  month: commitActivity("month", "1 day", dailyBuckets("2026-06-11", 30), "2026-07-10"),
  // Last 52 weeks, weekly (only the final ~5 weeks carry commits — the repo is young).
  year: commitActivity("year", "1 week", weeklyBuckets("2026-07-06", 52), "2026-07-10"),
  // Full history, weekly — the project is ~5 weeks old.
  all: commitActivity("all", "1 week", weeklyBuckets("2026-07-06", 5), "2026-07-10"),
};

export function demoFetchCommitActivity(
  _repoUrl: string,
  range: CommitActivityRange,
): Promise<CommitActivityResponse> {
  return withDelay(DEMO_COMMIT_ACTIVITY[range]);
}
