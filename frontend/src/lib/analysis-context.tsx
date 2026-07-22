"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import {
  clearRepoSessionCaches,
  streamRepoAnalysis,
  type RepoAnalysisStreamEvent,
  type RepoFileRankingResponse,
  type RepoMetadataResponse,
  type RepoTreeResponse,
  type TechStackResponse,
} from "@/lib/repo-api";
import {
  demoFetchRankedFiles,
  demoFetchRepoMetadata,
  demoFetchRepoTree,
  demoFetchTechStack,
} from "@/lib/demo-analysis";
import { useDemo } from "@/lib/demo-mode";
import { useAuth } from "@/lib/auth-context";
import type { RepoResource } from "@/lib/use-repo-resource";

const FRESH_MS = 5 * 60 * 1000;
const STALE_MS = 30 * 60 * 1000;
const MAX_SESSION_REPOS = 10;

type AnalysisState = {
  metadata: Omit<RepoResource<RepoMetadataResponse>, "reload">;
  tree: Omit<RepoResource<RepoTreeResponse>, "reload">;
  ranking: Omit<RepoResource<RepoFileRankingResponse>, "reload">;
  techStack: Omit<RepoResource<TechStackResponse>, "reload">;
  isCoreComplete: boolean;
};

type AnalysisContextValue = {
  metadata: RepoResource<RepoMetadataResponse>;
  tree: RepoResource<RepoTreeResponse>;
  ranking: RepoResource<RepoFileRankingResponse>;
  techStack: RepoResource<TechStackResponse>;
  isCoreComplete: boolean;
};

type SessionEntry = { state: AnalysisState; completedAt: number };
type Listener = (state: AnalysisState) => void;
type InflightEntry = {
  listeners: Set<Listener>;
  promise: Promise<void>;
  controller: AbortController;
};

const AnalysisContext = createContext<AnalysisContextValue | null>(null);
const sessionCache = new Map<string, SessionEntry>();
const inflight = new Map<string, InflightEntry>();

function loadingResource<T>() {
  return { data: null as T | null, error: null, isLoading: true };
}

function initialState(): AnalysisState {
  return {
    metadata: loadingResource<RepoMetadataResponse>(),
    tree: loadingResource<RepoTreeResponse>(),
    ranking: loadingResource<RepoFileRankingResponse>(),
    techStack: loadingResource<TechStackResponse>(),
    isCoreComplete: false,
  };
}

function updateFromEvent(
  state: AnalysisState,
  event: RepoAnalysisStreamEvent,
): AnalysisState {
  if (event.type === "metadata") {
    performance.mark("repoframe-analysis-metadata");
    return {
      ...state,
      metadata: { data: event.data, error: null, isLoading: false },
    };
  }
  if (event.type === "structure") {
    return {
      ...state,
      tree: { data: event.data.tree, error: null, isLoading: false },
      ranking: {
        data: event.data.rankedFiles,
        error: null,
        isLoading: false,
      },
    };
  }
  if (event.type === "techStack") {
    return {
      ...state,
      techStack: { data: event.data, error: null, isLoading: false },
    };
  }
  if (event.type === "complete") {
    performance.mark("repoframe-analysis-core-complete");
    return { ...state, isCoreComplete: true };
  }
  if (event.type === "error") {
    const fail = <T,>(resource: Omit<RepoResource<T>, "reload">) =>
      resource.data
        ? resource
        : { data: null, error: event.detail, isLoading: false };
    return {
      metadata: fail(state.metadata),
      tree: fail(state.tree),
      ranking: fail(state.ranking),
      techStack: fail(state.techStack),
      isCoreComplete: true,
    };
  }
  return state;
}

function storeSessionState(key: string, state: AnalysisState, completed: boolean) {
  const existing = sessionCache.get(key);
  sessionCache.delete(key);
  sessionCache.set(key, {
    state,
    completedAt: completed ? Date.now() : (existing?.completedAt ?? 0),
  });
  while (sessionCache.size > MAX_SESSION_REPOS) {
    const oldest = sessionCache.keys().next().value;
    if (typeof oldest === "string") {
      sessionCache.delete(oldest);
    }
  }
}

