"use client";

import { useCallback, useEffect, useState } from "react";

export type RepoResource<T> = {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  reload: () => void;
};

// Shared loader for a repoUrl-keyed backend resource (repo metadata, tech stack,
// …). It encapsulates the three things every analysis card needs and used to copy
// by hand: the initial fetch with a stale-response guard (so navigating to a
// different repo before a request resolves can't paint the wrong data), a manual
// reload for the retry button, and the loading/error bookkeeping.
//
// `fetcher` and `fallbackMessage` must be stable across renders (pass a
// module-level function and a constant string) so they don't re-trigger the
// effect on every render.
export function useRepoResource<T>(
  repoUrl: string,
  fetcher: (repoUrl: string) => Promise<T>,
  fallbackMessage: string,
): RepoResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Manual retry: no stale guard needed since it's a deliberate, user-triggered
  // refetch of the current repo.
  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setData(await fetcher(repoUrl));
    } catch (caught) {
      setData(null);
      setError(caught instanceof Error ? caught.message : fallbackMessage);
    } finally {
      setIsLoading(false);
    }
  }, [repoUrl, fetcher, fallbackMessage]);

  // Initial load, re-run whenever the repo changes. The isCurrentRequest flag
  // discards a response that arrives after the repo has already changed.
  useEffect(() => {
    let isCurrentRequest = true;

    async function run() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetcher(repoUrl);
        if (isCurrentRequest) {
          setData(result);
        }
      } catch (caught) {
        if (isCurrentRequest) {
          setData(null);
          setError(caught instanceof Error ? caught.message : fallbackMessage);
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
  }, [repoUrl, fetcher, fallbackMessage]);

  return { data, error, isLoading, reload };
}
