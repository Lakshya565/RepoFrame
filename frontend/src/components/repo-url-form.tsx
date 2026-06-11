"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { parseRepoUrl } from "@/lib/repo-api";

// Handles the initial repo URL entry flow. It sends raw user input to the
// backend parser, then routes with only normalized owner/repo/url values.
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
    <form
      className="w-full rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      onSubmit={handleSubmit}
      noValidate
    >
      <label
        className="text-sm font-medium text-slate-900"
        htmlFor="repo-url"
      >
        GitHub repository URL
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          aria-describedby={error ? "repo-url-error" : "repo-url-help"}
          className="min-h-12 flex-1 rounded-md border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50"
          disabled={isSubmitting}
          id="repo-url"
          onChange={(event) => {
            setRepoUrl(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          placeholder="https://github.com/{owner}/{repo}.git"
          type="url"
          value={repoUrl}
        />
        <button
          className="min-h-12 rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Analyzing..." : "Analyze repo"}
        </button>
      </div>
      <div className="mt-3 text-sm">
        {error ? (
          <p className="text-red-700" id="repo-url-error">
            {error}
          </p>
        ) : (
          <p className="text-slate-500" id="repo-url-help">
            Use the HTTPS clone URL or browser URL from a public GitHub
            repository.
          </p>
        )}
      </div>
    </form>
  );
}
