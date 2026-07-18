"use client";

import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import {
  type ClaimVerification,
  type GeneratedOutputs,
  type InterviewTopic,
  type OutputSection,
  type ProjectProfileData,
  type RepoMetadataResponse,
  type UsageTotals,
} from "@/lib/repo-api";
import { type ProjectDetail } from "@/lib/projects-api";
import { EMPTY_OUTPUTS } from "@/lib/outputs";
import { snapshotSignature } from "@/lib/project-snapshot";
import { EMPTY_USER_CONTEXT, type UserContext } from "@/lib/user-context";

// Phase 14: the analysis page became real route segments (Analysis / Generate /
// History tabs). Because each tab is its own page, the generation workspace would
// unmount whenever the user switched tabs — losing a generated writeup. This
// provider lifts ALL generation state up into the shared analysis layout, which
// (per the App Router) stays mounted across navigations between its child pages.
// ProjectWriteupSection and the developer panel read from here instead of owning
// the state, so generation survives — and can even finish — across tab switches.

// Identifies the single generation task allowed to run at a time. The presence of
// a task is the global lock that disables every other trigger. Moved here from
// ProjectWriteupSection because busyTask now lives in the shared state.
export type GenerationTask =
  | { kind: "all" }
  | { kind: "section"; section: OutputSection }
  | { kind: "revise"; section: OutputSection }
  | { kind: "interview" }
  // section null = verify every tab; a section = re-check just that tab.
  | { kind: "verify"; section: OutputSection | null };

// The revert/redo swap cache for one card: the "other" generation the user can
// toggle to, plus whether the reverted (older) version is currently shown (so the
// button reads "Redo"). Session-only — never part of a saved snapshot.
export type SectionRevertMap = Partial<
  Record<OutputSection, { text: string; reverted: boolean }>
>;
export type InterviewRevert = {
  topics: InterviewTopic[];
  reverted: boolean;
} | null;

// The empty per-session token meter, shared by the developer panel and every
// generation call.
const EMPTY_USAGE_TOTALS: UsageTotals = {
  promptTokens: 0,
  completionTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
};

