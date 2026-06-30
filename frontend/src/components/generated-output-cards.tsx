"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy, Loader2 } from "lucide-react";

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
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// The four core outputs, in display order, each with a heading and a one-line
// description. Driving the stack from this list keeps the cards consistent and
// the order in one place.
const OUTPUT_CARDS: { section: OutputSection; title: string; helper: string }[] =
  [
    {
      section: "resumeBullets",
      title: "Resume bullets",
      helper: "Impact-first bullet points for your resume.",
    },
    {
      section: "readmeIntro",
      title: "README intro",
      helper: "An opening section that explains what the project is.",
    },
    {
      section: "portfolioBlurb",
      title: "Portfolio blurb",
      helper: "A short, polished summary for a portfolio site.",
    },
    {
      section: "linkedinDescription",
      title: "LinkedIn description",
      helper: "A first-person write-up for a LinkedIn project entry.",
    },
  ];

type GeneratedOutputCardsProps = {
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

// Every output as its own collapsible card, stacked vertically. Each card can be
// generated independently of the others (and of "Generate everything"): an empty
// card is greyed and not expandable, showing only its own Generate button. Once
// it has content it auto-expands and the user can open/close it at will. Each card
// owns its local edit/copy/instruction/open state; the generated text itself
// stays in the shared GenerationProvider (read through `outputs`), so this
// component is purely presentational over the existing handlers.
export function GeneratedOutputCards({
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
}: GeneratedOutputCardsProps) {
  return (
    <div className="space-y-4">
      {OUTPUT_CARDS.map((card) => (
        <OutputAccordionCard
          baseline={baselines[card.section]}
          busy={busy}
          generatingSection={generatingSection}
          helper={card.helper}
          key={card.section}
          onGenerateSection={onGenerateSection}
          onOutputsChange={onOutputsChange}
          onReviseSection={onReviseSection}
          outputs={outputs}
          revisingSection={revisingSection}
          section={card.section}
          title={card.title}
        />
      ))}

      <InterviewAccordionCard
        busy={busy}
        generatingInterview={generatingInterview}
        interviewTopics={interviewTopics}
        onGenerateInterview={onGenerateInterview}
      />
    </div>
  );
}

type AccordionShellProps = {
  title: string;
  helper: string;
  // Whether the card has generated content. An empty card is greyed and cannot be
  // expanded — only its Generate button (in `headerAction`) works.
  hasContent: boolean;
  open: boolean;
  onToggle: () => void;
  // The Generate / Generate again button, rendered in the header on every card.
  headerAction: React.ReactNode;
  children: React.ReactNode;
};

// Shared chrome for an output card: a header (chevron toggle + title + the
// Generate action) over a collapsible body. The body height animates via the
// grid-rows trick (0fr → 1fr) so it needs no measured height. While the card is
// empty the chevron is gone and the surface is muted, communicating "nothing to
// open yet" without disabling the Generate button.
function AccordionShell({
  title,
  helper,
  hasContent,
  open,
  onToggle,
  headerAction,
  children,
}: AccordionShellProps) {
  return (
    <Card className={cn("overflow-hidden p-0", !hasContent && "bg-muted/20")}>
      <div className="flex items-center justify-between gap-4 p-5">
        {hasContent ? (
          <button
            aria-expanded={open}
            className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
            onClick={onToggle}
            type="button"
          >
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                open && "rotate-180",
              )}
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-base font-semibold">{title}</span>
              <span className="truncate text-sm text-muted-foreground">
                {helper}
              </span>
            </span>
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-base font-semibold text-muted-foreground">
              {title}
            </span>
            <span className="truncate text-sm text-muted-foreground">
              {helper}
            </span>
          </div>
        )}

        <div className="shrink-0">{headerAction}</div>
      </div>

      {/* grid-rows 0fr→1fr collapse: the inner wrapper must clip overflow. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t px-5 pb-5 pt-4">{children}</div>
        </div>
      </div>
    </Card>
  );
}

type OutputAccordionCardProps = {
  section: OutputSection;
  title: string;
  helper: string;
  outputs: GeneratedOutputs;
  baseline: string | undefined;
  busy: boolean;
  generatingSection: OutputSection | null;
  revisingSection: OutputSection | null;
  onOutputsChange: (next: GeneratedOutputs) => void;
  onGenerateSection: (
    section: OutputSection,
    guidance: string,
  ) => Promise<void> | void;
  onReviseSection: (
    section: OutputSection,
    instruction: string,
  ) => Promise<boolean>;
};

// One output's collapsible card: generate / copy / edit / regenerate plus a single
// instruction box that feeds both generate (as guidance) and regenerate (as
// feedback). Everything is disabled while any generation runs.
function OutputAccordionCard({
  section,
  title,
  helper,
  outputs,
  baseline,
  busy,
  generatingSection,
  revisingSection,
  onOutputsChange,
  onGenerateSection,
  onReviseSection,
}: OutputAccordionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  // While editing, the textarea is driven by this raw draft so resume bullets can
  // gain new lines (the stored form filters empty bullets).
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [instruction, setInstruction] = useState("");

  const sectionText = sectionToText(outputs, section);
  const hasContent = sectionHasContent(outputs, section);

  // Open by default once the card has content; toggling overrides. A null
  // override means "follow content", so the card auto-expands the first time
  // content lands (its own Generate or "Generate everything"); once the user
  // toggles it, their choice sticks and is never fought. Derived rather than an
  // effect so there's no cascading render on content changes.
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? hasContent;

  const isEdited = baseline !== undefined && sectionText !== baseline;
  const canRevise = hasContent && !busy && (isEdited || instruction.trim() !== "");
  const isGeneratingThis = generatingSection === section;
  const isRevisingThis = revisingSection === section;
  const currentCopyText = isEditing ? draft : sectionText;

  // Enters/leaves edit mode, seeding the draft from the current text on entry.
  function toggleEditing() {
    if (isEditing) {
      setIsEditing(false);
      return;
    }
    setDraft(sectionText);
    setIsEditing(true);
  }

  // Pushes an edit up so the parent stays the single source of truth.
  function handleDraftChange(value: string) {
    setDraft(value);
    onOutputsChange(applyEdit(outputs, section, value));
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(currentCopyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser; ignore so the UI is fine.
    }
  }

  // Generates this section on its own (instruction acts as preemptive guidance).
  async function handleGenerate() {
    await onGenerateSection(section, instruction.trim());
    setIsEditing(false);
  }

  // Regenerates with feedback (current draft + instruction).
  async function handleRevise() {
    const ok = await onReviseSection(section, instruction.trim());
    if (ok) {
      setIsEditing(false);
    }
  }

  return (
    <AccordionShell
      hasContent={hasContent}
      headerAction={
        <Button disabled={busy} onClick={handleGenerate}>
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
      }
      helper={helper}
      onToggle={() => setOpenOverride(!open)}
      open={open}
      title={title}
    >
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasContent}
          onClick={handleCopy}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !hasContent}
          onClick={toggleEditing}
        >
          {isEditing ? "Done editing" : "Edit"}
        </Button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        <strong className="font-semibold">Generate again</strong> rewrites this
        card from the profile and ignores your edits. To keep your edits, use{" "}
        <strong className="font-semibold">Regenerate</strong> below.
      </p>

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

      <InstructionBox
        busy={busy}
        helper="Added to the prompt when you Generate, and used as feedback when you Regenerate."
        id={`instructions-${section}`}
        onChange={setInstruction}
        value={instruction}
      />

      <div className="mt-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!canRevise}
          onClick={handleRevise}
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
    </AccordionShell>
  );
}

type InterviewAccordionCardProps = {
  interviewTopics: InterviewTopic[] | null;
  busy: boolean;
  generatingInterview: boolean;
  onGenerateInterview: (guidance: string) => Promise<void> | void;
};

// Interview prep as its own collapsible card. No inline edit (the content is a
// structured list, not free text) — just generate, copy, and an instruction box.
function InterviewAccordionCard({
  interviewTopics,
  busy,
  generatingInterview,
  onGenerateInterview,
}: InterviewAccordionCardProps) {
  const [copied, setCopied] = useState(false);
  const [instruction, setInstruction] = useState("");

  const hasTopics = interviewTopics !== null;
  const topics = interviewTopics ?? [];

  // Open by default once generated; toggling overrides (see the output card).
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? hasTopics;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(interviewToText(topics));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser; ignore so the UI is fine.
    }
  }

  return (
    <AccordionShell
      hasContent={hasTopics}
      headerAction={
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
      }
      helper="Likely questions about this project with talking points to rehearse."
      onToggle={() => setOpenOverride(!open)}
      open={open}
      title="Interview prep"
    >
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={topics.length === 0}
          onClick={handleCopy}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <div className="mt-4">
        {topics.length > 0 ? (
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
        )}
      </div>

      <InstructionBox
        busy={busy}
        helper="Added to the prompt when you generate interview prep."
        id="instructions-interview"
        onChange={setInstruction}
        value={instruction}
      />
    </AccordionShell>
  );
}

type InstructionBoxProps = {
  id: string;
  helper: string;
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
};

// The per-card model-instruction box. Shared between the output cards and the
// interview card so the label, counter, and cap stay identical everywhere.
function InstructionBox({
  id,
  helper,
  value,
  busy,
  onChange,
}: InstructionBoxProps) {
  return (
    <div className="mt-5 border-t pt-4">
      <label className="text-sm font-medium" htmlFor={id}>
        Instructions for the model (optional)
      </label>
      <p className="mt-1 text-sm text-muted-foreground">{helper}</p>
      <Textarea
        className="mt-2 resize-y"
        disabled={busy}
        id={id}
        maxLength={INSTRUCTION_MAX_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        placeholder="e.g. keep it concise, lead with measurable impact"
        value={value}
      />
      <div className="mt-1 text-right text-xs text-muted-foreground">
        {value.length}/{INSTRUCTION_MAX_LENGTH}
      </div>
    </div>
  );
}

// Formats interview topics into copyable plain text.
function interviewToText(topics: InterviewTopic[]): string {
  return topics
    .map((topic) => {
      const points = topic.talkingPoints.map((point) => `- ${point}`).join("\n");
      return `${topic.question}\n${points}`;
    })
    .join("\n\n");
}

type OutputPreviewProps = {
  outputs: GeneratedOutputs;
  section: OutputSection;
};

// Renders an output section read-only: resume bullets as a list, others as
// preformatted text.
function OutputPreview({ outputs, section }: OutputPreviewProps) {
  if (section === "resumeBullets") {
    const bullets = outputs.resumeBullets ?? [];
    return (
      <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-foreground">
        {bullets.map((bullet, index) => (
          <li key={index}>{bullet}</li>
        ))}
      </ul>
    );
  }

  const value = sectionToText(outputs, section);
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
      {value}
    </p>
  );
}
