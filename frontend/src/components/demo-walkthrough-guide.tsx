"use client";

import { RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GithubMark } from "@/components/github-mark";
import { useAuth } from "@/lib/auth-context";
import {
  currentDemoWalkthroughTarget,
  useDemoWalkthrough,
} from "@/lib/demo-walkthrough";

const STEP_COPY = {
  1: {
    title: "Explore the analysis",
    body: "Start with the repository overview and detected stack, then scroll through commit activity, important files, and the project tree. When you’re satisfied, return to the tabs and open Generate.",
  },
  2: {
    title: "Review project context",
    body: "RepoFrame fills in what it can infer from the repository. Personal details like your role, ownership, and impact require login, but you can continue exploring this demo without an account.",
  },
  3: {
    title: "Generate a writeup",
    body: "Choose Generate everything, or generate a Resume, README, Portfolio, or LinkedIn output on its own. Interview prep is available too, but it is not included in the evidence audit by itself.",
  },
  4: {
    title: "Audit the claims",
    body: "Run the Evidence Investigator to check the claims in what you generated. This step advances after the investigation finishes and its evidence-backed verdicts are ready.",
  },
  5: {
    title: "Open History",
    body: "Open the History tab to see where RepoFrame keeps analyzed repositories and generated work for signed-in users.",
  },
} as const;

const TARGET_LABELS = {
  "generate-tab": "Back to tabs",
  "context-actions": "Show continue buttons",
  "generation-actions": "Show generation options",
  "audit-run": "Show the audit",
  "history-tab": "Show History tab",
  "history-content": "Show saved analyses",
} as const;

export function DemoWalkthroughGuide() {
  const { state, dispatch, showTarget, restart } = useDemoWalkthrough();
  const { signInWithGitHub } = useAuth();

  if (state.display !== "open") {
    const finished = state.display === "finished";
    return (
      <div className="fixed bottom-3 right-3 z-[45] sm:bottom-6 sm:right-6">
        <Button
          className="shadow-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
          onClick={finished ? restart : () => dispatch({ type: "resume" })}
          size="sm"
          variant="outline"
        >
          {finished ? <RotateCcw aria-hidden /> : null}
          {finished ? "Restart walkthrough" : "Resume walkthrough"}
        </Button>
      </div>
    );
  }

  const target = currentDemoWalkthroughTarget(state);
  const copy = STEP_COPY[state.step];
  const historyComplete = state.step === 5 && state.historyOpened;

  function handleShowTarget() {
    if (!target) return;
    showTarget(target);
  }

  return (
    <Card
      aria-label={`Demo walkthrough, step ${state.step} of 5`}
      className="demo-walkthrough-panel fixed inset-x-3 bottom-3 z-[45] max-h-[calc(100dvh-1.5rem)] overflow-y-auto border-brand/40 bg-card/95 p-4 shadow-xl backdrop-blur-sm sm:inset-x-auto sm:bottom-6 sm:right-6 sm:max-h-[calc(100dvh-3rem)] sm:w-[23rem] sm:p-5"
      role="region"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="font-mono text-xs font-medium uppercase tracking-wide text-brand">
          Step {state.step} of 5
        </span>
        <Button
          aria-label="Dismiss demo walkthrough"
          className="-mr-2 -mt-2 transition-transform duration-150 active:scale-[0.97]"
          onClick={() => dispatch({ type: "dismiss" })}
          size="icon"
          variant="ghost"
        >
          <X aria-hidden />
        </Button>
      </div>

      <div aria-live="polite" className="mt-1">
        <h2 className="text-base font-semibold">
          {historyComplete ? "Your analyses live here" : copy.title}
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          {historyComplete
            ? "Signed-in users can reopen analyzed repositories and continue from their saved outputs. Log in to build your own History."
            : copy.body}
        </p>
      </div>

      {historyComplete ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            className="transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
            onClick={() => void signInWithGitHub()}
            size="sm"
            variant="brand"
          >
            <GithubMark />
            Continue with GitHub
          </Button>
          <Button
            className="transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
            onClick={() => dispatch({ type: "finish" })}
            size="sm"
            variant="ghost"
          >
            Finish walkthrough
          </Button>
        </div>
      ) : target ? (
        <Button
          className="mt-4 transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
          onClick={handleShowTarget}
          size="sm"
          variant="outline"
        >
          {TARGET_LABELS[target]}
        </Button>
      ) : null}
    </Card>
  );
}
