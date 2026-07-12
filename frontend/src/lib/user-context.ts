// Frontend data shapes for the project context the repository cannot reveal on
// its own (intent, ownership, audience, difficulty, impact, and explicit "do not
// claim" guardrails). Phase 14 reframes this from a blank questionnaire into a
// review step: RepoFrame seeds a first guess at a few fields from free repo
// analysis (see use-inferred-context), and the user corrects or adds the rest.
// These answers ground every generated output and feed the verification agent.

// Whether the project was built alone or as part of a team. Kept as a small
// closed set so the UI can render it as a choice instead of free text.
export type CollaborationMode = "solo" | "team";

// The full set of user-provided context answers. Every field is a string so the
// form can stay fully controlled; an empty string means "not answered yet".
//   - purpose / technicalFocus are the "RepoFrame's guess" fields, prefilled
//     from free repo analysis (GitHub description + detected stack) and editable.
//   - targetUser / collaboration / contribution / hardestPart / impact /
//     guardrails are the user-only context the repo cannot prove (audience has no
//     reliable free signal, so it lives here rather than as a guess).
export type UserContext = {
  purpose: string;
  targetUser: string;
  technicalFocus: string;
  collaboration: CollaborationMode | "";
  contribution: string;
  hardestPart: string;
  impact: string;
  guardrails: string;
};

// Keys of the free-text fields, used to drive both rendering and state updates
// without repeating the field list in the component.
export type UserContextTextKey = Exclude<keyof UserContext, "collaboration">;

// Describes one free-text question: its label, the helper text shown beneath it,
// the input placeholder, whether it needs a multiline textarea, and whether it
// is optional. Driving the form from this list keeps the component declarative.
export type UserContextTextField = {
  key: UserContextTextKey;
  label: string;
  helper: string;
  placeholder: string;
  multiline: boolean;
  optional?: boolean;
};

// The collaboration choice options, each with a short helper for context.
export type CollaborationOption = {
  value: CollaborationMode;
  label: string;
  helper: string;
};

// A blank questionnaire, used as the initial form state and when resetting.
export const EMPTY_USER_CONTEXT: UserContext = {
  purpose: "",
  targetUser: "",
  technicalFocus: "",
  collaboration: "",
  contribution: "",
  hardestPart: "",
  impact: "",
  guardrails: "",
};

// "RepoFrame's guess" fields: an inferred first pass the user reviews and edits.
// Both are seeded from free repo analysis — purpose from the GitHub "About"
// description, technicalFocus from the detected stack. When a repo lacks that
// signal the field stays blank (evidence, not invention); the placeholder then
// reads as an "add this yourself" prompt. targetUser is intentionally NOT here —
// audience has no reliable free signal, so it moved to "Your context" below.
export const INFERRED_GUESS_FIELDS: UserContextTextField[] = [
  {
    key: "purpose",
    label: "Project purpose",
    helper: "What RepoFrame thinks this project does.",
    placeholder:
      "A tool that turns GitHub repos into evidence-backed project writeups…",
    multiline: true,
  },
  {
    key: "technicalFocus",
    label: "Technical focus",
    helper: "The main technical areas RepoFrame should emphasize.",
    placeholder:
      "GitHub API integration, file ranking, evidence-backed generation…",
    multiline: true,
  },
];

// "Your context" fields: the things the repository genuinely cannot prove, so
// RepoFrame should not guess them. Target user leads (the repo rarely states its
// audience); contribution and the hardest problem carry the most weight; impact
// and guardrails are optional. Guardrails are sent through to generation and
// claim verification as explicit "do not claim" constraints.
export const YOUR_CONTEXT_FIELDS: UserContextTextField[] = [
  {
    key: "targetUser",
    label: "Target users",
    helper: "Who this project is really for, so RepoFrame can write for that audience.",
    placeholder: "Students and developers writing up side projects…",
    multiline: false,
  },
  {
    key: "contribution",
    label: "What did you personally build?",
    helper:
      "Focus on your actual contribution, especially if this was a team project.",
    placeholder:
      "I built the FastAPI backend, GitHub repo ingestion flow, and file-ranking pipeline…",
    multiline: true,
  },
  {
    key: "hardestPart",
    label: "What was the hardest technical problem?",
    helper:
      "This helps RepoFrame generate stronger technical bullets and interview points.",
    placeholder: "Ranking the most relevant files without fetching the whole repo…",
    multiline: true,
  },
  {
    key: "impact",
    label: "Any result or impact?",
    helper:
      "Use real numbers if you have them. If not, describe the outcome without inventing metrics.",
    placeholder: "Cut writeup time from an hour to a few minutes…",
    multiline: true,
    optional: true,
  },
  {
    key: "guardrails",
    label: "Anything RepoFrame should avoid claiming?",
    helper: "Use this to prevent inflated or inaccurate writeups.",
    placeholder: "Do not say this has real users yet. Do not claim I built the entire frontend.",
    multiline: true,
    optional: true,
  },
];

// The collaboration choices. Kept separate from the text fields because it is
// rendered as a segmented choice rather than an input.
export const COLLABORATION_OPTIONS: CollaborationOption[] = [
  { value: "solo", label: "Solo", helper: "I built this on my own" },
  { value: "team", label: "Team", helper: "I built this with others" },
];

// Returns true when the user has provided at least one answer. Used to seed a
// sensible landing step for returning users whose context survived tab navigation.
export function hasAnyUserContext(context: UserContext): boolean {
  return Object.values(context).some((value) => value.trim() !== "");
}

// Returns true when the user has filled in any of THEIR OWN context — the "Your
// context" fields the repo can't prove. Deliberately EXCLUDES the "RepoFrame's
// guess" fields (purpose, technicalFocus), which are auto-seeded from free repo
// analysis and so would otherwise read as "the user has context" the moment
// seeding lands. This is what the Generate flow uses to decide whether to open on
// Context (nothing user-supplied yet) or jump to Generate (user has added context).
export function hasUserFilledContext(context: UserContext): boolean {
  return (
    context.targetUser.trim() !== "" ||
    context.collaboration !== "" ||
    context.contribution.trim() !== "" ||
    context.hardestPart.trim() !== "" ||
    context.impact.trim() !== "" ||
    context.guardrails.trim() !== ""
  );
}

// Returns true when two questionnaire snapshots hold identical answers. Used to
// decide whether a cached project profile is still valid or must be regenerated
// because the user changed their context (which grounds every generated output).
export function userContextEquals(a: UserContext, b: UserContext): boolean {
  return (
    a.purpose === b.purpose &&
    a.targetUser === b.targetUser &&
    a.technicalFocus === b.technicalFocus &&
    a.collaboration === b.collaboration &&
    a.contribution === b.contribution &&
    a.hardestPart === b.hardestPart &&
    a.impact === b.impact &&
    a.guardrails === b.guardrails
  );
}