function startSharedAnalysis(repoUrl: string, key: string): InflightEntry {
  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }

  const listeners = new Set<Listener>();
  const controller = new AbortController();
  let current = sessionCache.get(key)?.state ?? initialState();
  const promise = streamRepoAnalysis(
    repoUrl,
    (event) => {
      current = updateFromEvent(current, event);
      storeSessionState(key, current, event.type === "complete");
      listeners.forEach((listener) => listener(current));
    },
    controller.signal,
  )
    .catch((caught) => {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        return;
      }
      const detail =
        caught instanceof Error
          ? caught.message
          : "RepoFrame could not analyze this repository.";
      current = updateFromEvent(current, {
        type: "error",
        stage: "analysis",
        detail,
        status: 500,
        retryable: true,
      });
      storeSessionState(key, current, false);
      listeners.forEach((listener) => listener(current));
    })
    .finally(() => {
      if (inflight.get(key)?.promise === promise) {
        inflight.delete(key);
      }
    });

  const entry = { listeners, promise, controller };
  inflight.set(key, entry);
  return entry;
}

function clearAnalysisSessionCache() {
  inflight.forEach((entry) => entry.controller.abort());
  sessionCache.clear();
  inflight.clear();
  clearRepoSessionCaches();
}

type AnalysisProviderProps = {
  repoUrl: string;
  analysisPath: string;
  children: ReactNode;
};

// Persists the progressive analysis across tab navigation while avoiding any
// repository work for users who open Generate or History directly.
export function AnalysisProvider({
  repoUrl,
  analysisPath,
  children,
}: AnalysisProviderProps) {
  const pathname = usePathname();
  const demo = useDemo();
  const { status } = useAuth();
  const previousAuthStatus = useRef(status);
  const cacheKey = `${demo ? "demo" : "live"}:${repoUrl.toLowerCase()}`;
  const [state, setState] = useState<AnalysisState>(() =>
    sessionCache.get(cacheKey)?.state ?? initialState(),
  );

  const load = useCallback(
    (force = false) => {
      if (force) {
        sessionCache.delete(cacheKey);
      }

      if (demo) {
        void Promise.all([
          demoFetchRepoMetadata(),
          demoFetchRepoTree(),
          demoFetchRankedFiles(),
          demoFetchTechStack(),
        ]).then(([metadata, tree, ranking, techStack]) => {
          const next: AnalysisState = {
            metadata: { data: metadata, error: null, isLoading: false },
            tree: { data: tree, error: null, isLoading: false },
            ranking: { data: ranking, error: null, isLoading: false },
            techStack: { data: techStack, error: null, isLoading: false },
            isCoreComplete: true,
          };
          storeSessionState(cacheKey, next, true);
          setState(next);
        });
        return () => undefined;
      }

      const entry = startSharedAnalysis(repoUrl, cacheKey);
      const listener: Listener = (next) => setState(next);
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    [cacheKey, demo, repoUrl],
  );

  useEffect(() => {
    if (pathname !== analysisPath) {
      return;
    }
    // Wait for a persisted Supabase session before issuing a gated backend call.
    // Signed-out production users see the demo/gate; open local development uses
    // the separate "disabled" state and continues to analyze normally.
    if (status === "loading" || (!demo && status === "signedOut")) {
      return;
    }

    const cached = sessionCache.get(cacheKey);
    if (cached) {
      if (Date.now() - cached.completedAt < FRESH_MS) {
        return;
      }
      if (Date.now() - cached.completedAt >= STALE_MS) {
        return load(true);
      }
    }
    return load(false);
  }, [analysisPath, cacheKey, demo, load, pathname, status]);

  useEffect(() => {
    // Clear private session data only on a real signed-in -> signed-out change.
    // Treating the initial signed-out resolution as a logout used to abort the
    // demo/public load that had just started in the neighboring effect.
    if (previousAuthStatus.current === "signedIn" && status === "signedOut") {
      clearAnalysisSessionCache();
      queueMicrotask(() => setState(initialState()));
    }
    previousAuthStatus.current = status;
  }, [status]);

  const reload = useCallback(() => {
    load(true);
  }, [load]);

  const value = useMemo<AnalysisContextValue>(
    () => ({
      metadata: { ...state.metadata, reload },
      tree: { ...state.tree, reload },
      ranking: { ...state.ranking, reload },
      techStack: { ...state.techStack, reload },
      isCoreComplete: state.isCoreComplete,
    }),
    [reload, state],
  );

  return (
    <AnalysisContext.Provider value={value}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useRepoAnalysis(): AnalysisContextValue {
  const value = useContext(AnalysisContext);
  if (!value) {
    throw new Error("useRepoAnalysis must be used within an AnalysisProvider");
  }
  return value;
}
