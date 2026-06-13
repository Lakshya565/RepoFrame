"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchTechStack,
  type DetectedTechnology,
  type TechStackEvidence,
  type TechStackResponse,
} from "@/lib/repo-api";

type TechStackCardProps = {
  repoUrl: string;
};

const logoFallbacks: Record<string, string> = {
  "C#": "C#",
  CSS: "CSS",
  Docker: "D",
  Express: "Ex",
  FastAPI: "FA",
  Flask: "Fl",
  "GitHub Actions": "GH",
  Go: "Go",
  HTML: "H",
  Java: "J",
  JavaScript: "JS",
  "Next.js": "N",
  "Node.js": "N",
  OpenCV: "CV",
  Pandas: "Pd",
  PostgreSQL: "Pg",
  Python: "Py",
  React: "R",
  SQLite: "Sq",
  Supabase: "Su",
  "Tailwind CSS": "Tw",
  TypeScript: "TS",
  Vite: "V",
};

// Displays Phase 6 stack detection with compact source evidence. Logos are kept
// as text badges for now so the UI stays dependency-free and consistent.
export function TechStackCard({ repoUrl }: TechStackCardProps) {
  const [stack, setStack] = useState<TechStackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Reloads stack detection for initial fetches and retries. The backend owns
  // all content limits, parsing, and confidence scoring.
  const loadStack = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const detectedStack = await fetchTechStack(repoUrl);
      setStack(detectedStack);
    } catch (error) {
      setStack(null);
      setError(
        error instanceof Error
          ? error.message
          : "RepoFrame could not detect the repository tech stack.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [repoUrl]);

  // Keeps the component synchronized with the current analysis URL while
  // ignoring stale responses if the user navigates before the request finishes.
  useEffect(() => {
    let isCurrentRequest = true;

    async function run() {
      setIsLoading(true);
      setError(null);

      try {
        const detectedStack = await fetchTechStack(repoUrl);
        if (isCurrentRequest) {
          setStack(detectedStack);
        }
      } catch (error) {
        if (isCurrentRequest) {
          setStack(null);
          setError(
            error instanceof Error
              ? error.message
              : "RepoFrame could not detect the repository tech stack.",
          );
        }
      } finally {
        if (isCurrentRequest) {
          setIsLoading(false);
        }
      }
    }

    run();

    return () => {
      isCurrentRequest = false;
    };
  }, [repoUrl]);

  if (isLoading) {
    return <TechStackLoadingCard />;
  }

  if (error) {
    return (
      <article className="rounded-lg border border-red-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">
          Stack detection unavailable
        </p>
        <h2 className="mt-3 text-2xl font-semibold">
          RepoFrame could not detect this stack.
        </h2>
        <p className="mt-3 text-base leading-7 text-slate-600">{error}</p>
        <button
          className="mt-5 inline-flex min-h-11 items-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          onClick={loadStack}
          type="button"
        >
          Try again
        </button>
      </article>
    );
  }

  if (!stack || stack.technologies.length === 0) {
    return (
      <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Tech stack
        </p>
        <h2 className="mt-3 text-2xl font-semibold">No stack detected yet</h2>
        <p className="mt-3 text-base leading-7 text-slate-600">
          RepoFrame did not find stack evidence in the ranked README,
          dependency, configuration, or source-path signals for this repository.
        </p>
      </article>
    );
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Tech stack
          </p>
          <h2 className="mt-3 text-2xl font-semibold">
            Detected technologies
          </h2>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-500">
            Evidence files read
          </p>
          <p className="mt-1 font-mono text-lg font-semibold text-slate-950">
            {stack.evidenceFilesRead}
          </p>
        </div>
      </div>

      <ul className="mt-6 grid gap-3">
        {stack.technologies.map((technology) => (
          <TechStackItem key={technology.name} technology={technology} />
        ))}
      </ul>
    </article>
  );
}

type TechStackItemProps = {
  technology: DetectedTechnology;
};

// Renders one technology row with compact evidence chips by default. Full
// evidence stays available in a disclosure so the stack remains easy to scan.
function TechStackItem({ technology }: TechStackItemProps) {
  const [isShowingAllSources, setIsShowingAllSources] = useState(false);
  const logoText = logoFallbacks[technology.name] ?? technology.name.slice(0, 2);
  const evidenceSummary = getEvidenceSummary(technology.evidence);
  const displayedSources = isShowingAllSources
    ? evidenceSummary.allItems
    : evidenceSummary.visibleItems;

  return (
    <li className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white font-mono text-sm font-semibold text-slate-800">
          {logoText}
        </span>
        <div className="min-w-0">
          <p className="break-words text-base font-semibold text-slate-950">
            {technology.name}
          </p>
          <p className="mt-1 text-sm text-slate-500">{technology.category}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-500">Found in</span>
        {displayedSources.map((item) => (
          <SourceChip item={item} key={item} />
        ))}
        {evidenceSummary.hiddenCount > 0 ? (
          <button
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-800"
            onClick={() => setIsShowingAllSources((isShowing) => !isShowing)}
            type="button"
          >
            {isShowingAllSources
              ? "Show fewer"
              : `+${evidenceSummary.hiddenCount} more`}
          </button>
        ) : null}
      </div>

      <details className="mt-3 group">
        <summary className="w-fit cursor-pointer rounded-md px-1 text-sm font-semibold text-emerald-700 transition hover:text-emerald-900">
          View evidence ({technology.evidence.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {technology.evidence.map((evidence) => (
            <EvidenceDetail evidence={evidence} key={getEvidenceKey(evidence)} />
          ))}
        </ul>
      </details>
    </li>
  );
}

type SourceChipProps = {
  item: string;
};

// Keeps source-location chips visually consistent whether they are shown by
// default or revealed through the overflow button.
function SourceChip({ item }: SourceChipProps) {
  return (
    <span className="inline-flex max-w-full items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
      <span className="truncate">{item}</span>
    </span>
  );
}

type EvidenceDetailProps = {
  evidence: TechStackEvidence;
};

// Shows the complete evidence detail only after the user expands a technology.
// This keeps common stack recognition fast while preserving auditability.
function EvidenceDetail({ evidence }: EvidenceDetailProps) {
  return (
    <li className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-600">
      <span className="font-semibold text-slate-800">{evidence.source}</span>
      {": "}
      <span>{evidence.detail}</span>
      {evidence.path ? (
        <span className="mt-1 block break-words font-mono text-xs text-slate-500">
          {evidence.path}
        </span>
      ) : null}
    </li>
  );
}

// Builds the small "Found in" chip list from unique evidence locations. Paths
// are more specific than source labels, so they are preferred when available.
function getEvidenceSummary(evidence: TechStackEvidence[]) {
  const allItems = Array.from(
    new Set(evidence.map((item) => item.path ?? item.source)),
  );
  const visibleItems = allItems.slice(0, 3);

  return {
    allItems,
    visibleItems,
    hiddenCount: Math.max(allItems.length - visibleItems.length, 0),
  };
}

// Creates a stable key from backend evidence fields without relying on array
// position, which may change as the detector gains more rules.
function getEvidenceKey(evidence: TechStackEvidence) {
  return `${evidence.source}-${evidence.detail}-${evidence.path ?? ""}`;
}

// Keeps the stack card visually stable while the backend fetches the small set
// of manifest and README evidence files.
function TechStackLoadingCard() {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Detecting stack
      </p>
      <div className="mt-4 space-y-3">
        <div className="h-7 w-1/2 rounded-md bg-slate-200" />
        <div className="h-4 w-full rounded-md bg-slate-100" />
        <div className="h-4 w-5/6 rounded-md bg-slate-100" />
      </div>
      <div className="mt-6 space-y-3">
        <div className="h-24 rounded-md border border-slate-200 bg-slate-50" />
        <div className="h-24 rounded-md border border-slate-200 bg-slate-50" />
      </div>
    </article>
  );
}
