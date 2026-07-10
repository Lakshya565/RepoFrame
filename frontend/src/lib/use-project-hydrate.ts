"use client";

import { useEffect, useRef } from "react";

import { useAuth } from "@/lib/auth-context";
import { useGeneration } from "@/lib/generation-context";
import { getProject } from "@/lib/projects-api";

// Reopen-from-history (Phase 16.0). When the analysis route is opened with a
// `?projectId=<id>` query — the "Open" button in the saved-projects list sets it —
// this loads that saved snapshot and hydrates the generation workspace, so the
// Generate page arrives PRE-FILLED. It deliberately does NOT touch the Analysis
// page's own live fetch: that still runs from the path exactly as for a fresh
// repo-URL paste (metadata, tree, tech stack, commit timeline all reload live).
// Only the generated writeup (profile, outputs, interview prep, verifications, and
// the user context) is restored — no OpenAI call, no token spend.
//
// Runs at most once per mount, guarded by a ref that is NOT paired with a
// cleanup-based cancel — the same StrictMode reasoning as use-inferred-context.ts:
// StrictMode's dev double-mount would otherwise cancel the one and only load. The
// query param is stripped after the load so a refresh or later re-render can't
// re-hydrate and clobber edits, and a subsequent live re-analysis isn't re-tagged
// as a reopen.
export function useProjectHydrate(): void {
  const { status } = useAuth();
  const { hydrate } = useGeneration();
  const startedRef = useRef(false);

  useEffect(() => {
    // Saved projects are an authenticated fetch, so wait for a signed-in user;
    // there's no token to load with until auth resolves. (Reopen is only reachable
    // from the signed-in saved list, so this is the only state that matters.)
    if (status !== "signedIn") {
      return;
    }
    if (startedRef.current) {
      return;
    }

    const projectId = new URLSearchParams(window.location.search).get(
      "projectId",
    );
    if (!projectId) {
      return;
    }
    startedRef.current = true;

    async function run(id: string) {
      try {
        const snapshot = await getProject(id);
        hydrate(snapshot);
      } catch {
        // A failed reopen is non-fatal: the Analysis page still loaded live, and the
        // user can regenerate. Swallow so nothing surfaces over the workspace.
      } finally {
        // Drop ?projectId (keep the path + hash) so a refresh / re-render won't
        // re-hydrate. replaceState avoids a navigation, so the live fetch is not
        // disturbed.
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.hash,
        );
      }
    }

    void run(projectId);
  }, [status, hydrate]);
}
