"use client";

import { useState } from "react";
import {
  BookOpen,
  Briefcase,
  Check,
  ChevronUp,
  Contact,
  Copy,
  FileText,
  Loader2,
  MessagesSquare,
  Pencil,
  Plus,
  Redo2,
  Undo2,
  type LucideIcon,
} from "lucide-react";

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
import { useDemo } from "@/lib/demo-mode";
import { useCompletionFlash } from "@/lib/use-completion-flash";
import {
  type InterviewRevert,
  type SectionRevertMap,
} from "@/lib/generation-context";
import { GateOverlay } from "@/components/gate-overlay";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// The four core outputs, in display order, each with a heading, a one-line
// description, and the icon that anchors its rail entry and panel header. Driving
// the workspace from this list keeps the rail, the panels, and the order in one
// place.
const OUTPUT_CARDS: {
  section: OutputSection;
  title: string;
  helper: string;
  icon: LucideIcon;
}[] = [
  {
    section: "resumeBullets",
    title: "Resume bullets",
    helper: "Impact-first bullet points for your resume.",
    icon: FileText,
  },
  {
    section: "readmeIntro",
    title: "README intro",
    helper: "An opening section that explains what the project is.",
    icon: BookOpen,
  },
  {
    section: "portfolioBlurb",
    title: "Portfolio blurb",
    helper: "A short, polished summary for a portfolio site.",
    icon: Briefcase,
  },
  {
    section: "linkedinDescription",
    title: "LinkedIn description",
    helper: "A first-person write-up for a LinkedIn project entry.",
    icon: Contact,
  },
];

// Interview prep shares the master–detail workspace but is not an OutputSection
// (it has no inline edit and its own generate/revise handlers), so it carries its
// own panel key. The union keys the rail selection and the hidden-panel switch.
const INTERVIEW_KEY = "interview" as const;
type PanelKey = OutputSection | typeof INTERVIEW_KEY;

// Each output's readiness, surfaced in the rail and panel header so the whole set
// is scannable at a glance: nothing generated yet, generated, or generated then
// edited away from the last generation.
type PanelStatus = "empty" | "ready" | "edited";

const STATUS_LABEL: Record<PanelStatus, string> = {
  empty: "Not generated",
  ready: "Ready",
  edited: "Edited",
};

// Classifies one output section: empty until it has content, then "edited" while
// the current text differs from the last generation's baseline, else "ready".
function statusForOutput(
  outputs: GeneratedOutputs,
  section: OutputSection,
  baseline: string | undefined,
): PanelStatus {
  if (!sectionHasContent(outputs, section)) {
    return "empty";
  }
  if (baseline !== undefined && sectionToText(outputs, section) !== baseline) {
    return "edited";
  }
  return "ready";
}

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
  // Revise the existing interview prep using the instruction as feedback (the
  // interview card's Regenerate, backed by the interview-prep/revise endpoint).
  onReviseInterview: (instruction: string) => Promise<void> | void;
  // Revert/redo swap cache + togglers (one level of undo/redo per card, populated
  // by a regenerate). A card's entry is undefined until it has been regenerated.
  sectionRevert: SectionRevertMap;
  onRevertSection: (section: OutputSection) => void;
  interviewRevert: InterviewRevert;
  onRevertInterview: () => void;
};

