import Link from "next/link";
import { buildGitHubRepoUrl, normalizeGitHubRepoName } from "@/lib/github-url";

type AnalysisPageProps = {
  searchParams: Promise<{
    owner?: string | string[];
    repo?: string | string[];
  }>;
};

function getParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export default async function AnalysisPage({ searchParams }: AnalysisPageProps) {
  const params = await searchParams;
  const owner = getParam(params.owner);
  const repoParam = getParam(params.repo);
  const repo = repoParam ? normalizeGitHubRepoName(repoParam) : null;
  const repoUrl = owner && repo ? buildGitHubRepoUrl(owner, repo) : null;

  if (!owner || !repo || !repoUrl) {
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

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Placeholder analysis
          </p>
          <h1 className="mt-4 text-3xl font-semibold">{owner}/{repo}</h1>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <dt className="text-sm font-medium text-slate-500">Owner</dt>
              <dd className="mt-2 break-words font-mono text-slate-950">
                {owner}
              </dd>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <dt className="text-sm font-medium text-slate-500">Repo</dt>
              <dd className="mt-2 break-words font-mono text-slate-950">
                {repo}
              </dd>
            </div>
          </dl>
          <a
            className="mt-6 inline-flex min-h-11 items-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
            href={repoUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open repository
          </a>
        </div>
      </section>
    </main>
  );
}
