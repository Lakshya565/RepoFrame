"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";

import { fetchRepoMetadata, type RepoMetadataResponse } from "@/lib/repo-api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RepoSummaryCardProps = {
  repoUrl: string;
};

type SummaryField = {
  label: string;
  value: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

// Fetches and displays the repository metadata used as the first summary of an
// analysis. The component owns loading, error, retry, and empty states so the
// route page can stay focused on layout.
export function RepoSummaryCard({ repoUrl }: RepoSummaryCardProps) {
  const [metadata, setMetadata] = useState<RepoMetadataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Reloads metadata after a failure using the same repo URL that initialized
  // the card. This is the retry path shown in the error state.
  const loadMetadata = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const repoMetadata = await fetchRepoMetadata(repoUrl);
      setMetadata(repoMetadata);
    } catch (error) {
      setMetadata(null);
      setError(
        error instanceof Error
          ? error.message
          : "RepoFrame could not fetch repository metadata.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [repoUrl]);

  // Runs the initial metadata fetch and ignores stale responses if the user
  // navigates to another repository before the request finishes.
  useEffect(() => {
    let isCurrentRequest = true;

    async function run() {
      setIsLoading(true);
      setError(null);

      try {
        const repoMetadata = await fetchRepoMetadata(repoUrl);
        if (isCurrentRequest) {
          setMetadata(repoMetadata);
        }
      } catch (error) {
        if (isCurrentRequest) {
          setMetadata(null);
          setError(
            error instanceof Error
              ? error.message
              : "RepoFrame could not fetch repository metadata.",
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

  // Builds the visible stat list dynamically so optional GitHub fields, such as
  // primary language, can drop out without leaving empty UI cells.
  const summaryFields = useMemo<SummaryField[]>(() => {
    if (!metadata) {
      return [];
    }

    return [
      { label: "Default branch", value: metadata.defaultBranch },
      { label: "Stars", value: numberFormatter.format(metadata.stars) },
      { label: "Forks", value: numberFormatter.format(metadata.forks) },
      ...(metadata.language
        ? [{ label: "Primary language", value: metadata.language }]
        : []),
    ];
  }, [metadata]);

  if (isLoading) {
    return (
      <Card className="space-y-4 p-6">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-[68px]" />
          ))}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Repository metadata unavailable"
        message={error}
        onRetry={loadMetadata}
      />
    );
  }

  if (!metadata) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          No repository metadata was returned.
        </p>
      </Card>
    );
  }

  return (
    <Card beam className="p-6">
      <div className="flex flex-col items-start gap-3">
        <h3 className="break-words text-lg font-semibold">
          {metadata.owner}/{metadata.name}
        </h3>
        <a
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          href={metadata.htmlUrl}
          rel="noreferrer"
          target="_blank"
        >
          Open repository
          <ExternalLink />
        </a>
      </div>

      {metadata.description ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {metadata.description}
        </p>
      ) : null}

      <dl className="mt-5 grid grid-cols-2 gap-3">
        {summaryFields.map((field) => (
          <div className="rounded-md border bg-muted/40 p-4" key={field.label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {field.label}
            </dt>
            <dd className="mt-1.5 break-words font-mono text-sm text-foreground">
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
