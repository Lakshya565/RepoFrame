import { SiteHeader } from "@/components/site-header";
import { RepoUrlForm } from "@/components/repo-url-form";
import { Reveal, GrowLine } from "@/components/motion/reveal";
import { KineticLetters } from "@/components/kinetic-letters";
import { GlowText } from "@/components/glow-text";
import { MagicCard } from "@/components/ui/magic-card";

// Green treatment for the repo-URL MagicCard: the cursor-following border beam
// (from → to) and the soft inner spotlight. Kept as named constants so the card's
// green is easy to retune in one place.
const URL_CARD_BEAM_FROM = "#157f4c";
const URL_CARD_BEAM_TO = "#45c07d";
const URL_CARD_SPOTLIGHT = "#157f4c";
const URL_CARD_SPOTLIGHT_OPACITY = 0.12;

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

// Landing page. The hero "opens up" as a staged cascade: the kinetic wordmark
// reveals letter by letter and keeps a gentle wobble, then the tagline,
// description, and form fade in. Every piece of body text (everything except the
// title, inputs, and buttons) lights up green under the cursor via GlowText. All
// entrance motion and the glow honor prefers-reduced-motion.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader />

      <div className="mx-auto w-full max-w-3xl flex-1 px-5 py-16 sm:px-8 sm:py-24">
        <section className="flex max-w-2xl flex-col items-start gap-5">
          {/* Tier 1 — the product name: per-letter fade entrance plus a gentle
              continuous kinetic wobble, in the text's normal color. */}
          <div>
            <h1 className="font-mono text-6xl tracking-tight sm:text-7xl">
              <KineticLetters text="RepoFrame" delay={0.1} />
            </h1>
            <GrowLine className="mt-4 h-0.5 w-20 bg-brand" delay={0.55} />
          </div>

          {/* Tier 2 — the tagline, as a subheading that glows under the cursor. */}
          <Reveal delay={0.5} y={20} className="w-full">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              <GlowText text="Turn a GitHub repo into a writeup you can defend." />
            </h2>
          </Reveal>

          {/* Tier 3 — what RepoFrame does, as a sub-subheading. */}
          <Reveal delay={0.95} y={20} className="w-full">
            <p className="text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              <GlowText text="RepoFrame reads a repository's structure, files, and tech stack, then uses your project context to generate resume bullets, README sections, portfolio blurbs, and interview prep." />
            </p>
          </Reveal>

          <Reveal delay={1.1} y={20} className="w-full pt-2">
            <MagicCard
              className="rounded-xl"
              gradientFrom={URL_CARD_BEAM_FROM}
              gradientTo={URL_CARD_BEAM_TO}
              gradientColor={URL_CARD_SPOTLIGHT}
              gradientOpacity={URL_CARD_SPOTLIGHT_OPACITY}
            >
              <div className="p-6">
                <RepoUrlForm />
              </div>
            </MagicCard>
          </Reveal>
        </section>

        <section className="mt-16 border-t pt-12">
          <Reveal inView>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <GlowText text="How it works" />
            </h2>
          </Reveal>
          <ol className="mt-6 grid gap-8 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <Reveal inView delay={index * 0.08}>
                  <span className="inline-flex size-7 items-center justify-center rounded-md border font-mono text-sm text-muted-foreground">
                    {index + 1}
                  </span>
                  <h3 className="mt-3 text-base font-medium">
                    <GlowText text={step.title} />
                  </h3>
                  <div className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    <GlowText text={step.body} />
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
