"use client";

import { useState } from "react";
import {
  INSTRUCTION_MAX_LENGTH,
  applyEdit,
  sectionHasContent,
  sectionToText,
} from "@/lib/outputs";
import {
  type GeneratedOutputs,
  type InterviewTopic,
  type OutputSection,
} from "@/lib/repo-api";

// A tab is one of the four output sections or the interview-prep tab.
type CardTab = OutputSection | "interview";

const CARD_TABS: { tab: CardTab; label: string }[] = [
  { tab: "resumeBullets", label: "Resume bullets" },
  { tab: "readmeIntro", label: "README intro" },
  { tab: "portfolioBlurb", label: "Portfolio blurb" },
  { tab: "linkedinDescription", label: "LinkedIn" },
  { tab: "interview", label: "Interview prep" },
];

type GeneratedOutputsCardProps = {
  outputs: GeneratedOutputs;
  interviewTopics: InterviewTopic[] | null;
  baselines: Partial<Record<OutputSection, string>>;
  // True while any generation runs anywhere — disables every trigger so calls
  // cannot stack up.
  busy: boolean;
  generatingSection: OutputSection | null;
  revisingSection: OutputSection | null;
  generatingInterview: boolean;
  onOutputsChange: (next: GeneratedOutputs) => void;
  // Generate one section from the profile, with optional preemptive guidance.
  onGenerateSection: (
    section: OutputSection,
    guidance: string,
  ) => Promise<void> | void;
  // Revise one section using the current draft plus the instruction as feedback.
  onReviseSection: (section: OutputSection, instruction: string) => Promise<boolean>;
  // Generate interview prep, with optional preemptive guidance.
  onGenerateInterview: (guidance: string) => Promise<void> | void;
};

// Formats interview topics into copyable plain text.
function interviewToText(topics: InterviewTopic[]): string {
  return topics
    .map((topic) => {
      const points = topic.talkingPoints.map((point) => `- ${point}`).join("\n");
      return `${topic.question}\n${points}`;
    })
    .join("\n\n");
}

