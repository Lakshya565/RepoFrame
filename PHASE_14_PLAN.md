# Phase 14 Plan: Polish the MVP (UI)

> **Status: DRAFT / living document.** This is a working plan we fill in together
> before any code is written. Sections marked **[TBD — user input]** are waiting on
> you to add your specific UI ideas, the libraries you want me to use/consult, and
> the UI skill you want installed. Nothing here is final until we agree on it.

---

## 1. Goal

Make RepoFrame demoable: turn the functional-but-plain MVP into something that
*looks* like a polished, modern developer tool. The pipeline, generation, claim
verification, and metrics all work — Phase 14 is about presentation, flow, and
feel, **not** new backend capability.

Guiding line from `AGENTS.md`: *"Make the UI feel like a clean developer tool, not
a generic AI app."* No "AI magic"/"dream job" language. Product vocabulary stays:
Analyze repo, Project profile, Evidence, Technical highlights, Generated outputs,
Interview prep.

Demo target (from PHASES.md): a stranger can run a repo through the full flow and
understand the result in **under 60 seconds**.

---

## 2. Current state (what we're polishing, not rebuilding)

### Frontend stack (verified from `frontend/package.json`)
- **Next.js 16.2.7** — note: this is a newer Next than my training data. Per
  `frontend/AGENTS.md` I must read the relevant guide in
  `node_modules/next/dist/docs/` before writing component/routing code, and heed
  deprecation notices. APIs may differ from what I "remember."
- **React 19.2.4**
- **TypeScript 5**, **Tailwind CSS v4** (via `@tailwindcss/postcss`)
- ESLint 9 + `eslint-config-next`
- **No animation library, no component library, no icon library installed yet.**
  (Relevant to the "libraries" section below — this is a clean slate.)

### Existing frontend surfaces (in `frontend/src/`)
| Area | Files |
|---|---|
| Pages | `app/page.tsx` (landing), `app/analysis/page.tsx`, `app/layout.tsx` |
| Repo intake | `components/repo-url-form.tsx`, `components/repo-summary-card.tsx`, `components/github-rate-limit-card.tsx` |
| Repo structure | `components/repo-tree-view.tsx`, `components/important-files-card.tsx`, `lib/repo-tree.ts` |
| Tech stack | `components/tech-stack-card.tsx` |
| User context | `components/user-context-form.tsx`, `lib/user-context.ts` |
| Generation | `components/generated-outputs-card.tsx`, `components/project-writeup-section.tsx`, `lib/outputs.ts` |
| Evidence | `components/evidence-panel.tsx` |
| Claims | `components/claim-verification-panel.tsx` |
| Tokens | `components/token-usage-panel.tsx` |
| API client | `lib/repo-api.ts` |

### Backend endpoints the UI can already read (zero-cost, no tokens)
- `GET /api/usage/total` → lifetime token ledger
- `GET /api/metrics` → counters + latency snapshot (in-memory, resets on restart)
- All `POST /api/generate/*` + `/verify` already return per-analysis `usage`.

**Implication:** the developer metrics panel (below) is pure read-only frontend —
the backend source of truth already exists. No backend work needed for it.

---

## 3. Scope carried forward from PHASES.md

