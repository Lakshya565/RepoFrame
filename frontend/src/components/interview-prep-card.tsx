"use client";

import { useState } from "react";
import {
  generateInterviewPrep,
  type InterviewTopic,
  type ProjectProfileData,
} from "@/lib/repo-api";

type InterviewPrepCardProps = {
  profile: ProjectProfileData;
};

// Opt-in interview prep. Talking points are generated only when the user clicks
// the button, so this never spends tokens as part of the default writeup flow.
// The component owns its own loading, error, and result state.
export function InterviewPrepCard({ profile }: InterviewPrepCardProps) {
  const [topics, setTopics] = useState<InterviewTopic[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calls the opt-in interview-prep endpoint against the existing profile.
  async function handleGenerate() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await generateInterviewPrep(profile);
      setTopics(response.topics);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "RepoFrame could not generate interview prep.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Interview prep
      </p>
      <h3 className="mt-3 text-lg font-semibold">Practice talking points</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Optional. Generates likely interview questions and talking points from the
        profile. This makes a separate OpenAI call.
      </p>

      <button
        className="mt-4 inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={handleGenerate}
        disabled={isLoading}
        type="button"
      >
        {isLoading
          ? "Generating…"
          : topics
            ? "Regenerate interview prep"
            : "Generate interview prep"}
      </button>

      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {topics ? (
        <div className="mt-5 space-y-4">
          {topics.length > 0 ? (
            topics.map((topic, index) => (
              <div
                className="rounded-md border border-slate-200 bg-slate-50 p-4"
                key={index}
              >
                <p className="text-base font-semibold text-slate-950">
                  {topic.question}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
                  {topic.talkingPoints.map((point, pointIndex) => (
                    <li key={pointIndex}>{point}</li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">
              No interview topics were returned.
            </p>
          )}
        </div>
      ) : null}
    </article>
  );
}
