"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

// The two steps of the guided generation flow, in order. This is the single
// source of truth for the step ids, labels, and one-line descriptions — both the
// indicator below and the orchestrator (project-writeup-section) import it so the
// numbering can never drift between the header and the panels. Generate and
// Refine are merged into one workspace, so step 2 covers creating and refining.
export type GenerateStepId = 1 | 2;

export type GenerateStep = {
  id: GenerateStepId;
  label: string;
  description: string;
};

export const GENERATE_STEPS: readonly GenerateStep[] = [
  { id: 1, label: "Context", description: "Tell us about the project" },
  { id: 2, label: "Generate", description: "Create and refine your writeup" },
];

type GenerateStepperProps = {
  currentStep: GenerateStepId;
  // Whether a step can be navigated to. Locked steps render disabled so the user
  // cannot jump ahead past an unfinished step (e.g. Refine before anything is
  // generated). Completed steps stay accessible so they can jump back freely.
  isStepAccessible: (id: GenerateStepId) => boolean;
  // Whether a step's work is done (context acknowledged / outputs generated).
  // Drives the check mark on the badge.
  isStepComplete: (id: GenerateStepId) => boolean;
  onStepSelect: (id: GenerateStepId) => void;
};

// The guided-flow header: a clickable `1 Context · 2 Generate · 3 Refine`
// indicator. The current step is filled in brand green, completed steps show a
// check and stay clickable (jump back), and locked steps are muted and disabled
// (no jumping ahead). The hairline connectors echo the Analysis page's quiet,
// border-driven hierarchy.
export function GenerateStepper({
  currentStep,
  isStepAccessible,
  isStepComplete,
  onStepSelect,
}: GenerateStepperProps) {
  return (
    <nav aria-label="Generation steps">
      <ol className="flex items-center">
        {GENERATE_STEPS.map((step, index) => {
          const accessible = isStepAccessible(step.id);
          const complete = isStepComplete(step.id);
          const current = step.id === currentStep;
          const showCheck = complete && !current;

          return (
            <li className="flex flex-1 items-center" key={step.id}>
              <button
                aria-current={current ? "step" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-md p-1 text-left transition-colors",
                  accessible
                    ? "cursor-pointer"
                    : "cursor-not-allowed opacity-60",
                )}
                disabled={!accessible}
                onClick={() => onStepSelect(step.id)}
                type="button"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                    current
                      ? "border-brand bg-brand text-brand-foreground"
                      : showCheck
                        ? "border-brand/60 bg-brand/10 text-foreground"
                        : accessible
                          ? "border-input bg-background text-foreground"
                          : "border-input bg-muted text-muted-foreground",
                  )}
                >
                  {showCheck ? (
                    <Check className="size-4 text-brand" />
                  ) : (
                    step.id
                  )}
                </span>
                <span className="hidden flex-col sm:flex">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      current ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {step.description}
                  </span>
                </span>
              </button>

              {/* Connector to the next step (skipped after the last one). */}
              {index < GENERATE_STEPS.length - 1 ? (
                <span aria-hidden className="mx-2 h-px flex-1 bg-border sm:mx-4" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
