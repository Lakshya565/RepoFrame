import { SiteHeader } from "@/components/site-header";
import { RepoUrlForm } from "@/components/repo-url-form";
import { Reveal, GrowLine, WordsReveal } from "@/components/motion/reveal";

// The three steps shown under the hero. Plain data so the markup stays a simple
// map rather than repeated hand-written blocks.
const STEPS = [
  {
    title: "Paste a repository URL",
    body: "Use the HTTPS clone or browser URL of any public GitHub repository.",
  },
  {
    title: "RepoFrame reads the evidence",
    body: "It ranks the most relevant files and detects the tech stack from real repository content — not guesses.",
  },
  {
    title: "Generate evidence-backed writeups",
    body: "Resume bullets, README sections, portfolio blurbs, and interview prep — each tied to evidence you can verify.",
  },
] as const;

// Landing page. Keeps the first screen focused on one action: submit a GitHub
// repository URL for analysis. The hero "opens up" as a staged cascade (handled
// by Reveal/GrowLine) so the first impression feels designed; the steps below
// reveal on scroll. Both honor prefers-reduced-motion.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader />

      <div className="mx-auto w-full max-w-3xl flex-1 px-5 py-16 sm:px-8 sm:py-24">
        <section className="flex max-w-2xl flex-col items-start gap-5">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Evidence-backed project writeups
            </p>
            <GrowLine className="mt-3 h-0.5 w-16 bg-brand" delay={0.25} />
          </Reveal>

          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            <WordsReveal
              text="Turn a GitHub repo into a writeup you can defend."
              delay={0.12}
            />
          </h1>

          <Reveal delay={0.5} y={24}>
            <p className="text-lg leading-8 text-muted-foreground">
              RepoFrame reads a repository&apos;s structure, files, and tech
              stack, then uses your project context to generate resume bullets,
              README sections, portfolio blurbs, and interview prep.
            </p>
          </Reveal>

          <Reveal delay={0.65} y={24} className="w-full pt-2">
            <RepoUrlForm />
          </Reveal>
        </section>

        <section className="mt-16 border-t pt-12">
          <Reveal inView>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              How it works
            </h2>
          </Reveal>
          <ol className="mt-6 grid gap-8 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <Reveal inView delay={index * 0.08}>
                  <span className="inline-flex size-7 items-center justify-center rounded-md border font-mono text-sm text-muted-foreground">
                    {index + 1}
                  </span>
                  <h3 className="mt-3 text-base font-medium">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    {step.body}
                  </p>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
