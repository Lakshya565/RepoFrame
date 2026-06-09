import { RepoUrlForm } from "@/components/repo-url-form";

const workflowSteps = [
  {
    title: "Copy the HTTPS URL",
    description:
      "Open the GitHub repository and copy the browser URL or HTTPS clone URL.",
  },
  {
    title: "Analyze repo",
    description:
      "RepoFrame will use the owner and repository name to start a project profile flow.",
  },
  {
    title: "Review evidence",
    description:
      "Future phases will connect repository files, technical highlights, and generated outputs.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-12 px-5 py-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Evidence-backed project writeups
          </p>
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-tight text-slate-950 sm:text-6xl">
            RepoFrame
          </h1>
          <p className="mt-5 max-w-2xl text-xl leading-8 text-slate-600">
            Turn a GitHub repository into a clear project profile for resumes,
            portfolios, README sections, and interview prep.
          </p>
          <div className="mt-8 max-w-2xl">
            <RepoUrlForm />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Placeholder output
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">
                Project profile
              </h2>
            </div>
            <span className="rounded-md bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
              Phase 1
            </span>
          </div>
          <div className="mt-5 space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Evidence</p>
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-700">
                README.md, package.json, src/app/page.tsx
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-500">
                  Technical highlights
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  File ranking and stack detection will appear in later phases.
                </p>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-500">
                  Generated outputs
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Resume bullets and interview talking points are not connected
                  yet.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold text-slate-950">
              How it works
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Start with the HTTPS web URL from GitHub. This first version only
              validates the URL and opens a placeholder analysis page.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {workflowSteps.map((step, index) => (
              <div
                className="rounded-lg border border-slate-200 bg-slate-50 p-5"
                key={step.title}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-950 text-sm font-semibold text-white">
                  {index + 1}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-950">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
