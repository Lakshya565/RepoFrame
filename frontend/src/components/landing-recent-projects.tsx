"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FolderGit2, FolderOpen } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { listProjects, type ProjectSummary } from "@/lib/projects-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// A signed-in shortcut on the landing page: the user's most recent saved analyses
// with an Open button each, so they can jump straight back into stored work
// instead of analyzing a throwaway repo just to reach History. Renders NOTHING for
// signed-out visitors, in local dev (feature off), or when there are no saved
// analyses — so the signed-out landing is completely unchanged.
// How many recent analyses to surface inline before linking out to the full list.
const MAX_SHOWN = 4;

export function LandingRecentProjects() {
  const { status } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load once signed in. Fails quiet (empty) — a landing-page convenience should
  // never surface an error banner.
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
        }
      } catch {
        if (active) {
          setProjects([]);
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

  if (status !== "signedIn") {
    return null;
  }

  if (isLoading) {
    return (
      <div className="w-full pt-2">
        <Skeleton className="h-4 w-44" />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Skeleton className="h-[52px] w-full" />
          <Skeleton className="h-[52px] w-full" />
        </div>
      </div>
    );
  }

  // No saved analyses yet → nothing to shortcut to.
  if (!projects || projects.length === 0) {
    return null;
  }

  const shown = projects.slice(0, MAX_SHOWN);

  return (
    <section className="w-full pt-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Jump back into your work
        </h2>
        {projects.length > MAX_SHOWN ? (
          <Link
            href="/saved"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-brand"
          >
            View all {projects.length}
            <ArrowRight className="size-4" />
          </Link>
        ) : null}
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {shown.map((project) => (
          <li key={project.id}>
            <Card className="flex items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground"
                  aria-hidden
                >
                  <FolderGit2 className="size-4" />
                </span>
                <span className="truncate text-sm font-medium">
                  {project.owner}/{project.repo}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Open ${project.owner}/${project.repo}`}
                onClick={() =>
                  // Same reopen route the History list uses: ?projectId pre-fills
                  // the Generate page from the saved snapshot.
                  router.push(
                    `/analysis/${encodeURIComponent(project.owner)}/${encodeURIComponent(project.repo)}?projectId=${encodeURIComponent(project.id)}`,
                  )
                }
              >
                <FolderOpen />
                Open
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