// The generated outputs as a master–detail workspace: a left rail lists every
// output with its live status, and the selected one fills the detail panel on the
// right. This replaced a tall accordion stack that read as one monotonous column
// and buried each card's state behind a faint chevron. Every panel stays mounted
// (inactive ones are just hidden), so each keeps its own edit draft, copy, and
// instruction state when the user switches away and back. The generated text
// itself lives in the shared GenerationProvider (read through `outputs`); this
// component is presentational over the existing handlers.
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
  onReviseInterview,
  sectionRevert,
  onRevertSection,
  interviewRevert,
  onRevertInterview,
}: GeneratedOutputCardsProps) {
  // Land on the first output that already has content (so a returning user whose
  // work survived tab navigation sees it immediately), else interview prep, else
  // the first output.
  const [active, setActive] = useState<PanelKey>(() => {
    const firstWithContent = OUTPUT_CARDS.find((card) =>
      sectionHasContent(outputs, card.section),
    );
    if (firstWithContent) {
      return firstWithContent.section;
    }
    return interviewTopics !== null ? INTERVIEW_KEY : OUTPUT_CARDS[0].section;
  });

  // Status per rail item, computed once here so the rail and each panel header
  // agree on the same source of truth.
  const statuses: Record<PanelKey, PanelStatus> = {
    resumeBullets: statusForOutput(outputs, "resumeBullets", baselines.resumeBullets),
    readmeIntro: statusForOutput(outputs, "readmeIntro", baselines.readmeIntro),
    portfolioBlurb: statusForOutput(
      outputs,
      "portfolioBlurb",
      baselines.portfolioBlurb,
    ),
    linkedinDescription: statusForOutput(
      outputs,
      "linkedinDescription",
      baselines.linkedinDescription,
    ),
    [INTERVIEW_KEY]: interviewTopics !== null ? "ready" : "empty",
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <OutputRail active={active} onSelect={setActive} statuses={statuses} />

      {/* Detail column. Every panel is rendered so its local state survives a rail
          switch; only the active one is shown. Each wrapper is h-full so a short
          panel (e.g. one not generated yet) still stretches to the row height set
          by the rail, instead of sitting shorter than the sidebar beside it. */}
      <div className="min-w-0">
        {OUTPUT_CARDS.map((card) => (
          <div
            className={cn("h-full", active !== card.section && "hidden")}
            key={card.section}
          >
            <OutputPanel
              busy={busy}
              generatingSection={generatingSection}
              helper={card.helper}
              icon={card.icon}
              onGenerateSection={onGenerateSection}
              onOutputsChange={onOutputsChange}
              onRevertSection={onRevertSection}
              onReviseSection={onReviseSection}
              outputs={outputs}
              revert={sectionRevert[card.section]}
              revisingSection={revisingSection}
              section={card.section}
              status={statuses[card.section]}
              title={card.title}
            />
          </div>
        ))}

        <div className={cn("h-full", active !== INTERVIEW_KEY && "hidden")}>
          <InterviewPanel
            busy={busy}
            generatingInterview={generatingInterview}
            interviewTopics={interviewTopics}
            onGenerateInterview={onGenerateInterview}
            onReviseInterview={onReviseInterview}
            onRevert={onRevertInterview}
            revert={interviewRevert}
            status={statuses[INTERVIEW_KEY]}
          />
        </div>
      </div>
    </div>
  );
}

type OutputRailProps = {
  active: PanelKey;
  statuses: Record<PanelKey, PanelStatus>;
  onSelect: (key: PanelKey) => void;
};

// The output index. A vertical list on desktop (sticky so it stays in view beside
// a long output) and a horizontal, scrollable chip row on mobile. Each entry is a
// button carrying the output's icon, title, and status so the whole set reads at a
// glance which pieces exist and which still need generating.
function OutputRail({ active, statuses, onSelect }: OutputRailProps) {
  const items: { key: PanelKey; title: string; icon: LucideIcon }[] = [
    ...OUTPUT_CARDS.map((card) => ({
      key: card.section,
      title: card.title,
      icon: card.icon,
    })),
    { key: INTERVIEW_KEY, title: "Interview prep", icon: MessagesSquare },
  ];

  return (
    <nav
      aria-label="Generated outputs"
      className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:pb-0 lg:sticky lg:top-6 lg:self-start"
    >
      {items.map((item) => {
        const isActive = active === item.key;
        const status = statuses[item.key];
        const Icon = item.icon;
        return (
          <button
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group flex shrink-0 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors lg:shrink",
              isActive
                ? "border-brand/40 bg-accent"
                : "border-transparent hover:border-border hover:bg-muted/50",
            )}
            key={item.key}
            onClick={() => onSelect(item.key)}
            type="button"
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                isActive
                  ? "border-brand/25 bg-brand/10 text-brand"
                  : "border-transparent bg-muted text-muted-foreground group-hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span
                className={cn(
                  "truncate text-sm font-medium",
                  isActive ? "text-foreground" : "text-foreground/80",
                )}
              >
                {item.title}
              </span>
              <span className="hidden truncate text-xs text-muted-foreground lg:block">
                {STATUS_LABEL[status]}
              </span>
            </span>
            <StatusDot className="ml-auto hidden lg:block" status={status} />
          </button>
        );
      })}
    </nav>
  );
}

// The compact status marker used in the rail: a hollow ring while empty, a filled
// brand dot once there is content.
function StatusDot({
  status,
  className,
}: {
  status: PanelStatus;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 rounded-full",
        status === "empty" ? "border border-muted-foreground/40" : "bg-brand",
        className,
      )}
    />
  );
}

