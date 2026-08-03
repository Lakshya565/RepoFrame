"use client";

import { useEffect, useMemo, useRef } from "react";

import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api-client";
import { useGeneration } from "@/lib/generation-context";
import { snapshotSignature } from "@/lib/project-snapshot";
import { saveProject, type SaveProjectRequest } from "@/lib/projects-api";
import { isRetryablePersistenceStatus } from "@/lib/request-recovery";

// Best-effort auto-save of the current analysis snapshot to the signed-in user's
// account. Debounced so a burst of edits/generations coalesces into one write, and
// gated so it never runs in the signed-out flow: the user must be signed in and
// repository metadata must exist (meaning the repository has been analyzed).
// Analyzing a repo is enough to record it in History — generated content is NOT
// required. The row is created on analysis and later upserts (same repo URL) once a
// writeup is generated, so History becomes a true record of every repo looked at.
// Transient failures retry in the background, but persistence never interrupts
// or replaces the generation flow with an autosave error.

// How long to wait after the last change before writing. One tunable place.
const AUTOSAVE_DEBOUNCE_MS = 1500;
const AUTOSAVE_RETRY_DELAYS_MS = [2000, 5000, 15000] as const;

// Network failures and temporary backend/Supabase responses can recover without
// user action. Validation/auth failures need a real state change, so repeatedly
// posting the same payload would only create noise.
function isRetryableSaveError(caught: unknown): boolean {
  if (!(caught instanceof ApiError)) {
    return true;
  }
  return isRetryablePersistenceStatus(caught.status);
}

export function useProjectAutoSave(): void {
  const { status, session } = useAuth();
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
    let cancelled = false;
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

    const persist = async (attempt: number): Promise<void> => {
      try {
        await saveProject(body);
        if (!cancelled) {
          // Record what we persisted so an unchanged workspace stays inert.
          setPersistedSignature(signature);
        }
      } catch (caught) {
        const retryDelay = AUTOSAVE_RETRY_DELAYS_MS[attempt];
        if (
          cancelled ||
          retryDelay === undefined ||
          !isRetryableSaveError(caught)
        ) {
          return;
        }
        timer.current = setTimeout(() => {
          void persist(attempt + 1);
        }, retryDelay);
      }
    };

    timer.current = setTimeout(() => {
      void persist(0);
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [
    status,
    session?.access_token,
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
