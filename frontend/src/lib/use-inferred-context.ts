"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { fetchRepoMetadata, fetchTechStack } from "@/lib/repo-api";
import { demoFetchRepoMetadata, demoFetchTechStack } from "@/lib/demo-analysis";
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
  // In the signed-out demo, seed from the frozen fixtures (same code path, same
  // "analyzing" hint) instead of calling GitHub.
  demo?: boolean;
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
  demo = false,
}: SeedArgs): { seeding: boolean } {
  // Only the very first, un-seeded mount shows the analyzing hint; a return visit
  // (already seeded) starts settled.
  const [seeding, setSeeding] = useState(!alreadySeeded);
  // Dedupes the fetch so it runs exactly once even under React StrictMode's
  // dev-only double mount. It must NOT be paired with a per-mount "cancelled"
  // flag flipped in cleanup: StrictMode tears down the first mount (running its
  // cleanup) before the second mount, but this ref then makes the second mount
  // skip re-fetching — so a cleanup-based cancel would abort the one and only
  // seed, leaving the guess fields blank and the "analyzing" hint spinning
  // forever. Guarding by this ref alone lets the single run always complete.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current || alreadySeeded) {
      return;
    }
    startedRef.current = true;

    async function seed() {
      try {
        // Both are free (GitHub-only) and independent, so fetch in parallel and
        // tolerate either failing on its own. In the demo these resolve from the
        // frozen fixtures — no network — but through the very same seeding path.
        const [metadata, techStack] = await Promise.all([
          (demo ? demoFetchRepoMetadata() : fetchRepoMetadata(repoUrl)).catch(
            () => null,
          ),
          (demo ? demoFetchTechStack() : fetchTechStack(repoUrl)).catch(
            () => null,
          ),
        ]);

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
        // Always settle the hint and mark the session seeded, even if both
        // fetches failed — a blank guess is the user's to fill, not a stuck
        // spinner. A repo change remounts the whole provider (keyed by base
        // path), so there is no in-place repoUrl swap that could land a stale
        // write here.
        setSeeding(false);
        onSeeded();
      }
    }

    void seed();
  }, [repoUrl, alreadySeeded, onSeeded, setContext, demo]);

  return { seeding };
}
