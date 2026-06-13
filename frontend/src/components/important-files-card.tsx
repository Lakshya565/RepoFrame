"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchRankedRepoFiles,
  type RepoFileRankingResponse,
  type RankedRepoFile,
} from "@/lib/repo-api";

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
    return <ImportantFilesLoadingCard />;
  }

  if (error) {
    return (
      <article className="rounded-lg border border-red-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">
          File ranking unavailable
        </p>
        <h2 className="mt-3 text-2xl font-semibold">
          RepoFrame could not rank important files.
        </h2>
        <p className="mt-3 text-base leading-7 text-slate-600">{error}</p>
        <button
          className="mt-5 inline-flex min-h-11 items-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          onClick={loadRanking}
          type="button"
        >
          Try again
        </button>
      </article>
    );
  }

  if (!ranking || ranking.rankedFiles.length === 0) {
    return (
      <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Important files
        </p>
        <h2 className="mt-3 text-2xl font-semibold">No files ranked yet</h2>
        <p className="mt-3 text-base leading-7 text-slate-600">
          RepoFrame did not find rankable source, README, or configuration files
          in this repository tree.
        </p>
      </article>
    );
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Important files
          </p>
          <h2 className="mt-3 text-2xl font-semibold">
            Top ranked evidence candidates
          </h2>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-500">Selected</p>
          <p className="mt-1 font-mono text-lg font-semibold text-slate-950">
            {numberFormatter.format(ranking.returnedFiles)}
          </p>
        </div>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatItem label="Tree files" value={ranking.totalFiles} />
        <StatItem label="Rankable" value={ranking.rankableFiles} />
        <StatItem label="Default branch" value={ranking.defaultBranch} />
      </dl>

      <ol className="mt-6 space-y-3">
        {ranking.rankedFiles.map((file) => (
          <ImportantFileRow file={file} key={file.path} />
        ))}
      </ol>
    </article>
  );
}

type StatItemProps = {
  label: string;
  value: number | string;
};

// Keeps ranking summary stats visually consistent with the existing repo tree
// card while allowing both numeric counts and branch names.
function StatItem({ label, value }: StatItemProps) {
  const formattedValue =
    typeof value === "number" ? numberFormatter.format(value) : value;

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="mt-2 break-words font-mono text-slate-950">
        {formattedValue}
      </dd>
    </div>
  );
}

type ImportantFileRowProps = {
  file: RankedRepoFile;
};

// Renders one ranked file with the backend score and reasons. Keeping reasons
// visible makes the deterministic selection easier to audit before AI phases.
function ImportantFileRow({ file }: ImportantFileRowProps) {
  return (
    <li className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="break-words font-mono text-sm font-semibold text-slate-950">
          {file.path}
        </p>
        <span className="inline-flex w-fit shrink-0 items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 font-mono text-sm font-semibold text-emerald-800">
          {file.importanceScore}
        </span>
      </div>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
        {file.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </li>
  );
}

// Keeps the important-files panel stable while the backend fetches and scores
// the repository tree.
function ImportantFilesLoadingCard() {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Ranking files
      </p>
      <div className="mt-4 space-y-3">
        <div className="h-7 w-2/3 rounded-md bg-slate-200" />
        <div className="h-4 w-full rounded-md bg-slate-100" />
        <div className="h-4 w-5/6 rounded-md bg-slate-100" />
      </div>
      <div className="mt-6 space-y-3">
        <div className="h-20 rounded-md border border-slate-200 bg-slate-50" />
        <div className="h-20 rounded-md border border-slate-200 bg-slate-50" />
      </div>
    </article>
  );
}
