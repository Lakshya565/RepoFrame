import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleX,
  type LucideIcon,
} from "lucide-react";

import { type ClaimStatus, type ClaimVerification } from "@/lib/repo-api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ClaimVerificationPanelProps = {
  // null until a verification has been run; an empty array means "ran, no claims".
  verifications: ClaimVerification[] | null;
  loading: boolean;
};

// Short display labels for the outputs a claim can come from. Falls back to the
// raw key if the model ever returns an unexpected section name.
const SECTION_LABELS: Record<string, string> = {
  resumeBullets: "Resume",
  readmeIntro: "README",
  portfolioBlurb: "Portfolio",
  linkedinDescription: "LinkedIn",
};

function sectionLabel(section: string): string {
  return SECTION_LABELS[section] ?? section;
}

// The status badge variant union — kept narrow so each of the four claim statuses
// maps to exactly one semantic Badge variant.
type StatusVariant = "success" | "warning" | "info" | "destructive";

// Display metadata for each status: a human label, the badge variant (which color
// it carries), an icon, and the solid color used for its slice of the summary bar.
// Driving all of it from one map keeps the four statuses consistent and matches the
// backend's closed status set, so an unknown value can never slip through untyped.
// Each badge always pairs the color with a label + icon (never a bare colored dot).
const STATUS_DISPLAY: Record<
  ClaimStatus,
  { label: string; variant: StatusVariant; Icon: LucideIcon; bar: string }
> = {
  supported: {
    label: "Supported",
    variant: "success",
    Icon: CircleCheck,
    bar: "bg-green-500",
  },
  partially_supported: {
    label: "Partially supported",
    variant: "warning",
    Icon: CircleAlert,
    bar: "bg-amber-500",
  },
  needs_user_confirmation: {
    label: "Needs confirmation",
    variant: "info",
    Icon: CircleHelp,
    bar: "bg-blue-500",
  },
  unsupported: {
    label: "Unsupported",
    variant: "destructive",
    Icon: CircleX,
    bar: "bg-red-500",
  },
};

// The order the statuses read in the summary (best → worst): the bar fills green
// first, and the legend matches, so a healthy run looks green-heavy at a glance.
const SUMMARY_ORDER: ClaimStatus[] = [
  "supported",
  "partially_supported",
  "needs_user_confirmation",
  "unsupported",
];

// Sort severity (worst → best) so the claims that need the user's attention float
// to the top of the report and the supported ones settle below.
const SEVERITY: Record<ClaimStatus, number> = {
  unsupported: 0,
  partially_supported: 1,
  needs_user_confirmation: 2,
  supported: 3,
};

