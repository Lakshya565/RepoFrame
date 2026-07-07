"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, LogIn } from "lucide-react";

import { parseRepoUrl } from "@/lib/repo-api";
import { useAuth } from "@/lib/auth-context";
import { isDemoActive } from "@/lib/demo-fixture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlowText } from "@/components/glow-text";

// Handles the initial repo URL entry flow. It sends raw user input to the backend
// parser, then routes with only normalized owner/repo/url values. Validation and
// parsing stay on the backend; this component only manages input + request state.
export function RepoUrlForm() {
  const router = useRouter();
  const { status, configured, signInWithGitHub } = useAuth();
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validates empty input locally, delegates real GitHub URL parsing to FastAPI,
  // and hands the normalized repo identity to the analysis route.
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
      // The analysis route carries the repo identity in the path; the full URL is
      // rebuilt from owner/repo on the other side (see lib/repo-url.ts).
      router.push(
        `/analysis/${encodeURIComponent(parsedRepo.owner)}/${encodeURIComponent(parsedRepo.repo)}`,
      );
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
            <LogIn />
            Log in with GitHub
          </Button>
          <Link
            href="/demo"
            className="inline-flex h-11 items-center justify-center rounded-md px-5 text-sm font-medium text-muted-foreground transition-colors hover:text-brand"
          >
            View the demo
            <ArrowRight className="ml-1 size-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
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
  );
}