// Sums two usage totals field by field to accumulate the per-session meter.
function addTotals(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

// The full generation state plus its setters. Setters are the raw React
// dispatchers so consumers keep using functional updates (e.g.
// setOutputs((current) => ...)) exactly as before the lift.
type GenerationContextValue = {
  // Questionnaire answers (lifted from the user-context form).
  context: UserContext;
  setContext: Dispatch<SetStateAction<UserContext>>;
  // The distilled repo profile, plus the questionnaire snapshot it was built
  // from (the profile is reused only while that snapshot still matches).
  profile: ProjectProfileData | null;
  setProfile: Dispatch<SetStateAction<ProjectProfileData | null>>;
  profileContext: UserContext | null;
  setProfileContext: Dispatch<SetStateAction<UserContext | null>>;
  // The generated per-section outputs and interview topics.
  outputs: GeneratedOutputs;
  setOutputs: Dispatch<SetStateAction<GeneratedOutputs>>;
  interviewTopics: InterviewTopic[] | null;
  setInterviewTopics: Dispatch<SetStateAction<InterviewTopic[] | null>>;
  // The agent's claim verifications: null until the user runs verification.
  verifications: ClaimVerification[] | null;
  setVerifications: Dispatch<SetStateAction<ClaimVerification[] | null>>;
  // Last-generated text per section, so the card can tell whether a draft was
  // edited (which enables the feedback regenerate).
  baselines: Partial<Record<OutputSection, string>>;
  setBaselines: Dispatch<SetStateAction<Partial<Record<OutputSection, string>>>>;
  // Revert/redo swap cache. A regenerate stashes the prior version here so the card
  // can toggle between the last two generations; a bulk "Generate everything" and a
  // reopen clear it. Session-only (excluded from the saved snapshot).
  sectionRevert: SectionRevertMap;
  setSectionRevert: Dispatch<SetStateAction<SectionRevertMap>>;
  interviewRevert: InterviewRevert;
  setInterviewRevert: Dispatch<SetStateAction<InterviewRevert>>;
  // Preemptive instruction applied to everything produced by "Generate all".
  allGuidance: string;
  setAllGuidance: Dispatch<SetStateAction<string>>;
  // Whether the "RepoFrame's guess" context fields have already been seeded from
  // free repo analysis this session. Lives here (not in the page) so the seed runs
  // once and is not repeated each time the user returns to the Generate tab.
  guessesSeeded: boolean;
  setGuessesSeeded: Dispatch<SetStateAction<boolean>>;
  // The in-flight generation task (the global lock), and the last error.
  busyTask: GenerationTask | null;
  setBusyTask: Dispatch<SetStateAction<GenerationTask | null>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  // The per-session token meter and the lifetime-total refresh signal, read by
  // the developer panel. addUsage accumulates one call's real usage;
  // refreshLifetime bumps the signal so the persistent total refetches.
  sessionUsage: UsageTotals;
  usageRefresh: number;
  addUsage: (usage: UsageTotals) => void;
  refreshLifetime: () => void;
  // The repo metadata for the analysis in progress (Phase 15). Set by the Analysis
  // page once its fetch resolves, and lifted here so the auto-save (which runs in
  // the shared layout, across tabs) has the metadata a saved snapshot needs.
  repoMetadata: RepoMetadataResponse | null;
  setRepoMetadata: Dispatch<SetStateAction<RepoMetadataResponse | null>>;
  // Loads a saved project snapshot into the workspace (reopen-from-History and the
  // signed-out demo both use this). Replaces the questionnaire, profile, outputs,
  // interview prep, and verifications in one shot and marks the guesses as seeded
  // so the seed effect doesn't overwrite the restored context.
  hydrate: (snapshot: ProjectDetail) => void;
  // Signature of the content last persisted to (or hydrated from) the saved-projects
  // store, or null when nothing is saved yet. The auto-save reads this to skip a
  // redundant write when the workspace still matches what's stored — notably right
  // after a reopen — and updates it after each successful save. See project-snapshot.ts.
  persistedSignature: string | null;
  setPersistedSignature: Dispatch<SetStateAction<string | null>>;
};

const GenerationContext = createContext<GenerationContextValue | null>(null);

// Holds the entire generation workspace state. Mounted once in the analysis
// layout so the state outlives tab navigation.
export function GenerationProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<UserContext>(EMPTY_USER_CONTEXT);
  const [profile, setProfile] = useState<ProjectProfileData | null>(null);
  const [profileContext, setProfileContext] = useState<UserContext | null>(null);
  const [outputs, setOutputs] = useState<GeneratedOutputs>(EMPTY_OUTPUTS);
  const [interviewTopics, setInterviewTopics] = useState<
    InterviewTopic[] | null
  >(null);
  const [verifications, setVerifications] = useState<
    ClaimVerification[] | null
  >(null);
  const [baselines, setBaselines] = useState<
    Partial<Record<OutputSection, string>>
  >({});
  const [sectionRevert, setSectionRevert] = useState<SectionRevertMap>({});
  const [interviewRevert, setInterviewRevert] = useState<InterviewRevert>(null);
  const [allGuidance, setAllGuidance] = useState("");
  const [guessesSeeded, setGuessesSeeded] = useState(false);
  const [busyTask, setBusyTask] = useState<GenerationTask | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sessionUsage, setSessionUsage] =
    useState<UsageTotals>(EMPTY_USAGE_TOTALS);
  const [usageRefresh, setUsageRefresh] = useState(0);

  const [repoMetadata, setRepoMetadata] =
    useState<RepoMetadataResponse | null>(null);
  const [persistedSignature, setPersistedSignature] = useState<string | null>(
    null,
  );

  // Restore a saved snapshot into every piece of workspace state. Baselines reset
  // to empty (the restored drafts are treated as unedited), and busyTask/error
  // clear so a reopened project lands in a clean, idle state. The restored content's
  // signature is recorded as "already persisted" so the auto-save doesn't
  // immediately re-write the just-reopened snapshot (Phase 16.0).
  function hydrate(snapshot: ProjectDetail) {
    setContext(snapshot.userContext);
    setProfile(snapshot.profile);
    setProfileContext(snapshot.userContext);
    setOutputs(snapshot.outputs);
    setInterviewTopics(snapshot.interviewTopics);
    setVerifications(snapshot.verifications);
    setBaselines({});
    setSectionRevert({});
    setInterviewRevert(null);
    setAllGuidance(snapshot.allGuidance);
    setGuessesSeeded(true);
    setRepoMetadata(snapshot.metadata);
    setBusyTask(null);
    setError(null);
    setPersistedSignature(
      snapshotSignature({
        context: snapshot.userContext,
        profile: snapshot.profile,
        outputs: snapshot.outputs,
        interviewTopics: snapshot.interviewTopics,
        verifications: snapshot.verifications,
        allGuidance: snapshot.allGuidance,
      }),
    );
  }

  // Built fresh each render: the provider only re-renders when its own state
  // changes, which is exactly when consumers should see new values.
  const value: GenerationContextValue = {
    context,
    setContext,
    profile,
    setProfile,
    profileContext,
    setProfileContext,
    outputs,
    setOutputs,
    interviewTopics,
    setInterviewTopics,
    verifications,
    setVerifications,
    baselines,
    setBaselines,
    sectionRevert,
    setSectionRevert,
    interviewRevert,
    setInterviewRevert,
    allGuidance,
    setAllGuidance,
    guessesSeeded,
    setGuessesSeeded,
    busyTask,
    setBusyTask,
    error,
    setError,
    sessionUsage,
    usageRefresh,
    addUsage: (usage) => setSessionUsage((prev) => addTotals(prev, usage)),
    refreshLifetime: () => setUsageRefresh((count) => count + 1),
    repoMetadata,
    setRepoMetadata,
    hydrate,
    persistedSignature,
    setPersistedSignature,
  };

  return (
    <GenerationContext.Provider value={value}>
      {children}
    </GenerationContext.Provider>
  );
}

// Reads the generation state. Throws if used outside the provider so a missing
// layout wrapper fails loudly rather than silently losing state.
export function useGeneration(): GenerationContextValue {
  const value = useContext(GenerationContext);
  if (!value) {
    throw new Error("useGeneration must be used within a GenerationProvider");
  }
  return value;
}
