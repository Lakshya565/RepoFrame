"use client";

import { useState } from "react";
import { EvidencePanel } from "@/components/evidence-panel";
import { GeneratedOutputsCard } from "@/components/generated-outputs-card";
import { InterviewPrepCard } from "@/components/interview-prep-card";
import { UserContextForm } from "@/components/user-context-form";
import {
  generateOutputs,
  generateProfile,
  type GeneratedOutputs,
  type OutputSection,
  type ProjectProfileData,
} from "@/lib/repo-api";
import { EMPTY_USER_CONTEXT, type UserContext } from "@/lib/user-context";

type ProjectWriteupSectionProps = {
  repoUrl: string;
};

// Merges a single regenerated section into the existing outputs, leaving the
// other (possibly edited) sections untouched. Literal keys keep this type-safe.
function mergeSection(
  current: GeneratedOutputs,
  section: OutputSection,
  next: GeneratedOutputs,
): GeneratedOutputs {
  switch (section) {
    case "resumeBullets":
      return { ...current, resumeBullets: next.resumeBullets };
    case "readmeIntro":
      return { ...current, readmeIntro: next.readmeIntro };
    case "portfolioBlurb":
      return { ...current, portfolioBlurb: next.portfolioBlurb };
    case "linkedinDescription":
      return { ...current, linkedinDescription: next.linkedinDescription };
  }
}

// Owns the questionnaire answers (lifted from the form) and orchestrates the
// Phase 11 generation flow: profile -> core outputs, then optional per-section
// regenerate and opt-in interview prep. Every OpenAI call here is triggered by
// an explicit button press — nothing generates automatically on load — so the
// page never spends tokens without a deliberate user action.
export function ProjectWriteupSection({ repoUrl }: ProjectWriteupSectionProps) {
  const [context, setContext] = useState<UserContext>(EMPTY_USER_CONTEXT);

  const [profile, setProfile] = useState<ProjectProfileData | null>(null);
  const [outputs, setOutputs] = useState<GeneratedOutputs | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regeneratingSection, setRegeneratingSection] =
    useState<OutputSection | null>(null);

  // Runs the full writeup generation: build the profile from the repo + context,
  // then generate all core outputs from that profile. The profile is stored so
  // regenerate and interview prep can reuse it without paying for it again.
  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);

    try {
      const profileResponse = await generateProfile(repoUrl, context);
      const outputsResponse = await generateOutputs(profileResponse.profile);
      setProfile(profileResponse.profile);
      setOutputs(outputsResponse.outputs);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "RepoFrame could not generate the writeup.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  // Regenerates a single output section against the stored profile and merges the
  // new value in, leaving the other (possibly edited) outputs untouched.
  async function handleRegenerate(section: OutputSection) {
    if (!profile) {
      return;
    }

    setRegeneratingSection(section);
    setError(null);

    try {
      const response = await generateOutputs(profile, [section]);
      setOutputs((current) =>
        current ? mergeSection(current, section, response.outputs) : response.outputs,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "RepoFrame could not regenerate that section.",
      );
    } finally {
      setRegeneratingSection(null);
    }
  }

  const hasOutputs = outputs !== null;

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
          RepoFrame combines the repository evidence with your project context to
          generate resume bullets, a README intro, a portfolio blurb, and a
          LinkedIn-style description. Generating calls the OpenAI API.
        </p>

        <button
          className="mt-5 inline-flex min-h-11 items-center rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isGenerating || regeneratingSection !== null}
          onClick={handleGenerate}
          type="button"
        >
          {isGenerating
            ? "Generating…"
            : hasOutputs
              ? "Regenerate writeup"
              : "Generate writeup"}
        </button>

        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {outputs ? (
          <div className="mt-6 space-y-6">
            <GeneratedOutputsCard
              onOutputsChange={(next) => setOutputs(next)}
              onRegenerate={handleRegenerate}
              outputs={outputs}
              regeneratingSection={regeneratingSection}
            />
            {profile ? <EvidencePanel evidence={profile.evidence} /> : null}
            {profile ? <InterviewPrepCard profile={profile} /> : null}
          </div>
        ) : null}
      </article>
    </div>
  );
}
