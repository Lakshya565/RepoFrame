import { Sparkles } from "lucide-react";

import { RepoOverviewCard } from "@/components/repo-overview-card";
import { TechStackCard } from "@/components/tech-stack-card";
import { RepoCommitTimeline } from "@/components/repo-commit-timeline";
import { ImportantFilesCard } from "@/components/important-files-card";
import { RepoTreeView } from "@/components/repo-tree-view";
import { ScrollReveal } from "@/components/scroll-reveal";
import { TechStackProvider } from "@/lib/tech-stack-context";
import { DEMO_REPO_URL } from "@/lib/demo-fixture";

// The demo's Analysis tab. Identical to the real Analysis tab (same cards, same
// order, same scroll reveals) — it just runs inside DemoModeProvider (see the demo
// layout), so every card resolves from the frozen fixtures instead of GitHub.
const repoUrl = DEMO_REPO_URL;

export default function DemoAnalysisPage() {
  return (
    <div className="space-y-6">
      {/* A quiet note that this is the real thing, run on RepoFrame's own repo. */}
      <div className="flex items-start gap-3 rounded-lg border border-brand/30 bg-brand/5 p-4">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
        <p className="text-sm leading-6 text-muted-foreground">
          <span className="font-medium text-foreground">
            You&apos;re exploring a live demo.
          </span>{" "}
          This is a real analysis of RepoFrame&apos;s own repository, the
          project this site was built from, so everything you see is genuine.
        </p>
      </div>

      <TechStackProvider repoUrl={repoUrl}>
        <ScrollReveal index={0}>
          <RepoOverviewCard repoUrl={repoUrl} />
        </ScrollReveal>

        <ScrollReveal index={1}>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Tech stack</h2>
            <TechStackCard />
          </section>
        </ScrollReveal>
      </TechStackProvider>

      <ScrollReveal index={2}>
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Commit activity</h2>
          <RepoCommitTimeline repoUrl={repoUrl} />
        </section>
      </ScrollReveal>

      <ScrollReveal index={3}>
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Files we read</h2>
          <ImportantFilesCard repoUrl={repoUrl} />
        </section>
      </ScrollReveal>

      <ScrollReveal index={4}>
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Repository structure</h2>
          <RepoTreeView repoUrl={repoUrl} />
        </section>
      </ScrollReveal>
    </div>
  );
}