// The tabbed outputs panel. Each output tab supports per-tab generate, inline
// edit, copy, and feedback-driven regenerate; the interview tab has its own
// generate and copy. A single instruction box per tab feeds both generate (as
// guidance) and regenerate (as feedback), so one field covers "one-shot it with
// specs" and "fix what came back". Everything is disabled while a call runs.
export function GeneratedOutputsCard({
  outputs,
  interviewTopics,
  baselines,
  busy,
  generatingSection,
  revisingSection,
  generatingInterview,
  onOutputsChange,
  onGenerateSection,
  onReviseSection,
  onGenerateInterview,
}: GeneratedOutputsCardProps) {
  const [activeTab, setActiveTab] = useState<CardTab>("resumeBullets");
  const [isEditing, setIsEditing] = useState(false);
  // While editing, the textarea is driven by this raw draft so resume bullets can
  // gain new lines (the stored form filters empty bullets).
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  // One instruction box per tab, preserved across tab switches.
  const [instructions, setInstructions] = useState<Record<CardTab, string>>({
    resumeBullets: "",
    readmeIntro: "",
    portfolioBlurb: "",
    linkedinDescription: "",
    interview: "",
  });

  const instruction = instructions[activeTab];

  function setInstruction(value: string) {
    setInstructions((current) => ({ ...current, [activeTab]: value }));
  }

  // Switches tabs, leaving edit mode so each tab opens read-only.
  function selectTab(tab: CardTab) {
    setActiveTab(tab);
    setIsEditing(false);
    setCopied(false);
  }

  // Enters/leaves edit mode for an output tab, seeding the draft on entry.
  function toggleEditing() {
    if (activeTab === "interview") {
      return;
    }
    if (isEditing) {
      setIsEditing(false);
      return;
    }
    setDraft(sectionToText(outputs, activeTab));
    setIsEditing(true);
  }

  // Pushes an edit up so the parent stays the single source of truth.
  function handleDraftChange(value: string) {
    if (activeTab === "interview") {
      return;
    }
    setDraft(value);
    onOutputsChange(applyEdit(outputs, activeTab, value));
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser; ignore so the UI is fine.
    }
  }

  // Generates a section on its own (instruction acts as preemptive guidance).
  async function handleGenerateSection(section: OutputSection) {
    await onGenerateSection(section, instruction.trim());
    setIsEditing(false);
  }

  // Regenerates a section with feedback (current draft + instruction).
  async function handleRevise(section: OutputSection) {
    const ok = await onReviseSection(section, instruction.trim());
    if (ok) {
      setIsEditing(false);
    }
  }

  // The shared instruction box, rendered on every tab with a tab-appropriate hint.
  function renderInstructionBox(helper: string) {
    return (
      <div className="mt-5 border-t border-slate-200 pt-4">
        <label
          className="text-sm font-medium text-slate-900"
          htmlFor={`instructions-${activeTab}`}
        >
          Instructions for the model (optional)
        </label>
        <p className="mt-1 text-sm text-slate-500">{helper}</p>
        <textarea
          className="mt-2 min-h-16 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50"
          disabled={busy}
          id={`instructions-${activeTab}`}
          maxLength={INSTRUCTION_MAX_LENGTH}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="e.g. keep it concise, lead with measurable impact"
          value={instruction}
        />
        <div className="mt-1 text-right text-xs text-slate-400">
          {instruction.length}/{INSTRUCTION_MAX_LENGTH}
        </div>
      </div>
    );
  }

  function renderOutputPanel(section: OutputSection) {
    const sectionText = sectionToText(outputs, section);
    const hasContent = sectionHasContent(outputs, section);
    const baseline = baselines[section];
    const isEdited = baseline !== undefined && sectionText !== baseline;
    const canRevise =
      hasContent && !busy && (isEdited || instruction.trim() !== "");
    const isGeneratingThis = generatingSection === section;
    const isRevisingThis = revisingSection === section;
    const currentCopyText = isEditing ? draft : sectionText;

    return (
      <>
        <div className="flex flex-wrap gap-2">
          <button
            className="min-h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={() => handleGenerateSection(section)}
            type="button"
          >
            {isGeneratingThis
              ? "Generating…"
              : hasContent
                ? "Generate again"
                : "Generate"}
          </button>
          <button
            className="min-h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!hasContent}
            onClick={() => handleCopy(currentCopyText)}
            type="button"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            className="min-h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy || !hasContent}
            onClick={toggleEditing}
            type="button"
          >
            {isEditing ? "Done editing" : "Edit"}
          </button>
        </div>

        {hasContent ? (
          <p className="mt-2 text-xs text-slate-500">
            <strong className="font-semibold">Generate again</strong> rewrites
            this tab from the profile and ignores your edits. To keep your edits,
            use <strong className="font-semibold">Regenerate</strong> below.
          </p>
        ) : null}

        <div className="mt-4">
          {isEditing ? (
            <textarea
              className="min-h-48 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-6 text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              onChange={(event) => handleDraftChange(event.target.value)}
              value={draft}
            />
          ) : (
            <OutputPreview outputs={outputs} section={section} />
          )}
        </div>

        {renderInstructionBox(
          "Added to the prompt when you Generate, and used as feedback when you Regenerate.",
        )}

        <div className="mt-2">
          <button
            className="min-h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canRevise}
            onClick={() => handleRevise(section)}
            type="button"
          >
            {isRevisingThis ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </>
    );
  }

  function renderInterviewPanel() {
    const hasTopics = interviewTopics !== null;
    const topics = interviewTopics ?? [];

    return (
      <>
        <div className="flex flex-wrap gap-2">
          <button
            className="min-h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={() => onGenerateInterview(instruction.trim())}
            type="button"
          >
            {generatingInterview
              ? "Generating…"
              : hasTopics
                ? "Generate again"
                : "Generate"}
          </button>
          <button
            className="min-h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={topics.length === 0}
            onClick={() => handleCopy(interviewToText(topics))}
            type="button"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="mt-4">
          {hasTopics ? (
            topics.length > 0 ? (
              <div className="space-y-4">
                {topics.map((topic, index) => (
                  <div
                    className="rounded-md border border-slate-200 bg-slate-50 p-4"
                    key={index}
                  >
                    <p className="text-base font-semibold text-slate-950">
                      {topic.question}
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
                      {topic.talkingPoints.map((point, pointIndex) => (
                        <li key={pointIndex}>{point}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No interview topics were returned.
              </p>
            )
          ) : (
            <EmptyOutput />
          )}
        </div>

        {renderInstructionBox(
          "Added to the prompt when you generate interview prep.",
        )}
      </>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3">
        {CARD_TABS.map((item) => {
          const isActive = item.tab === activeTab;
          return (
            <button
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                isActive
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              key={item.tab}
              onClick={() => selectTab(item.tab)}
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="p-4">
        {activeTab === "interview"
          ? renderInterviewPanel()
          : renderOutputPanel(activeTab)}
      </div>
    </div>
  );
}

type OutputPreviewProps = {
  outputs: GeneratedOutputs;
  section: OutputSection;
};

// Renders an output section read-only: resume bullets as a list, others as
// preformatted text. Ungenerated sections show a hint.
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

// Placeholder shown when a tab has not been generated yet.
function EmptyOutput() {
  return (
    <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
      Nothing generated yet. Use Generate to create it.
    </p>
  );
}