// The status pill shown in a panel header: labelled so "ready" and "edited" read
// clearly, using the brand hue (plus a pencil for edited) rather than a new color.
function StatusPill({ status }: { status: PanelStatus }) {
  if (status === "empty") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-2 rounded-full border border-muted-foreground/40" />
        {STATUS_LABEL.empty}
      </span>
    );
  }
  if (status === "edited") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand">
        <Pencil className="size-3" />
        {STATUS_LABEL.edited}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand">
      <span className="size-2 rounded-full bg-brand" />
      {STATUS_LABEL.ready}
    </span>
  );
}

type PanelShellProps = {
  icon: LucideIcon;
  title: string;
  helper: string;
  status: PanelStatus;
  // Attached to the in-card overlay that blooms when a generation finishes (see
  // useCompletionFlash). The card is overflow-hidden, so the bloom is clipped to it.
  flashRef?: React.Ref<HTMLSpanElement>;
  children: React.ReactNode;
};

// Shared chrome for a detail panel: a header (icon tile + title + status) over the
// body. Uses the same green `beam` border-on-hover the app's other prominent cards
// have. There is no header action button — every card drives its single
// Generate/Regenerate from the bottom of the body, so the whole flow (read → edit
// → instruct → regenerate) reads top-to-bottom. The card is h-full and its body
// flex-1 so a short panel still fills the rail-driven row height beside the sidebar.
function PanelShell({
  icon: Icon,
  title,
  helper,
  status,
  flashRef,
  children,
}: PanelShellProps) {
  return (
    <Card beam className="relative flex h-full flex-col overflow-hidden p-0">
      {/* Generation-done bloom: idle (opacity 0) until the flash hook animates it. */}
      <span
        ref={flashRef}
        aria-hidden
        className="card-done-overlay pointer-events-none absolute inset-0 z-10"
      />
      <div className="flex items-center gap-4 border-b p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-brand/25 bg-brand/10 text-brand">
          <Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2.5">
            <span className="truncate text-base font-semibold">{title}</span>
            <StatusPill status={status} />
          </div>
          <span className="truncate text-sm text-muted-foreground">{helper}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">{children}</div>
    </Card>
  );
}

type OutputPanelProps = {
  section: OutputSection;
  title: string;
  helper: string;
  icon: LucideIcon;
  status: PanelStatus;
  outputs: GeneratedOutputs;
  busy: boolean;
  generatingSection: OutputSection | null;
  revisingSection: OutputSection | null;
  // The section's revert cache entry (undefined until it has been regenerated).
  revert?: { reverted: boolean };
  onOutputsChange: (next: GeneratedOutputs) => void;
  onGenerateSection: (
    section: OutputSection,
    guidance: string,
  ) => Promise<void> | void;
  onReviseSection: (
    section: OutputSection,
    instruction: string,
  ) => Promise<boolean>;
  onRevertSection: (section: OutputSection) => void;
};

