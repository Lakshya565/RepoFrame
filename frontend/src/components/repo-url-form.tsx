"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

import { parseRepoUrl } from "@/lib/repo-api";
import { useAuth } from "@/lib/auth-context";
import { isDemoActive } from "@/lib/demo-fixture";
import { listProjects } from "@/lib/projects-api";
import { Button, buttonVariants } from "@/components/ui/button";
import { DuplicateRepoDialog } from "@/components/duplicate-repo-dialog";
import { GithubMark } from "@/components/github-mark";
import { HoverPopIcon } from "@/components/hover-pop-icon";
import { Input } from "@/components/ui/input";
import { GlowText } from "@/components/glow-text";
import { cn } from "@/lib/utils";

// The saved-projects feature flag. Duplicate detection only makes sense when
// History is on and the user is signed in (History is per-user); off otherwise.
const SAVED_FEATURE_ENABLED = process.env.NEXT_PUBLIC_SHOW_SAVED === "true";

// A repo the user is about to analyze that already exists in their History.
type DuplicateMatch = {
  owner: string;
  repo: string;
  projectId: string;
  updatedAt: string;
};

// Handles the initial repo URL entry flow. It sends raw user input to the backend
// parser, then routes with only normalized owner/repo/url values. Validation and
// parsing stay on the backend; this component only manages input + request state.
export function RepoUrlForm() {
  const router = useRouter();
  const { status, configured, signInWithGitHub } = useAuth();
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set when the pasted repo is already in the user's History, which opens the
  // "open saved vs re-analyze" dialog instead of navigating straight to a fresh run.
  const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null);

  // Routes to the analysis page for a repo, optionally reopening a saved snapshot
  // (?projectId) so the Generate page pre-fills from History.
  function goToAnalysis(owner: string, repo: string, projectId?: string) {
    // The analysis route carries the repo identity in the path; the full URL is
    // rebuilt from owner/repo on the other side (see lib/repo-url.ts).
    const base = `/analysis/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    router.push(
      projectId ? `${base}?projectId=${encodeURIComponent(projectId)}` : base,
    );
  }

  // Validates empty input locally, delegates real GitHub URL parsing to FastAPI,
  // then — for signed-in users with History on — checks whether this repo was
  // already analyzed and, if so, asks before navigating. Otherwise routes straight
  // to a fresh analysis.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!repoUrl.trim()) {
      setError("Enter a GitHub repository URL.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const parsedRepo = await parseRepoUrl(repoUrl);

      // Duplicate check: only when History is on and the user is signed in. A
      // lookup failure is non-fatal — fall through to a normal fresh analysis.
      if (SAVED_FEATURE_ENABLED && status === "signedIn") {
        try {
          const projects = await listProjects();
          const match = projects.find(
            (project) =>
              project.owner.toLowerCase() === parsedRepo.owner.toLowerCase() &&
              project.repo.toLowerCase() === parsedRepo.repo.toLowerCase(),
          );
          if (match) {
            setDuplicate({
              owner: parsedRepo.owner,
              repo: parsedRepo.repo,
              projectId: match.id,
              updatedAt: match.updatedAt,
            });
            setIsSubmitting(false);
            return;
          }
        } catch {
          // Ignore — a History lookup failure should never block analyzing.
        }
      }

      goToAnalysis(parsedRepo.owner, parsedRepo.repo);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "RepoFrame could not parse that URL.",
      );
      setIsSubmitting(false);
    }
  }

  // Signed-out + Supabase configured (production): analysis is login-gated, so
  // replace the input with a login prompt and a link to the frozen demo instead of
  // letting the user submit into a guaranteed 401. In local dev (unconfigured →
  // "disabled") and for signed-in users, the normal form renders.
  if (isDemoActive(status, configured)) {
    return (
      <div className="w-full">
        <p className="text-sm font-medium text-foreground">
          <GlowText text="Log in to analyze your own repository" />
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          <GlowText text="RepoFrame analyzes your GitHub repositories, so it needs you signed in. No account? Take a look at the demo first." />
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="brand"
            className="h-11 px-5 sm:w-auto"
            onClick={() => void signInWithGitHub()}
          >
            <GithubMark />
            Log in with GitHub
          </Button>
          <Link
            href="/demo"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "group h-11 gap-0 px-5",
            )}
          >
            View the demo
            <HoverPopIcon side="end">
              <ArrowRight />
            </HoverPopIcon>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {duplicate ? (
        <DuplicateRepoDialog
          open
          onOpenChange={(next) => {
            if (!next) setDuplicate(null);
          }}
          owner={duplicate.owner}
          repo={duplicate.repo}
          updatedAt={duplicate.updatedAt}
          onOpenSaved={() =>
            goToAnalysis(duplicate.owner, duplicate.repo, duplicate.projectId)
          }
          onReanalyze={() => goToAnalysis(duplicate.owner, duplicate.repo)}
        />
      ) : null}
      <form className="w-full" onSubmit={handleSubmit} noValidate>
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="repo-url"
        >
        <GlowText text="GitHub repository URL" />
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Input
          aria-describedby={error ? "repo-url-error" : "repo-url-help"}
          aria-invalid={error ? true : undefined}
          className="h-11 flex-1 font-mono text-sm"
          disabled={isSubmitting}
          id="repo-url"
          onChange={(event) => {
            setRepoUrl(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          placeholder="https://github.com/{owner}/{repo}"
          type="url"
          value={repoUrl}
        />
        <Button
          type="submit"
          variant="brand"
          className="h-11 px-5 sm:w-auto"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              Analyze repo
              <ArrowRight />
            </>
          )}
        </Button>
      </div>
      <div className="mt-2 min-h-5 text-sm">
        {error ? (
          <p className="text-destructive" id="repo-url-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="text-muted-foreground" id="repo-url-help">
            <GlowText text="Use the HTTPS clone or browser URL of any public GitHub repository." />
          </p>
        )}
      </div>
      </form>
    </>
  );
}
