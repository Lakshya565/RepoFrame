import { Sparkles } from "lucide-react";

import { RepoOverviewCard } from "@/components/repo-overview-card";
import { TechStackCard } from "@/components/tech-stack-card";
import { RepoCommitTimeline } from "@/components/repo-commit-timeline";
import { ImportantFilesCard } from "@/components/important-files-card";
import { LazyRepoTreeView } from "@/components/lazy-repo-tree-view";
import { ScrollReveal } from "@/components/scroll-reveal";
import { AnalysisCardBoundary } from "@/components/analysis-card-boundary";
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

      <ScrollReveal index={0}>
        <AnalysisCardBoundary resetKey={`${repoUrl}:overview`}>
          <RepoOverviewCard repoUrl={repoUrl} />
        </AnalysisCardBoundary>
      </ScrollReveal>

      <ScrollReveal index={1}>
        <AnalysisCardBoundary resetKey={`${repoUrl}:stack`}>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Tech stack</h2>
            <TechStackCard />
          </section>
        </AnalysisCardBoundary>
      </ScrollReveal>

      <ScrollReveal index={2}>
        <AnalysisCardBoundary resetKey={`${repoUrl}:commits`}>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Commit activity</h2>
            <RepoCommitTimeline repoUrl={repoUrl} />
          </section>
        </AnalysisCardBoundary>
      </ScrollReveal>

      <ScrollReveal index={3}>
        <AnalysisCardBoundary resetKey={`${repoUrl}:files`}>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Files we read</h2>
            <ImportantFilesCard repoUrl={repoUrl} />
          </section>
        </AnalysisCardBoundary>
      </ScrollReveal>

      <ScrollReveal index={4}>
        <AnalysisCardBoundary resetKey={`${repoUrl}:tree`}>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Repository structure</h2>
            <LazyRepoTreeView repoUrl={repoUrl} />
          </section>
        </AnalysisCardBoundary>
      </ScrollReveal>
    </div>
  );
}
