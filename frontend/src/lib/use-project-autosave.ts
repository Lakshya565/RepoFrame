"use client";

import { useEffect, useRef } from "react";

import { useAuth } from "@/lib/auth-context";
import { useGeneration } from "@/lib/generation-context";
import { saveProject, type SaveProjectRequest } from "@/lib/projects-api";

// Best-effort auto-save of the current analysis snapshot to the signed-in user's
// account. Debounced so a burst of edits/generations coalesces into one write, and
// gated three ways so it never runs in the public/dev flow:
//   * NEXT_PUBLIC_SHOW_SAVED must be "true" (the saved-projects feature flag),
//   * the user must be signed in,
//   * repo metadata + some generated content must exist to save.
// Failures are swallowed — persistence must never interrupt or surface over the
// generation flow.

const SAVED_FEATURE_ENABLED = process.env.NEXT_PUBLIC_SHOW_SAVED === "true";

// How long to wait after the last change before writing. One tunable place.
const AUTOSAVE_DEBOUNCE_MS = 1500;

export function useProjectAutoSave(): void {
  const { status } = useAuth();
  const {
    repoMetadata,
    context,
    profile,
    outputs,
    interviewTopics,
    allGuidance,
    verifications,
    busyTask,
  } = useGeneration();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // There is something worth persisting once a profile or any output section
  // exists — a bare repo view (metadata only) is not saved.
  const hasContent = Boolean(
    profile ||
      outputs.resumeBullets ||
      outputs.readmeIntro ||
      outputs.portfolioBlurb ||
      outputs.linkedinDescription,
  );

  useEffect(() => {
    // All the gates. Any failing one means "don't auto-save" — cleanly inert.
    if (!SAVED_FEATURE_ENABLED) return;
    if (status !== "signedIn") return;
    if (!repoMetadata) return;
    if (!hasContent) return;
    // Never save mid-generation; wait for the run to settle.
    if (busyTask) return;

    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      const body: SaveProjectRequest = {
        owner: repoMetadata.owner,
        repo: repoMetadata.repo,
        normalizedUrl: repoMetadata.normalizedUrl,
        defaultBranch: repoMetadata.defaultBranch,
        // Private-repo detection arrives with the GitHub App (15.5); public today.
        isPrivate: false,
        metadata: repoMetadata,
        userContext: context,
        profile,
        outputs,
        interviewTopics,
        allGuidance,
        verifications,
        verificationModel: null,
      };
      void saveProject(body).catch(() => {
        // Best-effort: a failed background save is intentionally silent.
      });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [
    status,
    repoMetadata,
    hasContent,
    busyTask,
    context,
    profile,
    outputs,
    interviewTopics,
    allGuidance,
    verifications,
  ]);
}
