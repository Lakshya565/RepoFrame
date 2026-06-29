# Plan: Generate page revamp (RepoFrame, Phase 14)

## Goal

Re-skin the Generate page (`/generate`, `components/project-writeup-section.tsx`)
into a **guided three-step flow** with **stacked, always-visible result cards**,
matching the finished Analysis page's section/card visual language. This is a
**presentation refactor only** — every generation handler and the shared
`GenerationProvider` state stay exactly as they are, so OpenAI calls, profile
caching, and token metering are untouched.

## Standing constraints

- Static checks only: `npx tsc --noEmit` and `npx eslint .` (from `frontend`,
  `Set-Location -LiteralPath 'C:\Users\itsla\RepoFrame\frontend'` first). No
  `next dev` / `next build` — the user previews the frontend.
- No OpenAI / token-spending operations without asking.
- Any value the user might tune lives in an exported/named constant.
- Comments mandatory and kept current. Reduced-motion respected where motion is added.
- Nothing committed unless explicitly asked.

---

## Target shape

A stepper header (`1 Context · 2 Generate · 3 Refine`) over a vertical stack of
section cards, matching the Analysis page rhythm (`space-y-6`, `<h2>` + `Card`,
detail in popovers, hairline separators).

### Step gating
- **Step 1 (Context)** — always open.
- **Step 2 (Generate)** — reachable once context is saved **or** explicitly skipped
  (context is optional, so empty context still advances).
- **Step 3 (Refine)** — reachable once **≥1 output exists**.
- The indicator lets the user **jump back** to any completed step freely; gating only
  blocks jumping *ahead* past an unfinished step.
- Generating from Step 2 **auto-advances** to Step 3.

### Step contents
- **Step 1 — Context:** reuse `UserContextForm` as-is (the actual questionnaire
  questions are a separate, later refinement). Add a "Continue" affordance to advance.
- **Step 2 — Generate:** the one-shot "Generate everything" trigger + the global
  model-instructions textarea (`INSTRUCTION_MAX_LENGTH`, `allGuidance`) + the error
  alert, extracted into their own section card.
- **Step 3 — Refine:** the new part. Replace the tabbed `generated-outputs-card.tsx`
  with **stacked result cards**, one per output (resume bullets, README intro,
  portfolio blurb, LinkedIn description, interview prep). Each card carries its own
  generate · copy · edit · regenerate controls + per-card instruction box. Below the
  cards: `EvidencePanel` + the opt-in claim-verification controls + `ClaimVerificationPanel`.

### Where generation lives
- **Step 2** = the single "generate everything" kickoff only.
- **Step 3** = per-output generate / regenerate / revise on each card (the
  fine-grained controls).

---

## Build order

1. **Stepper shell** — turn `project-writeup-section.tsx` into the orchestrator:
   add a `currentStep` state + a `GenerateStepper` indicator component, with the
   gating rules above. All existing handlers (`ensureProfile`, `handleGenerateAll`,
   `handleGenerateSection`, `handleReviseSection`, `handleGenerateInterview`,
   `handleVerifyClaims`) stay and are passed down unchanged.
2. **Step 1 (Context)** — wrap the existing `UserContextForm` as the Step 1 panel +
   "Continue".
3. **Step 2 (Generate)** — extract the "Generate everything" + global instructions +
   error block into a Step 2 section card; wire auto-advance to Step 3 on success.
4. **Step 3 (Refine)** — new `OutputResultCard` (with an interview variant) rendered
   once per output in a stack; move `EvidencePanel` + verification controls beneath.
   Delete `generated-outputs-card.tsx` once the stack is wired and verified.

### New components
- `GenerateStepper` — the step indicator (state-driven, click-to-jump-back).
- `OutputResultCard` — a single output's result card (generate/copy/edit/regenerate +
  per-card instructions), with an interview-prep variant.

### Tunable constants (single source of truth)
- The step definitions / labels (`1 Context · 2 Generate · 3 Refine`).
- Reuse existing `OUTPUT_SECTIONS`, `INSTRUCTION_MAX_LENGTH`, and the section
  label/order metadata from the current tabbed card (carried over, not changed).

---

## Pending sub-task (separate, not in this pass)
- Refine the **Context questionnaire questions** (`UserContextForm` /
  `lib/user-context.ts` fields). Flagged by the user, scope not yet specified — handled
  after the structural revamp lands.

---

## Verification
- After each step: `npx tsc --noEmit` and `npx eslint .` clean.
- User previews in the browser. Suggested checks:
  - Stepper: step 2 reachable with empty context; step 3 gated until an output exists;
    jumping back to a completed step works; generating from step 2 advances to step 3.
  - Result cards: each output stacks as its own always-visible card; generate / copy /
    edit / regenerate and per-card instructions all behave as before.
  - Evidence + claim verification still function and read cleanly below the stack.
- No behavior change to generation/backend; nothing committed unless asked.
