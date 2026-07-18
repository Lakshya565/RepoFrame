import { SiteHeader } from "@/components/site-header";
import { BrandMarqueeRails } from "@/components/brand-marquee";
import { RepoUrlForm } from "@/components/repo-url-form";
import { LandingRecentProjects } from "@/components/landing-recent-projects";
import { Reveal, GrowLine } from "@/components/motion/reveal";
import { KineticLetters } from "@/components/kinetic-letters";
import { GlowText } from "@/components/glow-text";
import { MagicCard } from "@/components/ui/magic-card";

// Treatment for the repo-URL MagicCard: a green cursor-following border beam
// (from → to) plus the soft inner spotlight that tracks the cursor on hover. The
// spotlight uses the theme-aware `--glow` token (faint near-black in light mode,
// white in dark) so it reads as a gentle highlight in both themes rather than a
// disruptive color wash. Kept as named constants for easy retuning.
const URL_CARD_BEAM_FROM = "#157f4c";
const URL_CARD_BEAM_TO = "#45c07d";
const URL_CARD_SPOTLIGHT = "var(--glow)";
const URL_CARD_SPOTLIGHT_OPACITY = 0.1;

// Flow connectors drawn between the centered "How it works" step numbers.
// COLOR is a Tailwind background utility; THICKNESS_PX is the line weight (px),
// applied as height (desktop, horizontal) or width (mobile, vertical).
const STEP_CONNECTOR_COLOR = "bg-brand/40";
const STEP_CONNECTOR_THICKNESS_PX = 2;

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

      {/* Ambient AI/language logo rails drifting up the left edge and down the
          right edge, behind the content (z-0) on wide screens only. */}
      <BrandMarqueeRails />

      <div className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-5 py-16 sm:px-8 sm:py-24">
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

          {/* The repo-URL form and the "How it works" guide share ONE MagicCard,
              so the cursor-following green border beam + spotlight wrap them as a
              single surface — no inner border or gap separating the two. */}
          <Reveal delay={1.1} y={20} className="w-full pt-2">
            <MagicCard
              className="rounded-xl"
              gradientFrom={URL_CARD_BEAM_FROM}
              gradientTo={URL_CARD_BEAM_TO}
              gradientColor={URL_CARD_SPOTLIGHT}
              gradientOpacity={URL_CARD_SPOTLIGHT_OPACITY}
            >
              <div className="p-6 sm:p-8">
                <RepoUrlForm />

                <div className="mt-10">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    <GlowText text="How it works" />
                  </h2>
                  <ol className="mt-6 grid gap-8 sm:grid-cols-3">
                    {STEPS.map((step, index) => {
                      const isLast = index === STEPS.length - 1;
                      return (
                        <li
                          key={step.title}
                          className="relative flex flex-col items-center text-center"
                        >
                          {/* Flow connectors between consecutive centered numbers:
                              a horizontal line bridging the column gap on desktop
                              (behind the opaque number badges), and a short
                              vertical line bridging the stack gap on mobile. */}
                          {!isLast ? (
                            <>
                              <span
                                aria-hidden
                                className={`absolute top-3.5 left-1/2 hidden w-[calc(100%+2rem)] -translate-y-1/2 sm:block ${STEP_CONNECTOR_COLOR}`}
                                style={{ height: STEP_CONNECTOR_THICKNESS_PX }}
                              />
                              <span
                                aria-hidden
                                className={`absolute -bottom-8 left-1/2 h-8 -translate-x-1/2 sm:hidden ${STEP_CONNECTOR_COLOR}`}
                                style={{ width: STEP_CONNECTOR_THICKNESS_PX }}
                              />
                            </>
                          ) : null}
                          <Reveal inView delay={index * 0.08} className="w-full">
                            {/* Opaque background so the desktop connector passes
                                behind, not through, the number. The card surface is
                                also bg-background, so this stays seamless. */}
                            <span className="relative z-10 inline-flex size-7 items-center justify-center rounded-md border bg-background font-mono text-sm text-muted-foreground">
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
                      );
                    })}
                  </ol>
                </div>
              </div>
            </MagicCard>
          </Reveal>

          {/* Signed-in shortcut: jump straight back into a saved analysis instead
              of analyzing a throwaway repo to reach History. Renders nothing when
              signed out / no saved work, so the signed-out landing is unchanged. */}
          <LandingRecentProjects />
        </section>
      </div>
    </main>
  );
}
