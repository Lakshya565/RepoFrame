"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchRepoMetadata, type RepoMetadataResponse } from "@/lib/repo-api";

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
    return <RepoSummaryLoadingCard />;
  }

  if (error) {
    return (
      <article className="rounded-lg border border-red-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">
          Metadata unavailable
        </p>
        <h2 className="mt-3 text-2xl font-semibold">
          RepoFrame could not fetch this repository.
        </h2>
        <p className="mt-3 text-base leading-7 text-slate-600">{error}</p>
        <button
          className="mt-5 inline-flex min-h-11 items-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          onClick={loadMetadata}
          type="button"
        >
          Try again
        </button>
      </article>
    );
  }

  if (!metadata) {
    return (
      <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-base text-slate-600">
          No repository metadata was returned.
        </p>
      </article>
    );
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Repo summary
          </p>
          <h2 className="mt-3 break-words text-3xl font-semibold">
            {metadata.owner}/{metadata.name}
          </h2>
        </div>
        <a
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          href={metadata.htmlUrl}
          rel="noreferrer"
          target="_blank"
        >
          Open repository
        </a>
      </div>

      {metadata.description ? (
        <p className="mt-5 text-base leading-7 text-slate-600">
          {metadata.description}
        </p>
      ) : null}

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        {summaryFields.map((field) => (
          <div
            className="rounded-md border border-slate-200 bg-slate-50 p-4"
            key={field.label}
          >
            <dt className="text-sm font-medium text-slate-500">
              {field.label}
            </dt>
            <dd className="mt-2 break-words font-mono text-slate-950">
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

// Shows fixed-size placeholders that match the final card shape while the
// metadata request is in flight.
function RepoSummaryLoadingCard() {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Fetching metadata
      </p>
      <div className="mt-4 space-y-3">
        <div className="h-8 w-2/3 rounded-md bg-slate-200" />
        <div className="h-4 w-full rounded-md bg-slate-100" />
        <div className="h-4 w-4/5 rounded-md bg-slate-100" />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <div
            className="h-20 rounded-md border border-slate-200 bg-slate-50"
            key={item}
          />
        ))}
      </div>
    </article>
  );
}