// One output's detail panel. Body reads top-to-bottom: the generated text (or the
// edit box), Copy/Edit, an always-visible instruction box, a short note, then the
// single primary action. That action is "Generate" until the section exists and
// "Regenerate" after — there is no separate "Generate again": Regenerate is the one
// way to redo the section, keeping the user's edits and applying the instructions as
// feedback. Everything is disabled while any generation runs.
function OutputPanel({
  section,
  title,
  helper,
  icon,
  status,
  outputs,
  busy,
  generatingSection,
  revisingSection,
  revert,
  onOutputsChange,
  onGenerateSection,
  onReviseSection,
  onRevertSection,
}: OutputPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  // While editing, the textarea is driven by this raw draft so resume bullets can
  // gain new lines (the stored form filters empty bullets).
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [instruction, setInstruction] = useState("");

  const sectionText = sectionToText(outputs, section);
  const hasContent = sectionHasContent(outputs, section);

  const isGeneratingThis = generatingSection === section;
  const isRevisingThis = revisingSection === section;
  const currentCopyText = isEditing ? draft : sectionText;

  // Pulse the card when a generate/regenerate for THIS section finishes, so the
  // eye is drawn back to the fresh result.
  const flashRef = useCompletionFlash<HTMLSpanElement>(
    isGeneratingThis || isRevisingThis,
  );

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

  // First creation of this section (instruction acts as preemptive guidance).
  async function handleGenerate() {
    await onGenerateSection(section, instruction.trim());
    setIsEditing(false);
  }

  // Regenerates with feedback (current draft + instruction) — the single redo path.
  async function handleRevise() {
    const ok = await onReviseSection(section, instruction.trim());
    if (ok) {
      setIsEditing(false);
    }
  }

  // Ungenerated: a compact, centered prompt so the flex-1 body stretches it to the
  // sidebar-driven row height instead of towering over the rail. The full body
  // (with the always-visible instruction box) only appears once there is content.
  if (!hasContent) {
    return (
      <PanelShell
        flashRef={flashRef}
        helper={helper}
        icon={icon}
        status={status}
        title={title}
      >
        <EmptyPanelState
          busy={busy}
          generating={isGeneratingThis}
          instruction={instruction}
          instructionId={`instructions-${section}`}
          onGenerate={handleGenerate}
          onInstructionChange={setInstruction}
        />
      </PanelShell>
    );
  }

  return (
    <PanelShell
      flashRef={flashRef}
      helper={helper}
      icon={icon}
      status={status}
      title={title}
    >
      {/* 1. The generated text (or the edit textarea). */}
      {isEditing ? (
        <Textarea
          className="min-h-48 resize-y font-mono"
          onChange={(event) => handleDraftChange(event.target.value)}
          value={draft}
        />
      ) : (
        <OutputPreview outputs={outputs} section={section} />
      )}

      {/* 2. Copy + Edit, acting on the text above. */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={toggleEditing}
        >
          {isEditing ? "Done editing" : "Edit"}
        </Button>
      </div>

      {/* 3. The always-visible model-instruction box (feeds Regenerate). */}
      <InstructionBox
        busy={busy}
        helper="Applied as feedback when you Regenerate."
        id={`instructions-${section}`}
        onChange={setInstruction}
        value={instruction}
      />

      {/* 4. A short note, then 5. the Regenerate action. */}
      <p className="mt-4 text-xs text-muted-foreground">
        <strong className="font-semibold">Regenerate</strong> rewrites this card from
        the profile, keeping your edits and applying the instructions above as
        feedback.
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
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
        <RevertButton
          busy={busy}
          revert={revert}
          onClick={() => onRevertSection(section)}
        />
      </div>
    </PanelShell>
  );
}

// The revert/redo toggle shown beside a card's Regenerate. Greyed out until the
// card has been regenerated at least once (no cached version to swap to); then it
// swaps between the last two generations, reading "Revert" or "Redo" depending on
// which one is currently shown. Instant — the swap is a cached state change.
function RevertButton({
  revert,
  busy,
  onClick,
}: {
  revert?: { reverted: boolean } | null;
  busy: boolean;
  onClick: () => void;
}) {
  const isRedo = revert?.reverted ?? false;
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy || !revert}
      onClick={onClick}
      title={
        revert ? undefined : "Regenerate first to enable revert"
      }
    >
      {isRedo ? <Redo2 /> : <Undo2 />}
      {isRedo ? "Redo" : "Revert"}
    </Button>
  );
}

type InterviewPanelProps = {
  interviewTopics: InterviewTopic[] | null;
  status: PanelStatus;
  busy: boolean;
  generatingInterview: boolean;
  revert: InterviewRevert;
  onGenerateInterview: (guidance: string) => Promise<void> | void;
  onReviseInterview: (instruction: string) => Promise<void> | void;
  onRevert: () => void;
};

