"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderGit2, FolderOpen, Loader2, Trash2 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import {
  deleteProject,
  listProjects,
  type ProjectSummary,
} from "@/lib/projects-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";

// The saved-projects list, shared by the History tab and the /saved page. Lists
// the signed-in user's saved analyses (newest first) with open + delete. It owns
// the auth-aware fetch lifecycle: loading, error, empty, and populated states.

const LIST_ERROR = "RepoFrame could not load your saved projects.";

// Human "updated 3 days ago" from an ISO timestamp, so the list reads at a glance;
// the exact date stays available in the element's title. Falls back to a plain
// locale date for anything older than ~a month.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((Date.now() - then) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  if (seconds < 45) return "just now";
  if (seconds < 86400 * 30) {
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    for (const [unit, secondsPer] of units) {
      if (seconds >= secondsPer) {
        return formatter.format(-Math.round(seconds / secondsPer), unit);
      }
    }
  }
  return new Date(iso).toLocaleDateString();
}

export function SavedProjectsList() {
  const { status } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Initial load once signed in. The async work is defined INSIDE the effect (the
  // same shape as useRepoResource) with an `active` guard, so no state is updated
  // synchronously in the effect body. isLoading starts true, so the skeleton shows
  // until this resolves; signed-out users hit the prompt below (isLoading ignored).
  useEffect(() => {
    if (status !== "signedIn") {
      return;
    }
    let active = true;
    async function run() {
      try {
        const data = await listProjects();
        if (active) {
          setProjects(data);
          setError(null);
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : LIST_ERROR);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }
    void run();
    return () => {
      active = false;
    };
  }, [status]);

  // Manual reload for the retry button and after a failed delete — setState in an
  // event handler (not an effect) is fine.
  const reload = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      setProjects(await listProjects());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : LIST_ERROR);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deleteProject(id);
        setProjects((current) =>
          current ? current.filter((project) => project.id !== id) : current,
        );
      } catch {
        // Surface a failed delete by reloading the authoritative list.
        void reload();
      } finally {
        setDeletingId(null);
      }
    },
    [reload],
  );

  if (status === "loading" || (status === "signedIn" && isLoading)) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (status !== "signedIn") {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Log in with GitHub to see your saved analyses.
      </Card>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void reload()} />;
  }

  if (!projects || projects.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        No saved analyses yet. Analyze a repo and generate a writeup — it&apos;ll
        show up here.
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {projects.map((project) => (
        <li key={project.id}>
          <Card className="flex items-center justify-between gap-4 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="hidden size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground sm:flex"
                aria-hidden
              >
                <FolderGit2 className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {project.owner}/{project.repo}
                </p>
                <p
                  className="mt-0.5 text-xs text-muted-foreground"
                  title={new Date(project.updatedAt).toLocaleString()}
                >
                  Updated {relativeTime(project.updatedAt)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-label={`Open ${project.owner}/${project.repo}`}
                onClick={() =>
                  // Reopen (Phase 16.0): same route as a fresh paste, plus
                  // ?projectId so the layout's ProjectHydrator pre-fills the
                  // Generate page from this saved snapshot while the Analysis page
                  // loads live as usual.
                  router.push(
                    `/analysis/${encodeURIComponent(project.owner)}/${encodeURIComponent(project.repo)}?projectId=${encodeURIComponent(project.id)}`,
                  )
                }
              >
                <FolderOpen />
                Open
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Delete ${project.owner}/${project.repo}`}
                disabled={deletingId === project.id}
                onClick={() => void handleDelete(project.id)}
              >
                {deletingId === project.id ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 />
                )}
              </Button>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
