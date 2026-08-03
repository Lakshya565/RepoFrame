export type DemoWalkthroughStep = 1 | 2 | 3 | 4 | 5;

export type DemoWalkthroughDisplay = "open" | "dismissed" | "finished";

export type DemoGenerationKind =
  | "all"
  | "resumeBullets"
  | "readmeIntro"
  | "portfolioBlurb"
  | "linkedinDescription"
  | "interview";

export type DemoWalkthroughState = {
  step: DemoWalkthroughStep;
  display: DemoWalkthroughDisplay;
  analysisTargetViewed: boolean;
  historyOpened: boolean;
};

export type DemoWalkthroughEvent =
  | { type: "analysis_target_viewed" }
  | { type: "generate_tab_opened" }
  | { type: "context_continued"; source: "added" | "repo_only" }
  | {
      type: "generation_finished";
      kind: DemoGenerationKind;
      succeeded: boolean;
    }
  | { type: "audit_finished"; succeeded: boolean }
  | { type: "history_opened" }
  | { type: "dismiss" }
  | { type: "resume" }
  | { type: "finish" }
  | { type: "restart" };

export const INITIAL_DEMO_WALKTHROUGH_STATE: DemoWalkthroughState = {
  step: 1,
  display: "open",
  analysisTargetViewed: false,
  historyOpened: false,
};

const AUDITABLE_GENERATION_KINDS = new Set<DemoGenerationKind>([
  "all",
  "resumeBullets",
  "readmeIntro",
  "portfolioBlurb",
  "linkedinDescription",
]);

// Keeps walkthrough progress monotonic: product events only advance the exact
// step they complete, so exploring out of order cannot accidentally skip ahead.
export function reduceDemoWalkthrough(
  state: DemoWalkthroughState,
  event: DemoWalkthroughEvent,
): DemoWalkthroughState {
  switch (event.type) {
    case "analysis_target_viewed":
      return state.step === 1
        ? { ...state, analysisTargetViewed: true }
        : state;
    case "generate_tab_opened":
      return state.step === 1 ? { ...state, step: 2 } : state;
    case "context_continued":
      return state.step === 2 ? { ...state, step: 3 } : state;
    case "generation_finished":
      return state.step === 3 &&
        event.succeeded &&
        AUDITABLE_GENERATION_KINDS.has(event.kind)
        ? { ...state, step: 4 }
        : state;
    case "audit_finished":
      return state.step === 4 && event.succeeded
        ? { ...state, step: 5, historyOpened: false }
        : state;
    case "history_opened":
      return state.step === 5 ? { ...state, historyOpened: true } : state;
    case "dismiss":
      return state.display === "open"
        ? { ...state, display: "dismissed" }
        : state;
    case "resume":
      return state.display === "dismissed"
        ? { ...state, display: "open" }
        : state;
    case "finish":
      return state.step === 5 && state.historyOpened
        ? { ...state, display: "finished" }
        : state;
    case "restart":
      return INITIAL_DEMO_WALKTHROUGH_STATE;
  }
}
