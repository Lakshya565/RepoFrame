import {
  type CommitActivityRange,
  type CommitActivityResponse,
  type CommitTimelineBucket,
  type RankedRepoFile,
  type RepoFile,
  type RepoFileRankingResponse,
  type RepoMetadataResponse,
  type RepoTreeResponse,
  type TechStackResponse,
} from "@/lib/repo-api";
import { DEMO_PROJECT, DEMO_REPO_URL } from "@/lib/demo-fixture";

// The demo's Analysis tab is a FULLY FROZEN snapshot of RepoFrame's own repo — no
// backend request, no GitHub calls. Everything the Analysis page shows (overview
// metadata, tech stack, commit activity, the file tree, and the ranked "files we
// read") is served from the static fixtures below, so an anonymous /demo visitor
// gets an instant, deterministic analysis with zero spend or latency. It's fed into
// the same Analysis cards via useDemo, so it looks identical to a live analysis; the
// snapshot just slowly goes stale as the real repo evolves (refresh the fixtures
// here if the project's structure or history should be reflected anew).

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

// ── File tree (frozen snapshot of the REAL RepoFrame tracked files) ───────────
// Captured from `git ls-files` at freeze time (node_modules/.next excluded, as they
// are for a real analysis). Directory rows and counts are derived from these paths
// by buildRepoTree, so only the file leaves are listed here.
const DEMO_TREE_PATHS: readonly string[] = [
  ".gitignore",
  "AGENTS.md",
  "PHASES.md",
  "PHASE_16_PLAN.md",
  "README.md",
  "backend/.env.example",
  "backend/AGENTS.md",
  "backend/app/__init__.py",
  "backend/app/config.py",
  "backend/app/main.py",
  "backend/app/routers/__init__.py",
  "backend/app/routers/generate.py",
  "backend/app/routers/github.py",
  "backend/app/routers/github_app.py",
  "backend/app/routers/metrics.py",
  "backend/app/routers/projects.py",
  "backend/app/routers/repo.py",
  "backend/app/routers/usage.py",
  "backend/app/schemas/__init__.py",
  "backend/app/schemas/github_app.py",
  "backend/app/schemas/metrics.py",
  "backend/app/schemas/outputs.py",
  "backend/app/schemas/profile.py",
  "backend/app/schemas/projects.py",
  "backend/app/schemas/repo.py",
  "backend/app/schemas/usage.py",
  "backend/app/schemas/verify.py",
  "backend/app/services/__init__.py",
  "backend/app/services/auth.py",
  "backend/app/services/claim_verifier.py",
  "backend/app/services/commit_activity.py",
  "backend/app/services/file_content_service.py",
  "backend/app/services/file_ranker.py",
  "backend/app/services/github_app.py",
  "backend/app/services/github_service.py",
  "backend/app/services/installation_store.py",
  "backend/app/services/llm_client.py",
  "backend/app/services/metrics_store.py",
  "backend/app/services/output_generator.py",
  "backend/app/services/profile_generator.py",
  "backend/app/services/project_store.py",
  "backend/app/services/prompt_format.py",
  "backend/app/services/rate_limit.py",
  "backend/app/services/repo_access.py",
  "backend/app/services/repo_parser.py",
  "backend/app/services/supabase_client.py",
  "backend/app/services/tech_stack_detector.py",
  "backend/app/services/token_estimator.py",
  "backend/app/services/usage_store.py",
  "backend/requirements-dev.txt",
  "backend/requirements.txt",
  "backend/tests/__init__.py",
  "backend/tests/test_auth.py",
  "backend/tests/test_claim_verifier.py",
  "backend/tests/test_commit_activity.py",
  "backend/tests/test_file_content_service.py",
  "backend/tests/test_file_ranker.py",
  "backend/tests/test_github_app.py",
  "backend/tests/test_github_app_routes.py",
  "backend/tests/test_github_service.py",
  "backend/tests/test_installation_store.py",
  "backend/tests/test_llm_client.py",
  "backend/tests/test_login_gate_routes.py",
  "backend/tests/test_metrics_store.py",
  "backend/tests/test_output_generator.py",
  "backend/tests/test_profile_generator.py",
  "backend/tests/test_project_store.py",
  "backend/tests/test_rate_limit.py",
  "backend/tests/test_repo_access.py",
  "backend/tests/test_repo_parser.py",
  "backend/tests/test_supabase_client.py",
  "backend/tests/test_tech_stack_detector.py",
  "backend/tests/test_token_estimator.py",
  "backend/tests/test_usage_store.py",
  "frontend/.gitignore",
  "frontend/AGENTS.md",
  "frontend/CLAUDE.md",
  "frontend/README.md",
  "frontend/components.json",
  "frontend/eslint.config.mjs",
  "frontend/next.config.ts",
  "frontend/package-lock.json",
  "frontend/package.json",
  "frontend/postcss.config.mjs",
  "frontend/src/app/analysis/[owner]/[repo]/generate/page.tsx",
  "frontend/src/app/analysis/[owner]/[repo]/history/page.tsx",
  "frontend/src/app/analysis/[owner]/[repo]/layout.tsx",
  "frontend/src/app/analysis/[owner]/[repo]/page.tsx",
  "frontend/src/app/analysis/page.tsx",
  "frontend/src/app/demo/generate/page.tsx",
  "frontend/src/app/demo/history/page.tsx",
  "frontend/src/app/demo/layout.tsx",
  "frontend/src/app/demo/page.tsx",
  "frontend/src/app/github/installed/page.tsx",
  "frontend/src/app/globals.css",
  "frontend/src/app/layout.tsx",
  "frontend/src/app/page.tsx",
  "frontend/src/app/saved/page.tsx",
  "frontend/src/app/template.tsx",
  "frontend/src/components/analysis-chrome.tsx",
  "frontend/src/components/analysis-tabs.tsx",
  "frontend/src/components/animated-divider.tsx",
  "frontend/src/components/auth-button.tsx",
  "frontend/src/components/brand-marquee.tsx",
  "frontend/src/components/claim-verification-panel.tsx",
  "frontend/src/components/connect-repos-button.tsx",
  "frontend/src/components/gate-overlay.tsx",
  "frontend/src/components/generate-stepper.tsx",
  "frontend/src/components/generated-output-cards.tsx",
  "frontend/src/components/github-installed-client.tsx",
  "frontend/src/components/github-mark.tsx",
  "frontend/src/components/github-rate-limit-card.tsx",
  "frontend/src/components/glow-text.tsx",
  "frontend/src/components/home-button.tsx",
  "frontend/src/components/hover-pop-icon.tsx",
  "frontend/src/components/important-files-card.tsx",
  "frontend/src/components/kinetic-letters.tsx",
  "frontend/src/components/landing-recent-projects.tsx",
  "frontend/src/components/metrics/metrics-drawer.tsx",
  "frontend/src/components/motion/reveal.tsx",
  "frontend/src/components/project-auto-save.tsx",
  "frontend/src/components/project-hydrator.tsx",
  "frontend/src/components/project-writeup-section.tsx",
  "frontend/src/components/repo-commit-timeline.tsx",
  "frontend/src/components/repo-overview-card.tsx",
  "frontend/src/components/repo-tree-view.tsx",
  "frontend/src/components/repo-url-form.tsx",
  "frontend/src/components/saved-projects-list.tsx",
  "frontend/src/components/scroll-reveal.tsx",
  "frontend/src/components/site-header.tsx",
  "frontend/src/components/states.tsx",
  "frontend/src/components/tech-glyph.tsx",
  "frontend/src/components/tech-icon-cloud.tsx",
  "frontend/src/components/tech-stack-card.tsx",
  "frontend/src/components/tech-stack-nodes.tsx",
  "frontend/src/components/theme-provider.tsx",
  "frontend/src/components/theme-toggle.tsx",
  "frontend/src/components/token-usage-panel.tsx",
  "frontend/src/components/ui/badge.tsx",
  "frontend/src/components/ui/border-beam.tsx",
  "frontend/src/components/ui/button.tsx",
  "frontend/src/components/ui/card.tsx",
  "frontend/src/components/ui/chart.tsx",
  "frontend/src/components/ui/confirm-dialog.tsx",
  "frontend/src/components/ui/file-tree.tsx",
  "frontend/src/components/ui/icon-cloud.tsx",
  "frontend/src/components/ui/input.tsx",
  "frontend/src/components/ui/magic-card.tsx",
  "frontend/src/components/ui/marquee.tsx",
  "frontend/src/components/ui/scroll-area.tsx",
  "frontend/src/components/ui/scroll-progress.tsx",
  "frontend/src/components/ui/skeleton.tsx",
  "frontend/src/components/ui/textarea.tsx",
  "frontend/src/components/user-context-form.tsx",
  "frontend/src/components/verification-agent.tsx",
  "frontend/src/lib/auth-context.tsx",
  "frontend/src/lib/demo-analysis.ts",
  "frontend/src/lib/demo-fixture.ts",
  "frontend/src/lib/demo-generation.ts",
  "frontend/src/lib/demo-mode.tsx",
  "frontend/src/lib/generation-context.tsx",
  "frontend/src/lib/github-app-api.ts",
  "frontend/src/lib/marquee-icons.ts",
  "frontend/src/lib/outputs.ts",
  "frontend/src/lib/pointer.ts",
  "frontend/src/lib/project-snapshot.ts",
  "frontend/src/lib/projects-api.ts",
  "frontend/src/lib/repo-api.ts",
  "frontend/src/lib/repo-tree.ts",
  "frontend/src/lib/repo-url.ts",
  "frontend/src/lib/supabase.ts",
  "frontend/src/lib/tech-icons.ts",
  "frontend/src/lib/tech-stack-context.tsx",
  "frontend/src/lib/use-completion-flash.ts",
  "frontend/src/lib/use-inferred-context.ts",
  "frontend/src/lib/use-project-autosave.ts",
  "frontend/src/lib/use-project-hydrate.ts",
  "frontend/src/lib/use-repo-resource.ts",
  "frontend/src/lib/user-context.ts",
  "frontend/src/lib/utils.ts",
  "frontend/tsconfig.json",
  "supabase/migrations/0001_phase15_init.sql",
];

