import { type ProfileEvidenceItem } from "@/lib/repo-api";

type EvidencePanelProps = {
  evidence: ProfileEvidenceItem[];
};

// Shows the claim-to-source links behind the profile so generated outputs stay
// auditable. Each row pairs a claim with the file or context it came from. This
// is what keeps RepoFrame evidence-backed rather than a generic AI writer.
export function EvidencePanel({ evidence }: EvidencePanelProps) {
  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Evidence
      </p>
      <h3 className="mt-3 text-lg font-semibold">What backs these claims</h3>

      {evidence.length > 0 ? (
        <dl className="mt-4 grid gap-3">
          {evidence.map((item, index) => (
            <div
              className="rounded-md border border-slate-200 bg-white p-4"
              key={`${item.source}-${index}`}
            >
              <dt className="text-base leading-7 text-slate-950">
                {item.claim}
              </dt>
              <dd className="mt-1 break-words font-mono text-sm text-slate-500">
                {item.source}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          No evidence links were returned for this profile.
        </p>
      )}
    </article>
  );
}
