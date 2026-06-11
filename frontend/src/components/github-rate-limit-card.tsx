"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchGitHubRateLimit,
  type GitHubRateLimitResponse,
} from "@/lib/repo-api";

const numberFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  style: "percent",
});

// Displays GitHub's core REST API budget for the active backend token or IP
// bucket. This gives a quick signal when local analysis is close to rate limits.
export function GitHubRateLimitCard() {
  const [rateLimit, setRateLimit] = useState<GitHubRateLimitResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Refreshes GitHub's core API budget through the backend, which keeps the
  // token server-side and avoids exposing secret state to the browser.
  const loadRateLimit = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setRateLimit(await fetchGitHubRateLimit());
    } catch (error) {
      setRateLimit(null);
      setError(
        error instanceof Error
          ? error.message
          : "RepoFrame could not fetch GitHub rate limit status.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetches the initial rate-limit status when the card mounts and ignores the
  // result if the component unmounts before the request completes.
  useEffect(() => {
    let isCurrentRequest = true;

    async function run() {
      setIsLoading(true);
      setError(null);

      try {
        const status = await fetchGitHubRateLimit();
        if (isCurrentRequest) {
          setRateLimit(status);
        }
      } catch (error) {
        if (isCurrentRequest) {
          setRateLimit(null);
          setError(
            error instanceof Error
              ? error.message
              : "RepoFrame could not fetch GitHub rate limit status.",
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
  }, []);

  // Converts GitHub's UTC reset timestamp into a local display string so the
  // user knows when the current API bucket will refill.
  const resetTime = useMemo(() => {
    if (!rateLimit) {
      return null;
    }

    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(rateLimit.resetAt));
  }, [rateLimit]);

  if (isLoading) {
    return (
      <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
          GitHub API usage
        </p>
        <div className="mt-3 h-4 w-2/3 rounded-md bg-slate-100" />
      </article>
    );
  }

  if (error) {
    return (
      <article className="rounded-lg border border-amber-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              GitHub API usage
            </p>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
          </div>
          <button
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
            onClick={loadRateLimit}
            type="button"
          >
            Refresh
          </button>
        </div>
      </article>
    );
  }

  if (!rateLimit) {
    return null;
  }

  const usedRatio = rateLimit.limit > 0 ? rateLimit.used / rateLimit.limit : 0;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            GitHub API usage
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {rateLimit.isAuthenticated
              ? "Using backend GitHub token"
              : "Using unauthenticated GitHub limit"}
          </p>
        </div>
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          onClick={loadRateLimit}
          type="button"
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <RateLimitStat
          label="Remaining"
          value={numberFormatter.format(rateLimit.remaining)}
        />
        <RateLimitStat
          label="Used"
          value={numberFormatter.format(rateLimit.used)}
        />
        <RateLimitStat
          label="Limit"
          value={numberFormatter.format(rateLimit.limit)}
        />
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-600"
          style={{ width: percentFormatter.format(Math.min(usedRatio, 1)) }}
        />
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Core REST API resets at {resetTime}.
      </p>
    </article>
  );
}

type RateLimitStatProps = {
  label: string;
  value: string;
};

// Small repeated stat block for the rate-limit card's remaining/used/limit
// values. Keeping it local avoids a shared component before the UI needs one.
function RateLimitStat({ label, value }: RateLimitStatProps) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 font-mono text-lg font-semibold text-slate-950">
        {value}
      </p>
    </div>
  );
}