These are already committed for Phase 14 (don't re-decide, just refine):

```text
Better loading states
Better error states
Empty states
Mobile layout (fully responsive / dynamically resizable)
Consistent styling
Clean landing page
Demo repo examples (example repo cards on landing)
Subtle animations (clarity only — loading, tab transitions, collapsible cards, progress steps)
Better evidence display
Better claim verification display
README screenshots
Developer metrics panel (floating button → metrics drawer)
```

### 3a. Developer metrics panel (already spec'd, moved from Phase 13)
Self-contained, read-only UI for metrics the backend already records:
- Fixed bottom-right button → slide-in drawer.
- Fetches `GET /api/usage/total` + `GET /api/metrics` only. Spends no tokens;
  backend stays the single source of truth (panel only displays).
- Grouped: **Tokens** (lifetime prompt/completion/reasoning/total + runs),
  **Activity** (repos analyzed, files scanned/selected, outputs generated),
  **Claim quality** (verified + supported/partial/needs-confirmation/unsupported),
  **Reliability** (requests, errors → error rate, LLM + backend latency avg/max).
- Label scope honestly: tokens = lifetime/persistent; system metrics = "since
  restart" (in-memory).
- Gate behind `NEXT_PUBLIC_SHOW_METRICS` env flag (metrics are backend-global, not
  per-user — hide in public builds until per-user + auth exist in Phase 15+).
- ~2 components (floating button + drawer) + one `fetchMetrics` helper
  (`fetchLifetimeUsage` already exists in `lib/repo-api.ts`).

---

## 4. [TBD — user input] Your UI vision

> You said PHASES.md "barely covers" what you're thinking. Add it here. Prompts to
> help, but write whatever you want:
>
> - Overall look/feel & references — any sites/tools whose aesthetic you want?
> - Color palette / light vs dark / theme toggle?
> - Landing page: hero, structure, what the example repo cards should be.
> - The analysis page flow — current cards are stacked; do you want a different
>   layout (steps, columns, progressive reveal)?
> - Any specific components you want redesigned first / that bug you most.
> - Anything explicitly out of scope for Phase 14.

I want a minimal looking design, but the most important thing to me is that it looks clean yet not AI-generated. 
7 Tells that a UI is AI-Generated
by Jeff Humble

Dear Reader,

You can see a vibe-coded app from a mile away, if you know what to look for.

Here are seven design patterns that scream amateur vibe coder.

Learn them, avoid them, and stay above the rising tide of slop, my friends.

1. Neon color palette

from IceWhistle
If it's vibe-coded, it's gotta be neon. To slop this one up to the max, use 5+ neon colors and never pick a single one to focus.

Why AI loves it: Neon-on-dark is overrepresented in "modern UI" training data because it photographs well and gets upvoted on Dribbble. Dark background plus high-chroma accent gets learned as the default for contemporary SaaS.

2. Dark mode glow-up

from OpenClaw
Every vibe-coded website has that aurora borealis glow thing going on in the background. My eyes appreciate the dark mode, but I can never tell if my screen is broken, dirty, or it's just another AI-generated website.

Why AI loves it: Radial gradients behind hero content appear constantly in gaming, crypto, and AI product sites. The model absorbs "glow equals premium dark mode" without any ability to judge whether it's serving a purpose.

3. Emojis everywhere

from AI Sentia
If you thought that emojis were just for chatting, you haven't worked with AI as a UI designer. To slop this one up, make emojis the go-to icon, background element, and navigation item.

Why AI loves it: Marketing copy and onboarding flows in the training data use emojis as visual punctuation constantly. They become a learned shorthand for adding hierarchy without needing actual icon assets or design decisions.

4. Purple gradients

from Chad Challenge
I'm sorry if you like purple or Prince because AI has ruined that now. To make it really slop, use purple gradients for your H1s, your buttons, and your backgrounds.

Why AI loves it: Purple-to-blue is statistically the most common gradient in tech product marketing. Thousands of examples from Notion, Linear, Vercel, and their imitators make it the default output for any "innovative software" hero section.

5. Cards, on cards, on cards...

from Lifechecker.app
In AI-generated interface land, everything goes in a card. Even cards themselves sometimes go in cards. That way, things can feel organized even as the UI overall becomes more chaotic.

Why AI loves it: The model knows content needs containers but applies that rule recursively, with no cost function for visual weight. Every group becomes a card, and since that card lives somewhere, it gets wrapped in another one.

6. Multicolored side tabs

from jobsdata.ai
These are quickly becoming the em-dash of AI-generated UI. To be a proper slopper, every card and block of text gets a little rainbow side tab. And just like a sprinkle on ice cream, it adds color but does nothing for the taste.

Why AI loves it: Tabs have active states, and active states mean color. With no concept of a system-wide color budget, each tab gets its own accent. The model can't reason that four competing colors cancel each other out.

7. Status dots

from Askew AI
There was a time once when dots meant something like, "live" or "connected." To become a top sloppper, add them to every UI element in any color you like.

Why AI loves it: Colored indicator dots are everywhere in developer tools and admin UIs in the training data. "Status information" gets pattern-matched to "colored dot," regardless of whether a label would communicate more.


Just avoid these all, and we're good. 
---

## 5. [TBD — user input] Libraries to use / consult

> A clean slate today (only Next + React + Tailwind). List anything you want me to
> use, and I'll consult their current docs before coding. Candidate categories so
> we're deciding deliberately, not by default:
>
> - **Animation:** (e.g. Framer Motion / Motion) — or stick to CSS/Tailwind transitions?
> - **Icons:** (e.g. lucide-react) — needed for the metrics drawer, tabs, states.
> - **Component primitives:** (e.g. Radix / shadcn) — or hand-rolled to stay light?
> - **Anything else** you already have in mind.
>
> Constraint to respect: each dependency is weight + a thing to maintain. Default
> bias is minimal, but your call drives this.

Motion is good for animation, as long as it doesn't significantly increase latency and overhead. lucide-react is good for icons, yes. Shadcn is good for component primitives.

---

## 6. [TBD — user input] UI skill to install

> You mentioned a UI skill you want installed on me before we start. Drop the
> name/details here. Once installed I'll invoke it as part of this work where it
> applies. Until it's installed and listed as available, I won't assume it exists.

Added the UI UX pro max skill for you to use.

---

## 7. Proposed task breakdown (draft — reorder once 4–6 are filled)

Rough sequencing, smallest-risk-first, so each step is independently verifiable:

1. **Foundation:** design tokens (colors, spacing, typography) + shared primitives
   (button, card, badge) so the rest is consistent. Decide light/dark here.
2. **State coverage:** unify loading / error / empty / disabled states across
   existing flows (intake → analysis → generation → verify).
3. **Landing page:** hero, "how it works," example repo cards, product framing.
4. **Analysis flow layout:** restructure the stacked cards into the agreed layout;
   add progress/step affordances.
5. **Evidence + claim verification redesign:** the two highest-value display
   surfaces; collapsibles, badges, readability.
6. **Developer metrics panel** (section 3a) — isolated, read-only, env-gated.
7. **Responsive/mobile pass:** every surface dynamically resizable.
8. **Subtle animation pass:** clarity-only transitions, last so motion sits on a
   stable layout.
9. **README screenshots + docs:** update once the UI is settled.

---

## 8. Constraints & working rules (standing — apply throughout)

- **Do not start the frontend dev server, browser smoke tests, or UI preview
  sessions.** You run and visually verify; I validate with static checks
  (`npx tsc --noEmit`, `npm.cmd run lint`) and focused logic tests.
- **No token-spending / OpenAI-touching actions without asking first** — Phase 14
  is frontend polish, so this should rarely come up, but the metrics panel and any
  generation-adjacent change must not trigger real API calls.
- **No commits unless explicitly asked.**
- **Keep logic out of components** — non-trivial data shaping/validation/API calls
  go in `lib/` (per `AGENTS.md`). Routes/components stay thin.
- **Read `node_modules/next/dist/docs/`** for the relevant Next.js 16 API before
  writing routing/component code; heed deprecation notices.
- **Comments stay current** — overview-style comments on components/utilities,
  updated with every change.
- **No secrets in frontend.** `NEXT_PUBLIC_*` flags only for non-secret toggles
  (e.g. `NEXT_PUBLIC_SHOW_METRICS`).
- Update README/structure docs when behavior or layout changes.

---

## 9. Open questions for you

1. Light, dark, or both (with a toggle)?
2. Is the analysis page staying single-page stacked, or moving to a stepped /
   multi-section layout?
3. Which example repos do you want featured on the landing page?
4. Should the metrics panel ship in this phase, or be the very last thing (it's
   isolated either way)?
5. Any hard "don't touch" components that are already how you want them?

---

*When sections 4–6 are filled and the open questions answered, I'll fold the
specifics into the task breakdown, confirm with you, and only then start building
one verifiable step at a time. This file gets deleted at the end of Phase 14 (like
the Phase 12 plan), with PHASES.md updated to mark Phase 14 done.*
