"use client";

import { useReducedMotion } from "motion/react";
import { Check, Loader2, Minus, ShieldCheck } from "lucide-react";

import {
  type ClaimVerification,
  type VerifyInvestigation,
  type VerifyStage,
} from "@/lib/repo-api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClaimVerificationPanel } from "@/components/claim-verification-panel";
import { cn } from "@/lib/utils";

// The agent's stages in display order, each tied to a real backend progress event
// (see VerifyStage in repo-api / claim_verifier). The checklist is driven by the
// stage the backend actually emitted: completed stages get a check, the current
// one spins, and skipped targeted lookup stays visibly skipped.
const AGENT_STAGES: readonly {
  id: VerifyStage;
  label: string;
  skippedLabel?: string;
}[] = [
  { id: "gathering_evidence", label: "Building the evidence workspace" },
  { id: "analyzing", label: "Reviewing claims and identifying gaps" },
  {
    id: "checking",
    label: "Searching and reading targeted evidence",
    skippedLabel: "No additional evidence lookup needed",
  },
  { id: "compiling", label: "Reasoning over the final verdict" },
];

type VerificationAgentProps = {
  // null until a verification has been run; an empty array means "ran, no claims".
  verifications: ClaimVerification[] | null;
  // Audit metadata for the settled run: actual model/tool turns and any files the
  // investigator read beyond the initial deterministic evidence bundle.
  investigation: VerifyInvestigation | null;
  // True while the verification call is in flight.
  running: boolean;
  // The real stage the agent is on (from the stream), or null before the first
  // event lands. Drives which checklist item is active.
  stage: VerifyStage | null;
  // Stages actually emitted during this run. Earlier stages count as complete
  // only when present here; otherwise the backend intentionally skipped them.
  visitedStages: VerifyStage[];
  // The live detail for the current stage (e.g. the term being searched), or null.
  detail: string | null;
  // True when there is at least one generated output to check.
  hasOutputs: boolean;
  // True while any generation (not just verification) is in flight — the run
  // button stays disabled so calls cannot stack up.
  busy: boolean;
  onRun: () => void;
};

// The investigator is a first-class evidence workflow rather than a quiet button.
// Its live checklist is driven by streamed progress, and the settled report renders
// below. It remains opt-in: nothing runs until the user presses the button.
export function VerificationAgent({
  verifications,
  investigation,
  running,
  stage,
  visitedStages,
  detail,
  hasOutputs,
  busy,
  onRun,
}: VerificationAgentProps) {
  const reduce = useReducedMotion();
  const hasRun = verifications !== null;
  const canRun = hasOutputs && !busy;

  return (
    <div className="flex flex-col gap-4">
      <Card beam className="border-brand/30 bg-brand/[0.04] p-6">
        <div className="flex items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand [&_svg]:size-5">
            <ShieldCheck aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">Evidence Investigator</h3>
              <Badge variant="outline" className="border-brand/40 text-brand">
                Agentic Audit
              </Badge>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Starts with RepoFrame&apos;s selected evidence, searches the
              repository only when a claim has a gap, and reads the most relevant
              files before issuing an evidence-backed verdict.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="brand" disabled={!canRun} onClick={onRun}>
            {running ? (
              <>
                <Loader2
                  data-icon="inline-start"
                  className={cn(!reduce && "animate-spin")}
                />
                Investigating evidence…
              </>
            ) : hasRun ? (
              "Re-run investigation"
            ) : (
              "Run Evidence Investigator"
            )}
          </Button>
          <p className="text-sm text-muted-foreground">
            {hasOutputs
              ? "Runs only when you ask. It may inspect up to four additional repository files."
              : "Generate at least one output first."}
          </p>
        </div>

        {running ? (
          <AgentSteps
            reduced={!!reduce}
            stage={stage}
            visitedStages={visitedStages}
            detail={detail}
          />
        ) : null}

        {/* A compact settled-run audit makes the agentic work inspectable without
            turning the card into an operational dashboard. */}
        {!running && hasRun && investigation ? (
          <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-4 text-xs text-muted-foreground">
            <span>
              {investigation.modelCalls} model{" "}
              {investigation.modelCalls === 1 ? "pass" : "passes"}
            </span>
            <span aria-hidden>·</span>
            <span>
              {investigation.toolCalls} evidence{" "}
              {investigation.toolCalls === 1 ? "check" : "checks"}
            </span>
            <span aria-hidden>·</span>
            <span>
              {investigation.additionalFilesInspected.length} additional{" "}
              {investigation.additionalFilesInspected.length === 1
                ? "file"
                : "files"}{" "}
              read
            </span>
            {investigation.additionalFilesInspected.length > 0 ? (
              <div className="flex w-full flex-wrap items-center gap-1.5 pt-1">
                <span className="font-medium text-foreground">
                  Additional files read
                </span>
                {investigation.additionalFilesInspected.map((path) => (
                  <code
                    className="max-w-full break-all rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                    key={path}
                  >
                    {path}
                  </code>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {/* The findings. Loading is owned by the agent card's checklist above, so
          this panel only ever renders settled results (or nothing yet). */}
      <ClaimVerificationPanel loading={false} verifications={verifications} />
    </div>
  );
}

type AgentStepsProps = {
  reduced: boolean;
  // The agent's current real stage, or null before the first event arrives (which
  // we treat as the first stage just starting).
  stage: VerifyStage | null;
  visitedStages: VerifyStage[];
  detail: string | null;
};

// The live checklist is driven by real streamed progress, with no timer or
// internal effects. Only emitted stages complete; skipped lookup stays explicit.
function AgentSteps({
  reduced,
  stage,
  visitedStages,
  detail,
}: AgentStepsProps) {
  // Before the first event lands, treat the run as sitting on the first stage.
  const activeIndex = stage
    ? AGENT_STAGES.findIndex((item) => item.id === stage)
    : 0;
  const safeIndex = activeIndex === -1 ? 0 : activeIndex;

  if (reduced) {
    const active = AGENT_STAGES[safeIndex];
    return (
      <p
        aria-live="polite"
        className="mt-5 flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground"
      >
        <Loader2 className="size-4 text-brand" />
        {active.label}
        {detail ? <span className="text-muted-foreground/80">— {detail}</span> : null}
      </p>
    );
  }

  return (
    <ul
      aria-label="Investigation progress"
      className="mt-5 flex flex-col gap-2.5 border-t pt-4"
    >
      {AGENT_STAGES.map((item, index) => {
        const active = index === safeIndex;
        const visited = visitedStages.includes(item.id);
        const done = visited && !active;
        const skipped = index < safeIndex && !visited;
        const label = skipped ? (item.skippedLabel ?? item.label) : item.label;
        return (
          <li
            className={cn(
              "text-sm transition-colors",
              active || done ? "text-foreground" : "text-muted-foreground",
            )}
            key={item.id}
          >
            <span
              aria-current={active ? "step" : undefined}
              aria-live={active ? "polite" : undefined}
              className="flex items-center gap-2.5"
            >
              {done ? (
                <Check className="size-4 shrink-0 text-brand" />
              ) : active ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-brand" />
              ) : skipped ? (
                <Minus className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <span
                  aria-hidden
                  className="size-4 shrink-0 rounded-full border border-muted-foreground/40"
                />
              )}
              {label}
            </span>
            {/* Live detail of the agent's current action, shown only on the active
                stage (mainly the per-tool-call "checking" lines). */}
            {active && detail ? (
              <span
                aria-live="polite"
                className="mt-1 block truncate pl-[26px] text-xs text-muted-foreground"
                title={detail}
              >
                {detail}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
