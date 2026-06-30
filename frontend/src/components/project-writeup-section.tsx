"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GeneratedOutputCards } from "@/components/generated-output-cards";
import { VerificationAgent } from "@/components/verification-agent";
import {
  GenerateStepper,
  type GenerateStepId,
} from "@/components/generate-stepper";
import { UserContextForm } from "@/components/user-context-form";
import {
  INSTRUCTION_MAX_LENGTH,
  mergeSection,
  sectionHasContent,
  sectionToText,
} from "@/lib/outputs";
import {
  generateInterviewPrep,
  generateOutputs,
  generateProfile,
  reviseOutput,
  verifyClaimsStream,
  type GeneratedOutputs,
  type OutputSection,
  type ProjectProfileData,
  type VerifyStage,
} from "@/lib/repo-api";
import { hasAnyUserContext, userContextEquals } from "@/lib/user-context";
import { useGeneration } from "@/lib/generation-context";

type ProjectWriteupSectionProps = {
  repoUrl: string;
};

// The four core output sections, used to tell whether anything has been generated
// yet (which gates the verification agent and seeds the landing step).
const OUTPUT_SECTIONS: OutputSection[] = [
  "resumeBullets",
  "readmeIntro",
  "portfolioBlurb",
  "linkedinDescription",
];

// Reads an Error message with a fallback.
function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

