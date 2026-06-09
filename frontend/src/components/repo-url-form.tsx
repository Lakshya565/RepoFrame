"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { parseGitHubRepoUrl } from "@/lib/github-url";

export function RepoUrlForm() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedRepo = parseGitHubRepoUrl(repoUrl);

    if (!parsedRepo) {
      setError(
        "Enter a GitHub repository URL in the format https://github.com/{owner}/{repo} or https://github.com/{owner}/{repo}.git.",
      );
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const params = new URLSearchParams({
      owner: parsedRepo.owner,
      repo: parsedRepo.repo,
    });

    router.push(`/analysis?${params.toString()}`);
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
