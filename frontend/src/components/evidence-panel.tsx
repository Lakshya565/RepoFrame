import { type ProfileEvidenceItem } from "@/lib/repo-api";
import { Card } from "@/components/ui/card";

type EvidencePanelProps = {
  evidence: ProfileEvidenceItem[];
};

// Shows the claim-to-source links behind the profile so generated outputs stay
// auditable. Each row pairs a claim with the file or context it came from. This
// is what keeps RepoFrame evidence-backed rather than a generic AI writer.
export function EvidencePanel({ evidence }: EvidencePanelProps) {
  return (
    <Card beam className="bg-muted/30 p-6">
      <h3 className="text-base font-semibold">What backs these claims</h3>

      {evidence.length > 0 ? (
        <dl className="mt-4 grid gap-3">
          {evidence.map((item, index) => (
            <div className="rounded-md border bg-card p-4" key={`${item.source}-${index}`}>
              <dt className="text-sm leading-6 text-foreground">{item.claim}</dt>
              <dd className="mt-1 break-words font-mono text-xs text-muted-foreground">
                {item.source}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No evidence links were returned for this profile.
        </p>
      )}
    </Card>
  );
}
