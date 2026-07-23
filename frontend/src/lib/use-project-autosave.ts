"use client";

import { useEffect, useMemo, useRef } from "react";

import { useAuth } from "@/lib/auth-context";
import { useGeneration } from "@/lib/generation-context";
import { snapshotSignature } from "@/lib/project-snapshot";
import { saveProject, type SaveProjectRequest } from "@/lib/projects-api";

// Best-effort auto-save of the current analysis snapshot to the signed-in user's
// account. Debounced so a burst of edits/generations coalesces into one write, and
// gated so it never runs in the signed-out flow: the user must be signed in and
// repository metadata must exist (meaning the repository has been analyzed).
// Analyzing a repo is enough to record it in History — generated content is NOT
// required. The row is created on analysis and later upserts (same repo URL) once a
// writeup is generated, so History becomes a true record of every repo looked at.
// Failures are swallowed — persistence must never interrupt or surface over the
// generation flow.

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
    persistedSignature,
    setPersistedSignature,
  } = useGeneration();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Signature of the current savable content. When it equals persistedSignature
  // there is nothing new to write — which is what makes a reopen inert (hydrate
  // seeds persistedSignature) and de-duplicates identical back-to-back saves.
  const signature = useMemo(
    () =>
      snapshotSignature({
        context,
        profile,
        outputs,
        interviewTopics,
        verifications,
        allGuidance,
      }),
    [context, profile, outputs, interviewTopics, verifications, allGuidance],
  );

  useEffect(() => {
    // All the gates. Any failing one means "don't auto-save" — cleanly inert.
    if (status !== "signedIn") return;
    // Metadata present == the repo has been analyzed; that alone is savable.
    if (!repoMetadata) return;
    // Never save mid-generation; wait for the run to settle.
    if (busyTask) return;
    // Nothing new since the last save (or since a reopen hydrated this content):
    // skip the write so reopening doesn't re-save and bump the project's order.
    if (signature === persistedSignature) return;

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
      void saveProject(body)
        .then(() => {
          // Record what we just persisted so an unchanged workspace won't save again.
          setPersistedSignature(signature);
        })
        .catch(() => {
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
    busyTask,
    signature,
    persistedSignature,
    setPersistedSignature,
    context,
    profile,
    outputs,
    interviewTopics,
    allGuidance,
    verifications,
  ]);
}
