"use client";

import { useState } from "react";
import { type GeneratedOutputs, type OutputSection } from "@/lib/repo-api";

type GeneratedOutputsCardProps = {
  outputs: GeneratedOutputs;
  onOutputsChange: (next: GeneratedOutputs) => void;
  onRegenerate: (section: OutputSection) => void;
  regeneratingSection: OutputSection | null;
};

const TABS: { section: OutputSection; label: string }[] = [
  { section: "resumeBullets", label: "Resume bullets" },
  { section: "readmeIntro", label: "README intro" },
  { section: "portfolioBlurb", label: "Portfolio blurb" },
  { section: "linkedinDescription", label: "LinkedIn" },
];

// Reads one section as editable/copyable text. Resume bullets are joined one per
// line so the whole list can be edited in a single textarea.
function sectionToText(outputs: GeneratedOutputs, section: OutputSection): string {
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

// Writes an edited section back into the outputs, splitting resume bullets back
// into a list (one non-empty line each). Literal keys keep this type-safe.
function applyEdit(
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

// Displays the generated outputs in tabs, each with copy, inline edit, and a
// scoped regenerate. Edits flow up so the parent keeps a single source of truth;
// copy and regenerate both operate on the current (possibly edited) text.
export function GeneratedOutputsCard({
  outputs,
  onOutputsChange,
  onRegenerate,
  regeneratingSection,
}: GeneratedOutputsCardProps) {
  const [activeSection, setActiveSection] =
    useState<OutputSection>("resumeBullets");
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  // While editing, the textarea is driven by this raw draft string rather than a
  // value derived from the stored outputs. This is what lets resume bullets gain
  // new lines: the stored form filters out empty bullets, so binding the textarea
  // straight to it would erase a freshly typed (still-empty) line on every
  // keystroke. The draft holds exactly what the user types; it is parsed into the
  // stored shape on each change and discarded when editing ends.
  const [draft, setDraft] = useState("");

  const isRegenerating = regeneratingSection === activeSection;
  const copyText = isEditing ? draft : sectionToText(outputs, activeSection);

  // Switches tabs, leaving edit mode so each section opens read-only.
  function selectSection(section: OutputSection) {
    setActiveSection(section);
    setIsEditing(false);
    setCopied(false);
  }

  // Enters edit mode, seeding the draft from the current section text. Leaving
  // edit mode just drops the draft; edits are already pushed up on each change.
  function toggleEditing() {
    if (isEditing) {
      setIsEditing(false);
      return;
    }
    setDraft(sectionToText(outputs, activeSection));
    setIsEditing(true);
  }

  // Updates the local draft and pushes the parsed value up so the parent stays
  // the single source of truth (and copy/regenerate see the latest edits).
  function handleDraftChange(value: string) {
    setDraft(value);
    onOutputsChange(applyEdit(outputs, activeSection, value));
  }

  // Copies the current section text to the clipboard with brief feedback.
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser; ignore so the UI is fine.
    }
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3">
        {TABS.map((tab) => {
          const isActive = tab.section === activeSection;
          return (
            <button
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                isActive
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              key={tab.section}
              onClick={() => selectSection(tab.section)}
              type="button"
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="p-4">
        <div className="flex flex-wrap gap-2">
          <button
            className="min-h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            onClick={handleCopy}
            type="button"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            className="min-h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            onClick={toggleEditing}
            type="button"
          >
            {isEditing ? "Done editing" : "Edit"}
          </button>
          <button
            className="min-h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={regeneratingSection !== null}
            onClick={() => onRegenerate(activeSection)}
            type="button"
          >
            {isRegenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>

        <div className="mt-4">
          {isEditing ? (
            <textarea
              className="min-h-48 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-6 text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              onChange={(event) => handleDraftChange(event.target.value)}
              value={draft}
            />
          ) : (
            <OutputPreview outputs={outputs} section={activeSection} />
          )}
        </div>
      </div>
    </div>
  );
}

type OutputPreviewProps = {
  outputs: GeneratedOutputs;
  section: OutputSection;
};

// Renders a section read-only: resume bullets as a list, everything else as
// preformatted text. Missing sections show a hint to use Regenerate.
function OutputPreview({ outputs, section }: OutputPreviewProps) {
  if (section === "resumeBullets") {
    const bullets = outputs.resumeBullets ?? [];
    if (bullets.length === 0) {
      return <EmptyOutput />;
    }
    return (
      <ul className="list-disc space-y-2 pl-5 text-base leading-7 text-slate-800">
        {bullets.map((bullet, index) => (
          <li key={index}>{bullet}</li>
        ))}
      </ul>
    );
  }

  const value = sectionToText(outputs, section);
  if (value.trim() === "") {
    return <EmptyOutput />;
  }
  return (
    <p className="whitespace-pre-wrap break-words text-base leading-7 text-slate-800">
      {value}
    </p>
  );
}

// Placeholder shown when a section has not been generated yet (e.g. after a
// scoped regenerate of a different section).
function EmptyOutput() {
  return (
    <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
      This section has not been generated yet. Use Regenerate to create it.
    </p>
  );
}
