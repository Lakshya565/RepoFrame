import type {
  ClaimVerification,
  GeneratedOutputs,
  InterviewTopic,
  ProjectProfileData,
} from "@/lib/repo-api";
import type { UserContext } from "@/lib/user-context";

// A stable signature of the *savable* generation content, used to tell whether the
// workspace has anything new to persist. The auto-save (use-project-autosave.ts)
// compares the current signature to the last-saved one and skips a write when they
// match — which is what stops a just-reopened snapshot (hydrated, then unchanged)
// from being immediately re-saved (Phase 16.0). Identity/metadata fields are
// excluded: they don't change within one repo's workspace, so only the generated
// content matters for "is there a new version to save?".

export type SnapshotContent = {
  context: UserContext;
  profile: ProjectProfileData | null;
  outputs: GeneratedOutputs;
  interviewTopics: InterviewTopic[] | null;
  verifications: ClaimVerification[] | null;
  allGuidance: string;
};

// Deterministic for equal content: a fixed field order and JSON serialization, so
// two identical snapshots always produce the same string. This is an equality
// probe, not a canonical hash — it only needs to be stable across renders for the
// same values, which JSON.stringify over a fixed-order array gives us.
export function snapshotSignature(content: SnapshotContent): string {
  return JSON.stringify([
    content.context,
    content.profile,
    content.outputs,
    content.interviewTopics,
    content.verifications,
    content.allGuidance,
  ]);
}
