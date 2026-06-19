import { type ClaimStatus, type ClaimVerification } from "@/lib/repo-api";

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

// Display metadata for each status: a human label and the badge color. Driving
// both from one map keeps the four statuses consistent and matches the backend's
// closed status set so an unknown value can never slip through untyped.
const STATUS_DISPLAY: Record<ClaimStatus, { label: string; badge: string }> = {
  supported: {
    label: "Supported",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  partially_supported: {
    label: "Partially supported",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
  },
  needs_user_confirmation: {
    label: "Needs confirmation",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
  },
  unsupported: {
    label: "Unsupported",
    badge: "border-red-200 bg-red-50 text-red-700",
  },
};

// Shows the agent's per-claim verification results: each generated claim with a
// status badge, the evidence that backs it, an explanation, and a suggested
// revision when one is offered. This is what makes RepoFrame feel like an agentic
// repo-analysis tool rather than a generic AI writer. Renders nothing until a
// verification has been requested.
export function ClaimVerificationPanel({
  verifications,
  loading,
}: ClaimVerificationPanelProps) {
  if (!loading && verifications === null) {
    return null;
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Claim verification
      </p>
      <h3 className="mt-3 text-lg font-semibold">
        How well the evidence backs each claim
      </h3>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">
          Checking each claim against the repository evidence…
        </p>
      ) : verifications && verifications.length > 0 ? (
        <ul className="mt-4 grid gap-3">
          {verifications.map((item, index) => (
            <li
              className="rounded-md border border-slate-200 bg-white p-4"
              key={`${item.claim}-${index}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-base leading-7 text-slate-950">{item.claim}</p>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_DISPLAY[item.status].badge}`}
                >
                  {STATUS_DISPLAY[item.status].label}
                </span>
              </div>

              {item.sections.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.sections.map((section) => (
                    <span
                      className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-600"
                      key={section}
                    >
                      {sectionLabel(section)}
                    </span>
                  ))}
                </div>
              ) : null}

              {item.explanation ? (
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {item.explanation}
                </p>
              ) : null}

              {item.supportingEvidence.length > 0 ? (
                <p className="mt-2 break-words font-mono text-xs text-slate-500">
                  {item.supportingEvidence.join(", ")}
                </p>
              ) : null}

              {item.suggestedRevision ? (
                <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                  <span className="font-semibold">Suggested revision: </span>
                  {item.suggestedRevision}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          No claims were found to verify. Generate some outputs first.
        </p>
      )}
    </article>
  );
}