// The verification agent's findings, presented as a report: a verdict headline, a
// status-distribution bar with counts, then the claims sorted worst-first and split
// into "needs attention" and "supported" groups so action items lead. Each claim
// keeps its evidence, explanation, and the agent's suggested fix. This is what makes
// RepoFrame feel like an agentic repo-analysis tool rather than a generic AI writer.
// Renders nothing until a verification has been requested.
export function ClaimVerificationPanel({
  verifications,
  loading,
}: ClaimVerificationPanelProps) {
  if (!loading && verifications === null) {
    return null;
  }

  if (loading) {
    return (
      <Card beam className="bg-muted/30 p-6">
        <h3 className="text-base font-semibold">Verification report</h3>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Checking each claim against the repository evidence…
          </p>
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-20" />
          ))}
        </div>
      </Card>
    );
  }

  const results = verifications ?? [];

  if (results.length === 0) {
    return (
      <Card beam className="bg-muted/30 p-6">
        <h3 className="text-base font-semibold">Verification report</h3>
        <p className="mt-4 text-sm text-muted-foreground">
          No claims were found to verify. Generate some outputs first.
        </p>
      </Card>
    );
  }

  const total = results.length;
  const countOf = (status: ClaimStatus) =>
    results.filter((item) => item.status === status).length;
  const supportedCount = countOf("supported");

  const verdict =
    supportedCount === total
      ? `All ${total} ${total === 1 ? "claim is" : "claims are"} backed by the evidence.`
      : `${supportedCount} of ${total} claims fully supported by the evidence.`;

  // Worst-first, then split so action items lead. Array.sort is stable, so claims
  // keep their original order within a status.
  const sorted = [...results].sort(
    (a, b) => SEVERITY[a.status] - SEVERITY[b.status],
  );
  const needsAttention = sorted.filter((item) => item.status !== "supported");
  const supported = sorted.filter((item) => item.status === "supported");

  return (
    <Card beam className="bg-muted/30 p-6">
      <h3 className="text-base font-semibold">Verification report</h3>
      <p className="mt-1 text-sm text-muted-foreground">{verdict}</p>

      {/* Status-distribution bar: each status takes a slice proportional to its
          share, best → worst, so a healthy run reads green-heavy. */}
      <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {SUMMARY_ORDER.map((status) => {
          const count = countOf(status);
          if (count === 0) {
            return null;
          }
          return (
            <div
              className={STATUS_DISPLAY[status].bar}
              key={status}
              style={{ width: `${(count / total) * 100}%` }}
            />
          );
        })}
      </div>

      {/* Legend with counts, including zero-count statuses (a "0 Unsupported" is
          reassuring, so the full picture is always shown). */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {SUMMARY_ORDER.map((status) => (
          <li
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
            key={status}
          >
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 rounded-full",
                STATUS_DISPLAY[status].bar,
              )}
            />
            <span className="font-medium text-foreground">
              {countOf(status)}
            </span>
            {STATUS_DISPLAY[status].label}
          </li>
        ))}
      </ul>

      {needsAttention.length > 0 ? (
        <ClaimGroup
          label={`Needs attention (${needsAttention.length})`}
          items={needsAttention}
          startIndex={0}
        />
      ) : null}

      {supported.length > 0 ? (
        <ClaimGroup
          label={`Supported (${supported.length})`}
          items={supported}
          startIndex={needsAttention.length}
        />
      ) : null}
    </Card>
  );
}

type ClaimGroupProps = {
  label: string;
  items: ClaimVerification[];
  // Continues the entrance-stagger index across both groups.
  startIndex: number;
};

// One labelled group of claim rows ("Needs attention" / "Supported").
function ClaimGroup({ label, items, startIndex }: ClaimGroupProps) {
  return (
    <div className="mt-6">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h4>
      <ul className="mt-3 grid gap-3">
        {items.map((item, index) => (
          <ClaimRow
            item={item}
            key={`${item.claim}-${startIndex + index}`}
            staggerIndex={startIndex + index}
          />
        ))}
      </ul>
    </div>
  );
}

type ClaimRowProps = {
  item: ClaimVerification;
  staggerIndex: number;
};

// A single verified claim: status badge, the outputs it appears in, the agent's
// explanation and supporting evidence, and its suggested fix when one is offered.
// Rows fade/slide in with a small stagger so the report reads as results "landing".
function ClaimRow({ item, staggerIndex }: ClaimRowProps) {
  const status = STATUS_DISPLAY[item.status];
  return (
    <li
      className="rounded-md border bg-card p-4 duration-500 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both motion-reduce:animate-none"
      style={{ animationDelay: `${staggerIndex * 60}ms` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm leading-6 text-foreground">{item.claim}</p>
        <Badge
          variant={status.variant}
          className="shrink-0 duration-300 animate-in fade-in-0 zoom-in-95 fill-mode-both motion-reduce:animate-none"
          style={{ animationDelay: `${staggerIndex * 60 + 120}ms` }}
        >
          <status.Icon />
          {status.label}
        </Badge>
      </div>

      {item.sections.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.sections.map((section) => (
            <Badge variant="muted" key={section}>
              {sectionLabel(section)}
            </Badge>
          ))}
        </div>
      ) : null}

      {item.explanation ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {item.explanation}
        </p>
      ) : null}

      {item.supportingEvidence.length > 0 ? (
        <p className="mt-2 break-words font-mono text-xs text-muted-foreground">
          {item.supportingEvidence.join(", ")}
        </p>
      ) : null}

      {item.suggestedRevision ? (
        <p className="mt-2 rounded-md border bg-muted/50 px-3 py-2 text-sm leading-6">
          <span className="font-semibold">Agent&apos;s suggested fix: </span>
          {item.suggestedRevision}
        </p>
      ) : null}
    </li>
  );
}
