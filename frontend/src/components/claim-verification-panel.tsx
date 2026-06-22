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

type ClaimVerificationPanelProps = {
  // null until a verification has been run; an empty array means "ran, no claims".
  verifications: ClaimVerification[] | null;
  loading: boolean;
};

// Short display labels for the output tabs a claim can come from. Falls back to
// the raw key if the model ever returns an unexpected section name.
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
// it carries), and an icon. Driving all three from one map keeps the four statuses
// consistent and matches the backend's closed status set, so an unknown value can
// never slip through untyped. Each badge always pairs the color with a label + icon
// (never a bare colored dot).
const STATUS_DISPLAY: Record<
  ClaimStatus,
  { label: string; variant: StatusVariant; Icon: LucideIcon }
> = {
  supported: { label: "Supported", variant: "success", Icon: CircleCheck },
  partially_supported: {
    label: "Partially supported",
    variant: "warning",
    Icon: CircleAlert,
  },
  needs_user_confirmation: {
    label: "Needs confirmation",
    variant: "info",
    Icon: CircleHelp,
  },
  unsupported: { label: "Unsupported", variant: "destructive", Icon: CircleX },
};

// Shows the agent's per-claim verification results: each generated claim with a
// status badge, the evidence that backs it, an explanation, and a suggested
// revision when one is offered. This is what makes RepoFrame feel like an agentic
// repo-analysis tool rather than a generic AI writer. Renders nothing until a
// verification has been requested. Result rows fade/slide in with a small stagger
// so the panel reads as results "landing" (static under reduced motion).
export function ClaimVerificationPanel({
  verifications,
  loading,
}: ClaimVerificationPanelProps) {
  if (!loading && verifications === null) {
    return null;
  }

  return (
    <Card className="bg-muted/30 p-6">
      <h3 className="text-base font-semibold">
        How well the evidence backs each claim
      </h3>

      {loading ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Checking each claim against the repository evidence…
          </p>
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-20" />
          ))}
        </div>
      ) : verifications && verifications.length > 0 ? (
        <ul className="mt-4 grid gap-3">
          {verifications.map((item, index) => {
            const status = STATUS_DISPLAY[item.status];
            return (
              <li
                className="rounded-md border bg-card p-4 duration-500 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both motion-reduce:animate-none"
                style={{ animationDelay: `${index * 60}ms` }}
                key={`${item.claim}-${index}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm leading-6 text-foreground">
                    {item.claim}
                  </p>
                  <Badge
                    variant={status.variant}
                    className="shrink-0 duration-300 animate-in fade-in-0 zoom-in-95 fill-mode-both motion-reduce:animate-none"
                    style={{ animationDelay: `${index * 60 + 120}ms` }}
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
                    <span className="font-semibold">Suggested revision: </span>
                    {item.suggestedRevision}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No claims were found to verify. Generate some outputs first.
        </p>
      )}
    </Card>
  );
}
