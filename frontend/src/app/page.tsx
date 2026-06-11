import { RepoUrlForm } from "@/components/repo-url-form";

// Landing page for the current RepoFrame flow. It keeps the first screen focused
// on one action: submit a GitHub repository URL for analysis.
export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-950 sm:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-4xl flex-col justify-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Evidence-backed project writeups
        </p>
        <h1 className="mt-5 text-5xl font-semibold leading-tight sm:text-6xl">
          RepoFrame
        </h1>
        <p className="mt-5 max-w-2xl text-xl leading-8 text-slate-600">
          Turn a GitHub repository into a clear project profile for resumes,
          portfolios, README sections, and interview prep.
        </p>

        <div className="mt-8 max-w-2xl">
          <RepoUrlForm />
        </div>

        <section className="mt-12 border-t border-slate-200 pt-8">
          <h2 className="text-2xl font-semibold">How it works</h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            Copy the repository&apos;s HTTPS browser or clone URL from GitHub.
            This first version validates the URL and shows the parsed owner and
            repository name.
          </p>
        </section>
      </section>
    </main>
  );
}
