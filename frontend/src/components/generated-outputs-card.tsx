"use client";

import { useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
  onReviseSection: (
    section: OutputSection,
    instruction: string,
  ) => Promise<boolean>;
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

  // A reusable Copy button that swaps to a confirming "Copied" state with a check
  // icon for a moment after a successful copy.
  function copyButton(text: string, disabled: boolean) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => handleCopy(text)}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
    );
  }

  // The shared instruction box, rendered on every tab with a tab-appropriate hint.
  function renderInstructionBox(helper: string) {
    return (
      <div className="mt-5 border-t pt-4">
        <label
          className="text-sm font-medium"
          htmlFor={`instructions-${activeTab}`}
        >
          Instructions for the model (optional)
        </label>
        <p className="mt-1 text-sm text-muted-foreground">{helper}</p>
        <Textarea
          className="mt-2 resize-y"
          disabled={busy}
          id={`instructions-${activeTab}`}
          maxLength={INSTRUCTION_MAX_LENGTH}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="e.g. keep it concise, lead with measurable impact"
          value={instruction}
        />
        <div className="mt-1 text-right text-xs text-muted-foreground">
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
          <Button
            disabled={busy}
            onClick={() => handleGenerateSection(section)}
          >
            {isGeneratingThis ? (
              <>
                <Loader2 className="animate-spin" />
                Generating…
              </>
            ) : hasContent ? (
              "Generate again"
            ) : (
              "Generate"
            )}
          </Button>
          {copyButton(currentCopyText, !hasContent)}
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !hasContent}
            onClick={toggleEditing}
          >
            {isEditing ? "Done editing" : "Edit"}
          </Button>
        </div>

        {hasContent ? (
          <p className="mt-2 text-xs text-muted-foreground">
            <strong className="font-semibold">Generate again</strong> rewrites
            this tab from the profile and ignores your edits. To keep your edits,
            use <strong className="font-semibold">Regenerate</strong> below.
          </p>
        ) : null}

        <div className="mt-4">
          {isEditing ? (
            <Textarea
              className="min-h-48 resize-y font-mono"
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
          <Button
            variant="outline"
            size="sm"
            disabled={!canRevise}
            onClick={() => handleRevise(section)}
          >
            {isRevisingThis ? (
              <>
                <Loader2 className="animate-spin" />
                Regenerating…
              </>
            ) : (
              "Regenerate"
            )}
          </Button>
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
          <Button
            disabled={busy}
            onClick={() => onGenerateInterview(instruction.trim())}
          >
            {generatingInterview ? (
              <>
                <Loader2 className="animate-spin" />
                Generating…
              </>
            ) : hasTopics ? (
              "Generate again"
            ) : (
              "Generate"
            )}
          </Button>
          {copyButton(interviewToText(topics), topics.length === 0)}
        </div>

        <div className="mt-4">
          {hasTopics ? (
            topics.length > 0 ? (
              <div className="space-y-3">
                {topics.map((topic, index) => (
                  <div className="rounded-md border bg-muted/40 p-4" key={index}>
                    <p className="text-sm font-semibold text-foreground">
                      {topic.question}
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
                      {topic.talkingPoints.map((point, pointIndex) => (
                        <li key={pointIndex}>{point}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
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
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap gap-1 border-b p-2">
        {CARD_TABS.map((item) => {
          const isActive = item.tab === activeTab;
          return (
            <button
              className={cn(
                "cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              key={item.tab}
              onClick={() => selectTab(item.tab)}
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Keyed by the active tab so switching tabs re-runs the fade-in, giving a
          light crossfade between panels (static under reduced motion). */}
      <div
        key={activeTab}
        className="p-4 duration-200 animate-in fade-in-0 motion-reduce:animate-none"
      >
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
      <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-foreground">
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
    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
      {value}
    </p>
  );
}

// Placeholder shown when a tab has not been generated yet.
function EmptyOutput() {
  return (
    <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      Nothing generated yet. Use Generate to create it.
    </p>
  );
}
