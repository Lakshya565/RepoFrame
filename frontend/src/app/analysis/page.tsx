import Link from "next/link";
import { GitHubRateLimitCard } from "@/components/github-rate-limit-card";
import { ImportantFilesCard } from "@/components/important-files-card";
import { RepoSummaryCard } from "@/components/repo-summary-card";
import { ProjectWriteupSection } from "@/components/project-writeup-section";
import { RepoTreeView } from "@/components/repo-tree-view";
import { TechStackCard } from "@/components/tech-stack-card";

type AnalysisPageProps = {
  searchParams: Promise<{
    owner?: string | string[];
    repo?: string | string[];
    normalizedUrl?: string | string[];
  }>;
};

// Pulls one query string value out of Next's possible string-or-array shape.
function getParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

// Validates the query params produced by the repo form and leaves live GitHub
// fetching to client components below. This keeps the route shell thin.
export default async function AnalysisPage({ searchParams }: AnalysisPageProps) {
  const params = await searchParams;
  const owner = getParam(params.owner);
  const repo = getParam(params.repo);
  const normalizedUrl = getParam(params.normalizedUrl);

  if (!owner || !repo || !normalizedUrl) {
    return (
      <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-950 sm:px-8">
        <section className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">
            RepoFrame could not read that repository.
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            Enter a GitHub URL in the format
            https://github.com/{`{owner}`}/{`{repo}`} or
            https://github.com/{`{owner}`}/{`{repo}`}.git.
          </p>
          <Link
            className="mt-6 inline-flex min-h-11 items-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            href="/"
          >
            Back to RepoFrame
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-950 sm:px-8">
      <section className="mx-auto max-w-3xl">
        <Link
          className="text-sm font-medium text-emerald-700 transition hover:text-emerald-900"
          href="/"
        >
          Back to RepoFrame
        </Link>

        <div className="mt-6 space-y-6">
          <RepoSummaryCard repoUrl={normalizedUrl} />
          <TechStackCard repoUrl={normalizedUrl} />
          <ImportantFilesCard repoUrl={normalizedUrl} />
          <RepoTreeView repoUrl={normalizedUrl} />
          <ProjectWriteupSection repoUrl={normalizedUrl} />
          <GitHubRateLimitCard />
        </div>
      </section>
    </main>
  );
}