// Counts the distinct directory prefixes across the frozen paths, so the tree's
// "N directories" line matches the real structure without hardcoding a number.
function countDirectories(paths: readonly string[]): number {
  const dirs = new Set<string>();
  for (const path of paths) {
    const parts = path.split("/");
    for (let depth = 1; depth < parts.length; depth += 1) {
      dirs.add(parts.slice(0, depth).join("/"));
    }
  }
  return dirs.size;
}

const DEMO_TREE: RepoTreeResponse = {
  owner: DEMO_PROJECT.owner,
  repo: DEMO_PROJECT.repo,
  normalizedUrl: DEMO_REPO_URL,
  defaultBranch: "main",
  files: DEMO_TREE_PATHS.map(
    (path): RepoFile => ({ path, type: "file", size: null, url: null }),
  ),
  totalFiles: DEMO_TREE_PATHS.length,
  totalDirectories: countDirectories(DEMO_TREE_PATHS),
  isTruncated: false,
};

export function demoFetchRepoTree(): Promise<RepoTreeResponse> {
  return withDelay(DEMO_TREE);
}

// ── Ranked files (the files RepoFrame "read" — frozen) ────────────────────────
// A curated stand-in for the deterministic ranker's Phase 5 output on this repo:
// the READMEs, dependency manifests, entry points, and key service/router/lib
// source it would surface. Reasons mirror the real ranker's phrasing (file_ranker.py)
// so the popovers read identically. These paths are also starred in the tree above.
const DEMO_RANKED_FILES: readonly RankedRepoFile[] = [
  {
    path: "README.md",
    size: null,
    importanceScore: 100,
    reasons: ["README file explains project purpose, setup, or usage."],
  },
  {
    path: "frontend/README.md",
    size: null,
    importanceScore: 92,
    reasons: ["README file explains project purpose, setup, or usage."],
  },
  {
    path: "backend/requirements.txt",
    size: null,
    importanceScore: 88,
    reasons: ["Configuration or dependency file shows project tooling."],
  },
  {
    path: "frontend/package.json",
    size: null,
    importanceScore: 88,
    reasons: ["Configuration or dependency file shows project tooling."],
  },
  {
    path: "backend/app/main.py",
    size: null,
    importanceScore: 84,
    reasons: [
      "Filename looks like an application entry point or route.",
      "Source file can provide implementation evidence.",
    ],
  },
  {
    path: "frontend/src/app/page.tsx",
    size: null,
    importanceScore: 82,
    reasons: [
      "Filename looks like an application entry point or route.",
      "Source file can provide implementation evidence.",
    ],
  },
  {
    path: "backend/app/services/file_ranker.py",
    size: null,
    importanceScore: 78,
    reasons: [
      "Path includes important source area: services.",
      "Source file can provide implementation evidence.",
    ],
  },
  {
    path: "backend/app/services/tech_stack_detector.py",
    size: null,
    importanceScore: 77,
    reasons: [
      "Path includes important source area: services.",
      "Source file can provide implementation evidence.",
    ],
  },
  {
    path: "backend/app/services/llm_client.py",
    size: null,
    importanceScore: 76,
    reasons: [
      "Path includes important source area: services.",
      "Source file can provide implementation evidence.",
    ],
  },
  {
    path: "backend/app/routers/generate.py",
    size: null,
    importanceScore: 74,
    reasons: [
      "Path includes important source area: routers.",
      "Source file can provide implementation evidence.",
    ],
  },
  {
    path: "frontend/src/lib/repo-api.ts",
    size: null,
    importanceScore: 72,
    reasons: [
      "Path includes important source area: lib.",
      "Source file can provide implementation evidence.",
    ],
  },
  {
    path: "backend/app/config.py",
    size: null,
    importanceScore: 70,
    reasons: [
      "Configuration or dependency file shows project tooling.",
      "Source file can provide implementation evidence.",
    ],
  },
];

const DEMO_RANKING: RepoFileRankingResponse = {
  owner: DEMO_PROJECT.owner,
  repo: DEMO_PROJECT.repo,
  normalizedUrl: DEMO_REPO_URL,
  defaultBranch: "main",
  rankedFiles: [...DEMO_RANKED_FILES],
  totalFiles: DEMO_TREE_PATHS.length,
  rankableFiles: DEMO_TREE_PATHS.length,
  returnedFiles: DEMO_RANKED_FILES.length,
};

export function demoFetchRankedFiles(): Promise<RepoFileRankingResponse> {
  return withDelay(DEMO_RANKING);
}