// Interview prep as its own detail panel, matching the other cards: content, Copy,
// an always-visible instruction box, then a single Generate/Regenerate action.
// Regenerate is backed by the interview-prep/revise endpoint, so it refines the
// current prep with the instructions as feedback (the same feedback flow as the
// output cards). There is no in-place Edit — interview prep is a structured Q&A
// list, not free text — so its edits happen through instructions + Regenerate.
function InterviewPanel({
  interviewTopics,
  status,
  busy,
  generatingInterview,
  revert,
  onGenerateInterview,
  onReviseInterview,
  onRevert,
}: InterviewPanelProps) {
  const [copied, setCopied] = useState(false);
  const [instruction, setInstruction] = useState("");

  const topics = interviewTopics ?? [];
  const hasTopics = interviewTopics !== null;

  // Pulse the card when interview prep finishes generating/regenerating.
  const flashRef = useCompletionFlash<HTMLSpanElement>(generatingInterview);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(interviewToText(topics));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser; ignore so the UI is fine.
    }
  }

  // Ungenerated: the same compact, centered prompt the output panels use, so an
  // empty interview card matches the sidebar height too.
  if (!hasTopics) {
    return (
      <PanelShell
        flashRef={flashRef}
        helper="Likely questions about this project with talking points to rehearse."
        icon={MessagesSquare}
        status={status}
        title="Interview prep"
      >
        <EmptyPanelState
          busy={busy}
          generating={generatingInterview}
          instruction={instruction}
          instructionId="instructions-interview"
          onGenerate={() => onGenerateInterview(instruction.trim())}
          onInstructionChange={setInstruction}
        />
      </PanelShell>
    );
  }

  return (
    <PanelShell
      flashRef={flashRef}
      helper="Likely questions about this project with talking points to rehearse."
      icon={MessagesSquare}
      status={status}
      title="Interview prep"
    >
      {/* 1. The generated topics. */}
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

      {/* 2. Copy. No in-place Edit — the Q&A list is structured, not free text. */}
      <div className="mt-4 flex flex-wrap gap-2">
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

      {/* 3. The always-visible model-instruction box (feeds Regenerate). */}
      <InstructionBox
        busy={busy}
        helper="Applied as feedback when you Regenerate."
        id="instructions-interview"
        onChange={setInstruction}
        value={instruction}
      />

      {/* 4. A short note, then 5. the Regenerate action. */}
      <p className="mt-4 text-xs text-muted-foreground">
        Regenerate refines the current prep, applying the instructions above as
        feedback.
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => onReviseInterview(instruction.trim())}
        >
          {generatingInterview ? (
            <>
              <Loader2 className="animate-spin" />
              Regenerating…
            </>
          ) : (
            "Regenerate"
          )}
        </Button>
        <RevertButton busy={busy} revert={revert} onClick={onRevert} />
      </div>
    </PanelShell>
  );
}

type EmptyPanelStateProps = {
  busy: boolean;
  generating: boolean;
  onGenerate: () => void;
  // The shared instruction state, so anything typed before the first generation is
  // the same value the full body's instruction box shows afterwards.
  instruction: string;
  onInstructionChange: (value: string) => void;
  instructionId: string;
};

// The compact, centered body of a not-yet-generated panel: a short hint plus the
// Generate action. It stays small so the flex-1 wrapper stretches it to exactly the
// sidebar-driven row height instead of overflowing it — which is why the instruction
// box is behind an "Add instructions" toggle (collapsed by default). Opening it is a
// deliberate act, so the card growing past the sidebar then is expected.
function EmptyPanelState({
  busy,
  generating,
  onGenerate,
  instruction,
  onInstructionChange,
  instructionId,
}: EmptyPanelStateProps) {
  const [showInstructions, setShowInstructions] = useState(false);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">
      <p className="max-w-xs text-sm text-muted-foreground">
        This output hasn&apos;t been generated yet.
      </p>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowInstructions((open) => !open)}
      >
        {showInstructions ? <ChevronUp /> : <Plus />}
        {showInstructions ? "Hide custom instructions" : "Add custom instructions"}
      </Button>

      {showInstructions ? (
        <div className="w-full max-w-md text-left">
          <InstructionBox
            bordered={false}
            busy={busy}
            helper="Added to the prompt when you Generate."
            id={instructionId}
            onChange={onInstructionChange}
            value={instruction}
          />
        </div>
      ) : null}

      <Button variant="brand" disabled={busy} onClick={onGenerate}>
        {generating ? (
          <>
            <Loader2 className="animate-spin" />
            Generating…
          </>
        ) : (
          "Generate"
        )}
      </Button>
    </div>
  );
}

type InstructionBoxProps = {
  id: string;
  helper: string;
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  // The in-body box sits under a hairline separator; the empty-state box (already
  // inside its own toggle) drops it so it doesn't read as a stray divider.
  bordered?: boolean;
};

// The per-panel model-instruction box. Shared between the output panels, the
// interview panel, and the empty-state toggle so the label, counter, and cap stay
// identical everywhere.
function InstructionBox({
  id,
  helper,
  value,
  busy,
  onChange,
  bordered = true,
}: InstructionBoxProps) {
  // In the demo, steering the model with custom instructions is login-gated. The
  // label stays visible so the visitor sees what unlocking offers; the input itself
  // sits behind the gate.
  const demo = useDemo();
  const control = (
    <>
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
    </>
  );

  return (
    <div className={cn(bordered && "mt-5 border-t pt-4")}>
      <label className="text-sm font-medium" htmlFor={id}>
        Instructions for the model (optional)
      </label>
      <p className="mt-1 text-sm text-muted-foreground">{helper}</p>
      {demo ? (
        <GateOverlay title="Log in to guide the model">{control}</GateOverlay>
      ) : (
        control
      )}
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
