"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { fetchRepoMetadata, fetchTechStack } from "@/lib/repo-api";
import { type UserContext } from "@/lib/user-context";

// How many detected technologies seed the "Technical focus" guess. Bounded so the
// field stays a short focus list rather than a dump of every detected library.
const MAX_FOCUS_TECHNOLOGIES = 6;

type SeedArgs = {
  repoUrl: string;
  // Whether the guess was already seeded this session (kept in the provider so the
  // seed runs once, not on every return to the Generate tab).
  alreadySeeded: boolean;
  onSeeded: () => void;
  // The provider's context setter — a functional update reads the latest answers,
  // so seeding only fills blank guess fields and never clobbers user edits.
  setContext: Dispatch<SetStateAction<UserContext>>;
};

// Seeds the "RepoFrame's guess" fields from FREE repo analysis — no OpenAI, no
// token spend: the detected tech stack becomes the Technical focus and the GitHub
// repo description becomes the Project purpose. This is what makes the context step
// feel like a review of work RepoFrame already did rather than a blank form.
//
// It runs once per session (guarded by the provider flag), fills ONLY blank guess
// fields via a functional merge (so a user's edits are never overwritten), and
// reports `seeding` so the form can show an "analyzing" hint. Failures are
// swallowed — a missing description or a stack-detection hiccup just leaves the
// field blank for the user to fill in.
export function useInferredContextGuesses({
  repoUrl,
  alreadySeeded,
  onSeeded,
  setContext,
}: SeedArgs): { seeding: boolean } {
  // Only the very first, un-seeded mount shows the analyzing hint; a return visit
  // (already seeded) starts settled.
  const [seeding, setSeeding] = useState(!alreadySeeded);
  // Guards against the effect's body running its fetch twice (e.g. StrictMode
  // double-invoke) within one mount.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current || alreadySeeded) {
      return;
    }
    startedRef.current = true;
    let cancelled = false;

    async function seed() {
      try {
        // Both are free (GitHub-only) and independent, so fetch in parallel and
        // tolerate either failing on its own.
        const [metadata, techStack] = await Promise.all([
          fetchRepoMetadata(repoUrl).catch(() => null),
          fetchTechStack(repoUrl).catch(() => null),
        ]);
        if (cancelled) {
          return;
        }

        const purpose = metadata?.description?.trim() ?? "";
        const focus = techStack
          ? [...techStack.technologies]
              .sort((a, b) => b.confidence - a.confidence)
              .slice(0, MAX_FOCUS_TECHNOLOGIES)
              .map((tech) => tech.name)
              .join(", ")
          : "";

        // Fill only blank guess fields; a functional update sees the latest
        // context so concurrent typing is never overwritten.
        setContext((current) => ({
          ...current,
          purpose: current.purpose.trim() === "" ? purpose : current.purpose,
          technicalFocus:
            current.technicalFocus.trim() === ""
              ? focus
              : current.technicalFocus,
        }));
      } finally {
        if (!cancelled) {
          setSeeding(false);
          onSeeded();
        }
      }
    }

    void seed();

    return () => {
      cancelled = true;
    };
  }, [repoUrl, alreadySeeded, onSeeded, setContext]);

  return { seeding };
}
