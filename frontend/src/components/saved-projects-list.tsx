"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Loader2, Trash2 } from "lucide-react";

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
// the signed-in user's saved analyses (newest first) with open + delete. Gated by
// the caller behind NEXT_PUBLIC_SHOW_SAVED; here it only worries about auth state
// and the fetch lifecycle (loading / error / empty / list).

const LIST_ERROR = "RepoFrame could not load your saved projects.";

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
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {project.owner}/{project.repo}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Updated {new Date(project.updatedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  router.push(
                    `/analysis/${encodeURIComponent(project.owner)}/${encodeURIComponent(project.repo)}`,
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
