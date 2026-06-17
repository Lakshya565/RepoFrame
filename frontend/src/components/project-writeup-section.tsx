"use client";

import { useState } from "react";
import { EvidencePanel } from "@/components/evidence-panel";
import { GeneratedOutputsCard } from "@/components/generated-outputs-card";
import { UserContextForm } from "@/components/user-context-form";
import {
  EMPTY_OUTPUTS,
  INSTRUCTION_MAX_LENGTH,
  mergeSection,
  sectionToText,
} from "@/lib/outputs";
import {
  generateInterviewPrep,
  generateOutputs,
  generateProfile,
  reviseOutput,
  type GeneratedOutputs,
  type InterviewTopic,
  type OutputSection,
  type ProjectProfileData,
} from "@/lib/repo-api";
import {
  EMPTY_USER_CONTEXT,
  userContextEquals,
  type UserContext,
} from "@/lib/user-context";

type ProjectWriteupSectionProps = {
  repoUrl: string;
};

// Identifies the single generation task allowed to run at a time. The presence
// of a task is the global lock that disables every other trigger.
type GenerationTask =
  | { kind: "all" }
  | { kind: "section"; section: OutputSection }
  | { kind: "revise"; section: OutputSection }
  | { kind: "interview" };

// Reads an Error message with a fallback.
function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

// Owns the questionnaire answers (lifted from the form), the generated profile,
// the per-section outputs, and the interview topics, and orchestrates every
// OpenAI call. Properties that matter here:
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
// Nothing generates on load — every call is an explicit button press.
export function ProjectWriteupSection({ repoUrl }: ProjectWriteupSectionProps) {
  const [context, setContext] = useState<UserContext>(EMPTY_USER_CONTEXT);

  const [profile, setProfile] = useState<ProjectProfileData | null>(null);
  // The questionnaire snapshot the current profile was built from. The profile is
  // reused only while this still matches the live answers.
  const [profileContext, setProfileContext] = useState<UserContext | null>(null);
  const [outputs, setOutputs] = useState<GeneratedOutputs>(EMPTY_OUTPUTS);
  const [interviewTopics, setInterviewTopics] = useState<
    InterviewTopic[] | null
  >(null);
  // The last-generated text per section, so the card can tell whether the user
  // has edited a draft (which enables the feedback regenerate).
  const [baselines, setBaselines] = useState<
    Partial<Record<OutputSection, string>>
  >({});
  // Preemptive instruction applied to everything produced by "Generate all".
  const [allGuidance, setAllGuidance] = useState("");

  const [busyTask, setBusyTask] = useState<GenerationTask | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Returns the profile, regenerating it when the questionnaire changed since it
  // was built (so grounding stays current) and reusing it otherwise.
  async function ensureProfile(): Promise<ProjectProfileData> {
    if (profile && profileContext && userContextEquals(profileContext, context)) {
      return profile;
    }
    const response = await generateProfile(repoUrl, context);
    setProfile(response.profile);
    setProfileContext(context);
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

      const outputsResponse = await generateOutputs(
        profileResponse.profile,
        undefined,
        allGuidance,
      );
      setOutputs(outputsResponse.outputs);
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
    } catch (caught) {
      setError(messageOf(caught, "RepoFrame could not generate the writeup."));
    } finally {
      setBusyTask(null);
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
    } catch (caught) {
      setError(messageOf(caught, "RepoFrame could not generate that section."));
    } finally {
      setBusyTask(null);
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
      return true;
    } catch (caught) {
      setError(messageOf(caught, "RepoFrame could not regenerate that section."));
      return false;
    } finally {
      setBusyTask(null);
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
    } catch (caught) {
      setError(messageOf(caught, "RepoFrame could not generate interview prep."));
    } finally {
      setBusyTask(null);
    }
  }

  const busy = busyTask !== null;
  const generatingSection =
    busyTask?.kind === "section" ? busyTask.section : null;
  const revisingSection = busyTask?.kind === "revise" ? busyTask.section : null;

  return (
    <div className="space-y-6">
      <UserContextForm context={context} onContextChange={setContext} />

      <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Generated outputs
        </p>
        <h2 className="mt-3 text-2xl font-semibold">
          Turn this repo into a writeup
        </h2>
        <p className="mt-3 text-base leading-7 text-slate-600">
          Generate each output on its own from the tabs below, or generate
          everything at once. Each generation calls the OpenAI API; only one runs
          at a time.
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Heads up: the first generation builds the project profile, so it can take
          around 20 seconds. Later generations reuse the profile and are faster.
        </p>

        <div className="mt-5">
          <label
            className="text-sm font-medium text-slate-900"
            htmlFor="generate-all-guidance"
          >
            Instructions for the model (optional)
          </label>
          <p className="mt-1 text-sm text-slate-500">
            Added to the prompt for everything produced by Generate all.
          </p>
          <textarea
            className="mt-2 min-h-16 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50"
            disabled={busy}
            id="generate-all-guidance"
            maxLength={INSTRUCTION_MAX_LENGTH}
            onChange={(event) => setAllGuidance(event.target.value)}
            placeholder="e.g. write for a backend role, keep everything concise"
            value={allGuidance}
          />
          <div className="mt-1 text-right text-xs text-slate-400">
            {allGuidance.length}/{INSTRUCTION_MAX_LENGTH}
          </div>
        </div>

        <button
          className="mt-3 inline-flex min-h-11 items-center rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy}
          onClick={handleGenerateAll}
          type="button"
        >
          {busyTask?.kind === "all"
            ? "Generating…"
            : "Generate all (profile, outputs, interview prep)"}
        </button>

        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
        </div>
      </article>
    </div>
  );
}
