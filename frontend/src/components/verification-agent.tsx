"use client";

import { useReducedMotion } from "motion/react";
import { Check, Loader2, ShieldCheck } from "lucide-react";

import {
  type ClaimVerification,
  type VerifyStage,
} from "@/lib/repo-api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClaimVerificationPanel } from "@/components/claim-verification-panel";
import { cn } from "@/lib/utils";

// The agent's stages in display order, each tied to a real backend progress event
// (see VerifyStage in repo-api / claim_verifier). The checklist is driven by the
// stage the backend is ACTUALLY on — completed stages get a check, the current one
// spins, later ones wait — so it tracks genuine work instead of a timer. The
// "checking" stage also shows a live detail line of what the agent is inspecting.
const AGENT_STAGES: readonly { id: VerifyStage; label: string }[] = [
  { id: "gathering_evidence", label: "Reading the repository evidence" },
  { id: "analyzing", label: "Pulling the claims out of your writeup" },
  { id: "checking", label: "Checking each claim against the evidence" },
  { id: "compiling", label: "Compiling the verification report" },
];

type VerificationAgentProps = {
  // null until a verification has been run; an empty array means "ran, no claims".
  verifications: ClaimVerification[] | null;
  // True while the verification call is in flight.
  running: boolean;
  // The real stage the agent is on (from the stream), or null before the first
  // event lands. Drives which checklist item is active.
  stage: VerifyStage | null;
  // The live detail for the current stage (e.g. the term being searched), or null.
  detail: string | null;
  // True when there is at least one generated output to check.
  hasOutputs: boolean;
  // True while any generation (not just verification) is in flight — the run
  // button stays disabled so calls cannot stack up.
  busy: boolean;
  onRun: () => void;
};

// The verification step, presented as a first-class agentic workflow rather than a
// quiet button. A branded panel explains what the agent does, a single prominent
// action runs it over everything generated, and a live checklist — driven by real
// streamed progress — shows the agent working while the call is in flight. The
// per-claim findings render below in the existing ClaimVerificationPanel. Opt-in:
// nothing runs (and no tokens are spent) until the user presses the button.
export function VerificationAgent({
  verifications,
  running,
  stage,
  detail,
  hasOutputs,
  busy,
  onRun,
}: VerificationAgentProps) {
  const reduce = useReducedMotion();
  const hasRun = verifications !== null;
  const canRun = hasOutputs && !busy;

  return (
    <div className="space-y-4">
      <Card beam className="border-brand/30 bg-brand/[0.04] p-6">
        <div className="flex items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand [&_svg]:size-5">
            <ShieldCheck aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">Verification agent</h3>
              <Badge variant="outline" className="border-brand/40 text-brand">
                Agentic workflow
              </Badge>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              An agent re-reads your repository and checks every claim in the
              generated writeup against the real evidence — flagging anything
              unsupported and suggesting fixes. This is what keeps RepoFrame
              grounded instead of guessing.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="brand" disabled={!canRun} onClick={onRun}>
            {running ? (
              <>
                <Loader2 className="animate-spin" />
                Agent running…
              </>
            ) : hasRun ? (
              "Re-run verification"
            ) : (
              "Run verification agent"
            )}
          </Button>
          <p className="text-sm text-muted-foreground">
            {hasOutputs
              ? "Runs only when you ask — no tokens are spent until you start it."
              : "Generate at least one output first."}
          </p>
        </div>

        {running ? (
          <AgentSteps reduced={!!reduce} stage={stage} detail={detail} />
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
  detail: string | null;
};

// The live "agent working" checklist, driven entirely by the real stage prop (no
// timer, no internal state — so no setState-in-effect). Stages before the active
// one show a check, the active one spins, later ones wait. The active stage's live
// detail (e.g. the term being searched) shows as a sub-line. Under reduced motion
// it collapses to a single static line naming the current stage.
function AgentSteps({ reduced, stage, detail }: AgentStepsProps) {
  // Before the first event lands, treat the run as sitting on the first stage.
  const activeIndex = stage
    ? AGENT_STAGES.findIndex((item) => item.id === stage)
    : 0;
  const safeIndex = activeIndex === -1 ? 0 : activeIndex;

  if (reduced) {
    const active = AGENT_STAGES[safeIndex];
    return (
      <p className="mt-5 flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-brand" />
        {active.label}
        {detail ? <span className="text-muted-foreground/80">— {detail}</span> : null}
      </p>
    );
  }

  return (
    <ul className="mt-5 space-y-2.5 border-t pt-4">
      {AGENT_STAGES.map((item, index) => {
        const done = index < safeIndex;
        const active = index === safeIndex;
        return (
          <li
            className={cn(
              "text-sm transition-colors",
              active || done ? "text-foreground" : "text-muted-foreground",
            )}
            key={item.id}
          >
            <span className="flex items-center gap-2.5">
              {done ? (
                <Check className="size-4 shrink-0 text-brand" />
              ) : active ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-brand" />
              ) : (
                <span
                  aria-hidden
                  className="size-4 shrink-0 rounded-full border border-muted-foreground/40"
                />
              )}
              {item.label}
            </span>
            {/* Live detail of the agent's current action, shown only on the active
                stage (mainly the per-tool-call "checking" lines). */}
            {active && detail ? (
              <span className="mt-1 block truncate pl-[26px] text-xs text-muted-foreground">
                {detail}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
