import test from "node:test";
import assert from "node:assert/strict";

import {
  INITIAL_DEMO_WALKTHROUGH_STATE,
  reduceDemoWalkthrough,
  type DemoWalkthroughEvent,
  type DemoWalkthroughState,
} from "../src/lib/demo-walkthrough-state.ts";

function apply(
  events: DemoWalkthroughEvent[],
  initial: DemoWalkthroughState = INITIAL_DEMO_WALKTHROUGH_STATE,
) {
  return events.reduce(reduceDemoWalkthrough, initial);
}

const OPEN_GENERATE: DemoWalkthroughEvent = { type: "generate_tab_opened" };
const CONTINUE_ADDED: DemoWalkthroughEvent = {
  type: "context_continued",
  source: "added",
};

test("advances through the complete action-driven walkthrough", () => {
  const state = apply([
    OPEN_GENERATE,
    CONTINUE_ADDED,
    { type: "generation_finished", kind: "all", succeeded: true },
    { type: "audit_finished", succeeded: true },
    { type: "history_opened" },
  ]);

  assert.equal(state.step, 5);
  assert.equal(state.historyOpened, true);
  assert.equal(state.display, "open");
});

test("records analysis exploration without advancing the walkthrough", () => {
  const explored = reduceDemoWalkthrough(INITIAL_DEMO_WALKTHROUGH_STATE, {
    type: "analysis_checkpoint_reached",
  });

  assert.equal(explored.step, 1);
  assert.equal(explored.analysisExplored, true);
});

test("ignores out-of-order events instead of skipping steps", () => {
  const initial = INITIAL_DEMO_WALKTHROUGH_STATE;
  const state = apply(
    [
      { type: "history_opened" },
      { type: "audit_finished", succeeded: true },
      { type: "generation_finished", kind: "all", succeeded: true },
      CONTINUE_ADDED,
    ],
    initial,
  );

  assert.deepEqual(state, initial);
});

test("both context actions unlock the generation step", () => {
  const added = apply([OPEN_GENERATE, CONTINUE_ADDED]);
  const repoOnly = apply([
    OPEN_GENERATE,
    { type: "context_continued", source: "repo_only" },
  ]);

  assert.equal(added.step, 3);
  assert.equal(repoOnly.step, 3);
});

test("bulk and each auditable single output unlock the audit", () => {
  const kinds = [
    "all",
    "resumeBullets",
    "readmeIntro",
    "portfolioBlurb",
    "linkedinDescription",
  ] as const;

  for (const kind of kinds) {
    const state = apply([
      OPEN_GENERATE,
      CONTINUE_ADDED,
      { type: "generation_finished", kind, succeeded: true },
    ]);
    assert.equal(state.step, 4, `${kind} should unlock the audit`);
  }
});

test("interview-only generation does not unlock the evidence audit", () => {
  const state = apply([
    OPEN_GENERATE,
    CONTINUE_ADDED,
    { type: "generation_finished", kind: "interview", succeeded: true },
  ]);

  assert.equal(state.step, 3);
});

test("failed generation and audit attempts leave their steps unchanged", () => {
  const generationFailure = apply([
    OPEN_GENERATE,
    CONTINUE_ADDED,
    { type: "generation_finished", kind: "all", succeeded: false },
  ]);
  assert.equal(generationFailure.step, 3);

  const auditFailure = apply([
    OPEN_GENERATE,
    CONTINUE_ADDED,
    { type: "generation_finished", kind: "all", succeeded: true },
    { type: "audit_finished", succeeded: false },
  ]);
  assert.equal(auditFailure.step, 4);
});

test("History has distinct prompt and opened states", () => {
  const prompted = apply([
    OPEN_GENERATE,
    CONTINUE_ADDED,
    { type: "generation_finished", kind: "all", succeeded: true },
    { type: "audit_finished", succeeded: true },
  ]);
  assert.equal(prompted.step, 5);
  assert.equal(prompted.historyOpened, false);

  const opened = reduceDemoWalkthrough(prompted, { type: "history_opened" });
  assert.equal(opened.historyOpened, true);
});

test("dismiss, resume, finish, and restart preserve the intended session", () => {
  const dismissed = reduceDemoWalkthrough(INITIAL_DEMO_WALKTHROUGH_STATE, {
    type: "dismiss",
  });
  assert.equal(dismissed.display, "dismissed");
  assert.equal(
    reduceDemoWalkthrough(dismissed, { type: "resume" }).display,
    "open",
  );

  const complete = apply([
    OPEN_GENERATE,
    CONTINUE_ADDED,
    { type: "generation_finished", kind: "all", succeeded: true },
    { type: "audit_finished", succeeded: true },
    { type: "history_opened" },
    { type: "finish" },
  ]);
  assert.equal(complete.display, "finished");
  assert.deepEqual(
    reduceDemoWalkthrough(complete, { type: "restart" }),
    INITIAL_DEMO_WALKTHROUGH_STATE,
  );
});
