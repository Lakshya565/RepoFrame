"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchRankedRepoFiles,
  type RepoFileRankingResponse,
  type RankedRepoFile,
} from "@/lib/repo-api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";

type ImportantFilesCardProps = {
  repoUrl: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

// Shows the deterministic Phase 5 file selections. These are the files
// RepoFrame considers most useful for later evidence gathering and generation.
export function ImportantFilesCard({ repoUrl }: ImportantFilesCardProps) {
  const [ranking, setRanking] = useState<RepoFileRankingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Reloads the ranking request for both initial fetches and user-triggered
  // retries. The backend owns all score and filtering rules.
  const loadRanking = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const rankedFiles = await fetchRankedRepoFiles(repoUrl);
      setRanking(rankedFiles);
    } catch (error) {
      setRanking(null);
      setError(
        error instanceof Error
          ? error.message
          : "RepoFrame could not rank important repository files.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [repoUrl]);

  // Runs the initial ranking fetch for the current repo URL and ignores stale
  // responses if the page changes before the backend responds.
  useEffect(() => {
    let isCurrentRequest = true;

    async function run() {
      setIsLoading(true);
      setError(null);

      try {
        const rankedFiles = await fetchRankedRepoFiles(repoUrl);
        if (isCurrentRequest) {
          setRanking(rankedFiles);
        }
      } catch (error) {
        if (isCurrentRequest) {
          setRanking(null);
          setError(
            error instanceof Error
              ? error.message
              : "RepoFrame could not rank important repository files.",
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
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-[68px]" />
          ))}
        </div>
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </Card>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="File ranking unavailable"
        message={error}
        onRetry={loadRanking}
      />
    );
  }

  if (!ranking || ranking.rankedFiles.length === 0) {
    return (
      <EmptyState
        title="No files ranked yet"
        description="RepoFrame did not find rankable source, README, or configuration files in this repository tree."
      />
    );
  }

  return (
    <Card beam className="p-6">
      <p className="text-sm text-muted-foreground">
        We focused on {numberFormatter.format(ranking.returnedFiles)} of{" "}
        {numberFormatter.format(ranking.totalFiles)} files to understand your
        project.
      </p>

      <ol className="mt-4 space-y-3">
        {ranking.rankedFiles.map((file) => (
          <ImportantFileRow file={file} key={file.path} />
        ))}
      </ol>
    </Card>
  );
}

type ImportantFileRowProps = {
  file: RankedRepoFile;
};

// Renders one selected file with the human-readable reasons it was chosen. The
// internal importance score is intentionally not shown — it reads as developer
// detail rather than something a visitor needs.
function ImportantFileRow({ file }: ImportantFileRowProps) {
  return (
    <li className="rounded-md border bg-muted/40 p-4">
      <p className="break-words font-mono text-sm font-semibold text-foreground">
        {file.path}
      </p>
      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-muted-foreground">
        {file.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </li>
  );
}
