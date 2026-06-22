"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

import { parseRepoUrl } from "@/lib/repo-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Handles the initial repo URL entry flow. It sends raw user input to the backend
// parser, then routes with only normalized owner/repo/url values. Validation and
// parsing stay on the backend; this component only manages input + request state.
export function RepoUrlForm() {
  const router = useRouter();
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
      const params = new URLSearchParams({
        owner: parsedRepo.owner,
        repo: parsedRepo.repo,
        normalizedUrl: parsedRepo.normalizedUrl,
      });

      router.push(`/analysis?${params.toString()}`);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "RepoFrame could not parse that URL.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <form className="w-full" onSubmit={handleSubmit} noValidate>
      <label
        className="text-sm font-medium text-foreground"
        htmlFor="repo-url"
      >
        GitHub repository URL
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
            Use the HTTPS clone or browser URL of any public GitHub repository.
          </p>
        )}
      </div>
    </form>
  );
}
