// Frontend-only data shapes for the Phase 9 user context questionnaire. These
// answers capture project facts that cannot be inferred from the repository
// alone (intent, ownership, audience, difficulty, impact). They live in
// component state for now; persistence and LLM use arrive in later phases.

// Whether the project was built alone or as part of a team. Kept as a small
// closed set so the UI can render it as a choice instead of free text.
export type CollaborationMode = "solo" | "team";

// The full set of user-provided context answers. Every field is a string so the
// form can stay fully controlled; an empty string means "not answered yet".
export type UserContext = {
  purpose: string;
  collaboration: CollaborationMode | "";
  contribution: string;
  targetUser: string;
  hardestPart: string;
  impact: string;
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
  collaboration: "",
  contribution: "",
  targetUser: "",
  hardestPart: "",
  impact: "",
};

// The free-text questions in the order they should appear. Wording stays in
// product language and frames each answer as something the repo cannot reveal.
export const USER_CONTEXT_TEXT_FIELDS: UserContextTextField[] = [
  {
    key: "purpose",
    label: "Project purpose",
    helper: "What does this project do, and why did you build it?",
    placeholder: "A tool that turns GitHub repos into evidence-backed writeups…",
    multiline: true,
  },
  {
    key: "contribution",
    label: "Your contribution",
    helper: "What did you personally design, build, or own?",
    placeholder: "I built the FastAPI backend and the file-ranking pipeline…",
    multiline: true,
  },
  {
    key: "targetUser",
    label: "Target user or client",
    helper: "Who is this for? A real client, a user group, or yourself.",
    placeholder: "Developers writing up side projects for resumes",
    multiline: false,
  },
  {
    key: "hardestPart",
    label: "Hardest technical part",
    helper: "The problem that took the most thought or effort to solve.",
    placeholder: "Ranking the most relevant files without fetching the whole repo…",
    multiline: true,
  },
  {
    key: "impact",
    label: "Impact or results",
    helper: "Any measurable outcome, if you have one.",
    placeholder: "Cut writeup time from an hour to a few minutes",
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

// Returns true when the user has provided at least one answer. The saved summary
// uses this to show an empty-state hint instead of a list of blanks.
export function hasAnyUserContext(context: UserContext): boolean {
  return Object.values(context).some((value) => value.trim() !== "");
}

// Maps a collaboration value to its display label, falling back to a clear
// "Not provided" string so the summary never renders a raw enum value.
export function getCollaborationLabel(value: CollaborationMode | ""): string {
  const option = COLLABORATION_OPTIONS.find((item) => item.value === value);
  return option ? option.label : "Not provided";
}