// Orchestrates every OpenAI call for the generation workspace, presented as a
// guided two-step flow (1 Context · 2 Generate). The state it works over
// (questionnaire answers, generated profile, per-section outputs, interview
// topics, claim verifications) is held in the shared GenerationProvider so it
// survives tab navigation; this component reads/writes it via useGeneration. The
// step is local UI state — the stepper only re-skins the same handlers.
// Properties that matter here:
//   1. The profile is the distilled repo context. It is generated once and
//      reused for every later call as long as the questionnaire is unchanged, so
//      the raw repo evidence is never re-sent and OpenAI prompt-caches the
//      profile prefix. Editing the questionnaire forces a refresh on the next
//      call so grounding stays current.
//   2. Only one generation runs at a time (busyTask); every trigger is disabled
//      while a call is in flight, so rapid clicks cannot stack up calls.
//   3. An optional instruction is folded into the prompt up front (per-card and a
//      shared one for "Generate everything"), so the user can one-shot a result
//      to spec instead of generating then regenerating.
//   4. Every call's real token usage is accumulated into a per-session meter, and
//      the persistent lifetime total is refreshed after each call (Phase 12).
// Nothing generates on load — every call is an explicit button press.
export function ProjectWriteupSection({
  repoUrl,
}: ProjectWriteupSectionProps) {
  // All generation state lives in the shared GenerationProvider (in the analysis
  // layout) so it survives tab navigation — see generation-context.tsx. This
  // component owns the orchestration logic below but reads/writes that shared
  // state. addUsage/refreshLifetime feed the developer panel's token meter.
  const {
    context,
    setContext,
    profile,
    setProfile,
    profileContext,
    setProfileContext,
    outputs,
    setOutputs,
    interviewTopics,
    setInterviewTopics,
    verifications,
    setVerifications,
    baselines,
    setBaselines,
    allGuidance,
    setAllGuidance,
    busyTask,
    setBusyTask,
    error,
    setError,
    addUsage,
    refreshLifetime,
  } = useGeneration();

  // Whether anything has been generated yet. Gates the verification agent (there
  // must be a draft to check) and seeds a sensible landing step for returning
  // users whose outputs survived tab navigation.
  const hasAnyOutput = OUTPUT_SECTIONS.some((section) =>
    sectionHasContent(outputs, section),
  );

  // Guided-flow step. Local UI state (the generated content itself persists in
  // the provider). Returning users — whose outputs/context survived tab
  // navigation — land on the Generate step their progress already unlocked.
  const [currentStep, setCurrentStep] = useState<GenerateStepId>(() =>
    hasAnyOutput || hasAnyUserContext(context) ? 2 : 1,
  );
  // The Generate step unlocks once the user leaves Context (explicitly, via
  // Continue) or already has content from a previous visit. Context stays
  // optional — Continue works with an empty questionnaire.
  const [contextAcknowledged, setContextAcknowledged] = useState(
    () => hasAnyUserContext(context) || hasAnyOutput,
  );

  // Live verification-agent progress from the streaming verify endpoint. Transient
  // local UI state (the settled verifications themselves live in the provider);
  // both reset when a run starts and again when it ends.
  const [verifyStage, setVerifyStage] = useState<VerifyStage | null>(null);
  const [verifyDetail, setVerifyDetail] = useState<string | null>(null);

  // Step access rules: Context is always open; Generate unlocks once Context is
  // acknowledged. Completed steps stay accessible (jump back); a locked step
  // blocks jumping ahead.
  function isStepAccessible(id: GenerateStepId): boolean {
    if (id === 1) {
      return true;
    }
    return contextAcknowledged;
  }

  // A step is "complete" once its work is done — drives the stepper check marks.
  function isStepComplete(id: GenerateStepId): boolean {
    if (id === 1) {
      return contextAcknowledged;
    }
    return hasAnyOutput;
  }

  // Navigates to a step only when it is unlocked (the stepper already disables
  // locked steps, but guard here too so it is the single gate).
  function goToStep(id: GenerateStepId) {
    if (isStepAccessible(id)) {
      setCurrentStep(id);
    }
  }

  // Leaves the Context step for Generate. Context is optional, so this advances
  // regardless of how much was filled in.
  function handleContinueFromContext() {
    setContextAcknowledged(true);
    setCurrentStep(2);
  }

  // Returns the profile, regenerating it when the questionnaire changed since it
  // was built (so grounding stays current) and reusing it otherwise. A fresh
  // generation's usage is added to the session meter.
  async function ensureProfile(): Promise<ProjectProfileData> {
    if (profile && profileContext && userContextEquals(profileContext, context)) {
      return profile;
    }
    const response = await generateProfile(repoUrl, context);
    setProfile(response.profile);
    setProfileContext(context);
    addUsage(response.usage);
    return response.profile;
  }

  // Records the just-generated text of a section as its edit baseline.
  function setBaseline(next: GeneratedOutputs, section: OutputSection) {
    setBaselines((current) => ({
      ...current,
      [section]: sectionToText(next, section),
    }));
  }

  // Generates everything: a fresh profile (so questionnaire edits are picked up),
  // all core outputs, then interview prep — sequentially, with the shared
  // guidance applied throughout. Each card auto-expands as its content lands.
  async function handleGenerateAll() {
    if (busyTask) {
      return;
    }
    setBusyTask({ kind: "all" });
    setError(null);

    try {
      const profileResponse = await generateProfile(repoUrl, context);
      setProfile(profileResponse.profile);
      setProfileContext(context);
      addUsage(profileResponse.usage);

      const outputsResponse = await generateOutputs(
        profileResponse.profile,
        undefined,
        allGuidance,
      );
      setOutputs(outputsResponse.outputs);
      addUsage(outputsResponse.usage);
      setBaselines({
        resumeBullets: sectionToText(outputsResponse.outputs, "resumeBullets"),
        readmeIntro: sectionToText(outputsResponse.outputs, "readmeIntro"),
        portfolioBlurb: sectionToText(outputsResponse.outputs, "portfolioBlurb"),
        linkedinDescription: sectionToText(
          outputsResponse.outputs,
          "linkedinDescription",
        ),
      });

      const interviewResponse = await generateInterviewPrep(
        profileResponse.profile,
        allGuidance,
      );
      setInterviewTopics(interviewResponse.topics);
      addUsage(interviewResponse.usage);
    } catch (caught) {
      setError(messageOf(caught, "RepoFrame could not generate the writeup."));
    } finally {
      setBusyTask(null);
      refreshLifetime();
    }
  }

  // Generates a single section on its own, with optional preemptive guidance.
  async function handleGenerateSection(
    section: OutputSection,
    guidance: string,
  ) {
    if (busyTask) {
      return;
    }
    setBusyTask({ kind: "section", section });
    setError(null);

    try {
      const activeProfile = await ensureProfile();
      const response = await generateOutputs(activeProfile, [section], guidance);
      setOutputs((current) => mergeSection(current, section, response.outputs));
      setBaseline(response.outputs, section);
      addUsage(response.usage);
    } catch (caught) {
      setError(messageOf(caught, "RepoFrame could not generate that section."));
    } finally {
      setBusyTask(null);
      refreshLifetime();
    }
  }

  // Revises a single section from the current draft plus an optional instruction.
  // Returns success so the card knows whether the revision applied.
  async function handleReviseSection(
    section: OutputSection,
    instruction: string,
  ): Promise<boolean> {
    if (busyTask) {
      return false;
    }
    setBusyTask({ kind: "revise", section });
    setError(null);

    try {
      const activeProfile = await ensureProfile();
      const currentText = sectionToText(outputs, section);
      const response = await reviseOutput(
        activeProfile,
        section,
        currentText,
        instruction,
      );
      setOutputs((current) => mergeSection(current, section, response.outputs));
      setBaseline(response.outputs, section);
      addUsage(response.usage);
      return true;
    } catch (caught) {
      setError(messageOf(caught, "RepoFrame could not regenerate that section."));
      return false;
    } finally {
      setBusyTask(null);
      refreshLifetime();
    }
  }

  // Generates interview prep on its own, with optional preemptive guidance.
  async function handleGenerateInterview(guidance: string) {
    if (busyTask) {
      return;
    }
    setBusyTask({ kind: "interview" });
    setError(null);

    try {
      const activeProfile = await ensureProfile();
      const response = await generateInterviewPrep(activeProfile, guidance);
      setInterviewTopics(response.topics);
      addUsage(response.usage);
    } catch (caught) {
      setError(messageOf(caught, "RepoFrame could not generate interview prep."));
    } finally {
      setBusyTask(null);
      refreshLifetime();
    }
  }

  // Runs the bounded verification agent over every generated output. Opt-in: it
  // only fires on an explicit press, never as part of the default flow, so it
  // cannot spend tokens without a deliberate click. Uses the STREAMING endpoint so
  // the agent panel's checklist tracks the agent's real progress (rebuild evidence
  // -> extract claims -> check each -> compile) as it happens, then the settled
  // result replaces the panel. The backend rebuilds the repo evidence from the URL.
  async function handleVerifyClaims() {
    if (busyTask) {
      return;
    }
    setBusyTask({ kind: "verify", section: null });
    setError(null);
    // Seed the first stage so the checklist lights up the moment the run starts,
    // before the first server event arrives.
    setVerifyStage("gathering_evidence");
    setVerifyDetail(null);

    try {
      const response = await verifyClaimsStream(repoUrl, context, outputs, {
        onProgress: (event) => {
          setVerifyStage(event.stage);
          setVerifyDetail(event.detail);
        },
      });
      setVerifications(response.verifications);
      addUsage(response.usage);
    } catch (caught) {
      setError(messageOf(caught, "RepoFrame could not verify the claims."));
    } finally {
      setBusyTask(null);
      setVerifyStage(null);
      setVerifyDetail(null);
      refreshLifetime();
    }
  }

  const busy = busyTask !== null;
  const generatingSection =
    busyTask?.kind === "section" ? busyTask.section : null;
  const revisingSection = busyTask?.kind === "revise" ? busyTask.section : null;

  return (
    <div className="space-y-6">
      <GenerateStepper
        currentStep={currentStep}
        isStepAccessible={isStepAccessible}
        isStepComplete={isStepComplete}
        onStepSelect={goToStep}
      />

      {/* Shared across steps: any handler can set it, so it lives once here under
          the stepper instead of inside a single step. */}
      {error ? (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {/* Keyed by step so switching panels re-runs the fade-in (a light
          crossfade; static under reduced motion). */}
      <div
        key={currentStep}
        className="duration-200 animate-in fade-in-0 motion-reduce:animate-none"
      >
        {currentStep === 1 ? (
          <ContextStep
            context={context}
            onContextChange={setContext}
            onContinue={handleContinueFromContext}
          />
        ) : (
          <div className="space-y-6">
            <GenerateEverythingCard
              allGuidance={allGuidance}
              busy={busy}
              generatingAll={busyTask?.kind === "all"}
              onGenerateAll={handleGenerateAll}
              onGuidanceChange={setAllGuidance}
            />

            <GeneratedOutputCards
              baselines={baselines}
              busy={busy}
              generatingInterview={busyTask?.kind === "interview"}
              generatingSection={generatingSection}
              interviewTopics={interviewTopics}
              onGenerateInterview={handleGenerateInterview}
              onGenerateSection={handleGenerateSection}
              onOutputsChange={setOutputs}
              onReviseSection={handleReviseSection}
              outputs={outputs}
              revisingSection={revisingSection}
            />

            <VerificationAgent
              busy={busy}
              detail={verifyDetail}
              hasOutputs={hasAnyOutput}
              onRun={handleVerifyClaims}
              running={busyTask?.kind === "verify"}
              stage={verifyStage}
              verifications={verifications}
            />
          </div>
        )}
      </div>
    </div>
  );
}

type ContextStepProps = {
  context: Parameters<typeof UserContextForm>[0]["context"];
  onContextChange: Parameters<typeof UserContextForm>[0]["onContextChange"];
  onContinue: () => void;
};

// Step 1 — the questionnaire plus a Continue affordance. Context is optional, so
// Continue advances even with nothing filled in; the helper text says so.
function ContextStep({
  context,
  onContextChange,
  onContinue,
}: ContextStepProps) {
  return (
    <div className="space-y-4">
      <UserContextForm context={context} onContextChange={onContextChange} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button variant="brand" onClick={onContinue}>
          Continue to generate
        </Button>
        <p className="text-sm text-muted-foreground">
          Context is optional — you can continue without filling everything in.
        </p>
      </div>
    </div>
  );
}

type GenerateEverythingCardProps = {
  allGuidance: string;
  busy: boolean;
  generatingAll: boolean;
  onGuidanceChange: (value: string) => void;
  onGenerateAll: () => void;
};

// The kickoff card at the top of the Generate step. It produces every output at
// once with the shared guidance applied throughout — a convenience over the
// per-card Generate buttons below, which can each run on their own.
function GenerateEverythingCard({
  allGuidance,
  busy,
  generatingAll,
  onGuidanceChange,
  onGenerateAll,
}: GenerateEverythingCardProps) {
  return (
    <Card beam className="p-6">
      <h3 className="text-lg font-semibold">Turn this repo into a writeup</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Generate everything at once, or generate any single piece on its own from
        its card below. Only one generation runs at a time.
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        The first generation takes a little longer (around 20 seconds) while we
        read and understand your project. After that, it&apos;s faster.
      </p>

      <div className="mt-5">
        <label className="text-sm font-medium" htmlFor="generate-all-guidance">
          Instructions for the model (optional)
        </label>
        <p className="mt-1 text-sm text-muted-foreground">
          Added to the prompt for everything produced by Generate everything.
        </p>
        <Textarea
          className="mt-2 resize-y"
          disabled={busy}
          id="generate-all-guidance"
          maxLength={INSTRUCTION_MAX_LENGTH}
          onChange={(event) => onGuidanceChange(event.target.value)}
          placeholder="e.g. write for a backend role, keep everything concise"
          value={allGuidance}
        />
        <div className="mt-1 text-right text-xs text-muted-foreground">
          {allGuidance.length}/{INSTRUCTION_MAX_LENGTH}
        </div>
      </div>

      <Button
        variant="brand"
        className="mt-3"
        disabled={busy}
        onClick={onGenerateAll}
      >
        {generatingAll ? (
          <>
            <Loader2 className="animate-spin" />
            Generating…
          </>
        ) : (
          "Generate everything"
        )}
      </Button>
    </Card>
  );
}
