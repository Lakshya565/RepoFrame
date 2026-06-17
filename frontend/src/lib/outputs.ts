import { type GeneratedOutputs, type OutputSection } from "@/lib/repo-api";

// Shared helpers for working with generated outputs, used by both the writeup
// orchestrator and the outputs card. Keeping the section<->text conversions and
// the tab list here avoids duplicating the per-section logic across components.

// Max length for the model-instruction boxes (per-tab guidance/feedback and the
// Generate-all guidance). Kept in sync with the backend caps so the UI cannot
// submit something the API would reject.
export const INSTRUCTION_MAX_LENGTH = 400;

// An all-empty outputs object so the UI can render every tab (each with its own
// Generate button) before anything has been generated. Sections fill in as they
// are generated individually or via "Generate all".
export const EMPTY_OUTPUTS: GeneratedOutputs = {
  resumeBullets: null,
  readmeIntro: null,
  portfolioBlurb: null,
  linkedinDescription: null,
};

// Reads one section as editable/copyable text. Resume bullets are joined one per
// line so the whole list can live in a single textarea.
export function sectionToText(
  outputs: GeneratedOutputs,
  section: OutputSection,
): string {
  switch (section) {
    case "resumeBullets":
      return (outputs.resumeBullets ?? []).join("\n");
    case "readmeIntro":
      return outputs.readmeIntro ?? "";
    case "portfolioBlurb":
      return outputs.portfolioBlurb ?? "";
    case "linkedinDescription":
      return outputs.linkedinDescription ?? "";
  }
}

// Writes an edited section back into the outputs, splitting resume bullets into a
// list (one non-empty line each). Literal keys keep this type-safe.
export function applyEdit(
  outputs: GeneratedOutputs,
  section: OutputSection,
  text: string,
): GeneratedOutputs {
  switch (section) {
    case "resumeBullets":
      return {
        ...outputs,
        resumeBullets: text
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line !== ""),
      };
    case "readmeIntro":
      return { ...outputs, readmeIntro: text };
    case "portfolioBlurb":
      return { ...outputs, portfolioBlurb: text };
    case "linkedinDescription":
      return { ...outputs, linkedinDescription: text };
  }
}

// Merges a single (re)generated section into the existing outputs, leaving the
// other sections untouched.
export function mergeSection(
  current: GeneratedOutputs,
  section: OutputSection,
  next: GeneratedOutputs,
): GeneratedOutputs {
  switch (section) {
    case "resumeBullets":
      return { ...current, resumeBullets: next.resumeBullets };
    case "readmeIntro":
      return { ...current, readmeIntro: next.readmeIntro };
    case "portfolioBlurb":
      return { ...current, portfolioBlurb: next.portfolioBlurb };
    case "linkedinDescription":
      return { ...current, linkedinDescription: next.linkedinDescription };
  }
}

// True when a section has any generated content. Drives whether the feedback
// "Regenerate" is available (there must be a draft to revise).
export function sectionHasContent(
  outputs: GeneratedOutputs,
  section: OutputSection,
): boolean {
  if (section === "resumeBullets") {
    return (outputs.resumeBullets ?? []).length > 0;
  }
  return sectionToText(outputs, section).trim() !== "";
}
