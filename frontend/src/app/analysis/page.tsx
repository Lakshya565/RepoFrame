import Link from "next/link";
import { buildGitHubRepoUrl, normalizeGitHubRepoName } from "@/lib/github-url";

type AnalysisPageSearchParams = {
  owner?: string | string[];
  repo?: string | string[];
};

type AnalysisPageProps = {
  searchParams: Promise<AnalysisPageSearchParams>;
};

function getSingleParam(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return value;
}

export default async function AnalysisPage({ searchParams }: AnalysisPageProps) {
  const params = await searchParams;
  const owner = getSingleParam(params.owner);
  const repoParam = getSingleParam(params.repo);
  const repo = repoParam ? normalizeGitHubRepoName(repoParam) : null;
  const normalizedUrl =
    owner && repo ? buildGitHubRepoUrl(owner, repo) : null;

  if (!owner || !repo || !normalizedUrl) {
    return (
      <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950 sm:px-8">
        <section className="mx-auto max-w-3xl rounded-lg border border-red-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">
            Invalid repository
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-950">
            RepoFrame could not read that GitHub URL.
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            Return to the landing page and enter a URL in the format
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
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950 sm:px-8">
      <section className="mx-auto max-w-5xl">
        <Link
          className="text-sm font-medium text-emerald-700 transition hover:text-emerald-900"
          href="/"
        >
          Back to RepoFrame
        </Link>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Placeholder analysis
          </p>
          <div className="mt-4 flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-slate-950 sm:text-4xl">
                {owner}/{repo}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                This confirms the frontend can parse a GitHub repository URL and
                route into the analysis flow without calling the backend.
              </p>
            </div>
            <a
              className="inline-flex min-h-11 w-fit items-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
              href={normalizedUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open repository
            </a>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-500">Owner</p>
              <p className="mt-2 break-words font-mono text-lg text-slate-950">
                {owner}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-500">Repo</p>
              <p className="mt-2 break-words font-mono text-lg text-slate-950">
                {repo}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-500">
                Normalized URL
              </p>
              <p className="mt-2 break-words font-mono text-sm leading-6 text-slate-950">
                {normalizedUrl}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-950">
              Next phases
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Backend URL parsing, GitHub metadata fetching, evidence mapping,
              and generated outputs will be connected in later phases.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
