"use client";

import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ClaimVerificationPanel } from "@/components/claim-verification-panel";
import { EvidencePanel } from "@/components/evidence-panel";
import { GeneratedOutputsCard } from "@/components/generated-outputs-card";
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
  verifyClaims,
  type GeneratedOutputs,
  type OutputSection,
  type ProjectProfileData,
} from "@/lib/repo-api";
import { userContextEquals } from "@/lib/user-context";
import { useGeneration } from "@/lib/generation-context";

type ProjectWriteupSectionProps = {
  repoUrl: string;
};

// The four core output sections, used to tell whether anything has been generated
// yet (which gates the opt-in verification actions).
const OUTPUT_SECTIONS: OutputSection[] = [
  "resumeBullets",
  "readmeIntro",
  "portfolioBlurb",
  "linkedinDescription",
];

// Short button labels for the per-tab "Verify this tab" controls, in display order.
const SECTION_VERIFY_LABELS: { section: OutputSection; label: string }[] = [
  { section: "resumeBullets", label: "Resume" },
  { section: "readmeIntro", label: "README" },
  { section: "portfolioBlurb", label: "Portfolio" },
  { section: "linkedinDescription", label: "LinkedIn" },
];

// Reads an Error message with a fallback.
function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

// Orchestrates every OpenAI call for the generation workspace. The state it works
// over (questionnaire answers, generated profile, per-section outputs, interview
// topics, claim verifications) is held in the shared GenerationProvider so it
// survives tab navigation; this component reads/writes it via useGeneration.
// Properties that matter here:
//   1. The profile is the distilled repo context. It is generated once and
//      reused for every later call as long as the questionnaire is unchanged, so
//      the raw repo evidence is never re-sent and OpenAI prompt-caches the
//      profile prefix. Editing the questionnaire forces a refresh on the next
//      call so grounding stays current.
//   2. Only one generation runs at a time (busyTask); every trigger is disabled
//      while a call is in flight, so rapid clicks cannot stack up calls.
//   3. An optional instruction is folded into the prompt up front (per-tab and a
//      shared one for "Generate all"), so the user can one-shot a result to spec
//      instead of generating then regenerating.
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
  // guidance applied throughout.
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

  // Runs the bounded verification agent over the current outputs. Opt-in: it only
  // fires on an explicit press, never as part of the default flow, so it cannot
  // spend tokens without a deliberate click. A section scopes the run to one tab
  // (a targeted re-check); null verifies every tab at once. Either way the result
  // replaces the panel, and the per-claim tab badges show what was covered. The
  // backend rebuilds the repo evidence from the URL and checks each claim.
  async function handleVerifyClaims(section: OutputSection | null) {
    if (busyTask) {
      return;
    }
    setBusyTask({ kind: "verify", section });
    setError(null);

    try {
      const response = await verifyClaims(
        repoUrl,
        context,
        outputs,
        section ? [section] : undefined,
      );
      setVerifications(response.verifications);
      addUsage(response.usage);
    } catch (caught) {
      setError(messageOf(caught, "RepoFrame could not verify the claims."));
    } finally {
      setBusyTask(null);
      refreshLifetime();
    }
  }

  const busy = busyTask !== null;
  const generatingSection =
    busyTask?.kind === "section" ? busyTask.section : null;
  const revisingSection = busyTask?.kind === "revise" ? busyTask.section : null;
  // Verification only makes sense once there is at least one generated output to
  // check, so the button stays disabled until then.
  const hasAnyOutput = OUTPUT_SECTIONS.some((section) =>
    sectionHasContent(outputs, section),
  );

  return (
    <div className="space-y-6">
      <UserContextForm context={context} onContextChange={setContext} />

      <Card beam className="p-6">
        <h3 className="text-lg font-semibold">Turn this repo into a writeup</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Generate each piece on its own from the tabs below, or generate
          everything at once. Only one runs at a time.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The first generation takes a little longer (around 20 seconds) while we
          read and understand your project. After that, it&apos;s faster.
        </p>

        <div className="mt-5">
          <label
            className="text-sm font-medium"
            htmlFor="generate-all-guidance"
          >
            Instructions for the model (optional)
          </label>
          <p className="mt-1 text-sm text-muted-foreground">
            Added to the prompt for everything produced by Generate all.
          </p>
          <Textarea
            className="mt-2 resize-y"
            disabled={busy}
            id="generate-all-guidance"
            maxLength={INSTRUCTION_MAX_LENGTH}
            onChange={(event) => setAllGuidance(event.target.value)}
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
          onClick={handleGenerateAll}
        >
          {busyTask?.kind === "all" ? (
            <>
              <Loader2 className="animate-spin" />
              Generating…
            </>
          ) : (
            "Generate everything"
          )}
        </Button>

        {error ? (
          <p
            className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 space-y-6">
          <GeneratedOutputsCard
            baselines={baselines}
            busy={busy}
            generatingInterview={busyTask?.kind === "interview"}
            generatingSection={generatingSection}
            interviewTopics={interviewTopics}
            onGenerateInterview={handleGenerateInterview}
            onGenerateSection={handleGenerateSection}
            onOutputsChange={(next) => setOutputs(next)}
            onReviseSection={handleReviseSection}
            outputs={outputs}
            revisingSection={revisingSection}
          />

          {profile ? <EvidencePanel evidence={profile.evidence} /> : null}

          {/* Opt-in claim verification: explicit actions, so it never spends
              tokens on its own. "Verify all claims" checks every tab in one call
              (a shared fact is verified once and tagged with each tab it appears
              in); the per-tab buttons re-check a single tab. */}
          <div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy || !hasAnyOutput}
                onClick={() => handleVerifyClaims(null)}
              >
                {busyTask?.kind === "verify" && busyTask.section === null ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Verifying…
                  </>
                ) : (
                  "Verify all claims"
                )}
              </Button>

              {SECTION_VERIFY_LABELS.map(({ section, label }) =>
                sectionHasContent(outputs, section) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    key={section}
                    onClick={() => handleVerifyClaims(section)}
                  >
                    {busyTask?.kind === "verify" && busyTask.section === section
                      ? "Verifying…"
                      : `Verify ${label}`}
                  </Button>
                ) : null,
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              We check each generated claim against your repository and the
              context you gave us. This runs only when you ask.
            </p>
          </div>

          <ClaimVerificationPanel
            loading={busyTask?.kind === "verify"}
            verifications={verifications}
          />
        </div>
      </Card>
    </div>
  );
}
