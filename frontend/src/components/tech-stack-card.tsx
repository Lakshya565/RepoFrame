"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchTechStack,
  type DetectedTechnology,
  type TechStackEvidence,
  type TechStackResponse,
} from "@/lib/repo-api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";

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
    return (
      <Card className="space-y-3 p-6">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </Card>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Stack detection unavailable"
        message={error}
        onRetry={loadStack}
      />
    );
  }

  if (!stack || stack.technologies.length === 0) {
    return (
      <EmptyState
        title="No stack detected yet"
        description="RepoFrame did not find stack evidence in the ranked README, dependency, configuration, or source-path signals for this repository."
      />
    );
  }

  return (
    <Card beam className="p-6">
      <h3 className="text-base font-semibold">Tech stack</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        What your project is built with.
      </p>

      <ul className="mt-4 grid gap-3">
        {stack.technologies.map((technology) => (
          <TechStackItem key={technology.name} technology={technology} />
        ))}
      </ul>
    </Card>
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
    <li className="rounded-md border bg-muted/40 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-card font-mono text-sm font-semibold">
          {logoText}
        </span>
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-foreground">
            {technology.name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {technology.category}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Found in
        </span>
        {displayedSources.map((item) => (
          <Badge variant="outline" className="max-w-full font-mono" key={item}>
            <span className="truncate">{item}</span>
          </Badge>
        ))}
        {evidenceSummary.hiddenCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setIsShowingAllSources((isShowing) => !isShowing)}
          >
            {isShowingAllSources
              ? "Show fewer"
              : `+${evidenceSummary.hiddenCount} more`}
          </Button>
        ) : null}
      </div>

      <details className="group mt-3">
        <summary className="w-fit cursor-pointer text-xs font-semibold text-brand transition-colors hover:underline">
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

type EvidenceDetailProps = {
  evidence: TechStackEvidence;
};

// Shows the complete evidence detail only after the user expands a technology.
// This keeps common stack recognition fast while preserving auditability.
function EvidenceDetail({ evidence }: EvidenceDetailProps) {
  return (
    <li className="rounded-md border bg-card px-3 py-2 text-sm leading-6 text-muted-foreground">
      <span className="font-semibold text-foreground">{evidence.source}</span>
      {": "}
      <span>{evidence.detail}</span>
      {evidence.path ? (
        <span className="mt-1 block break-words font-mono text-xs text-muted-foreground">
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
