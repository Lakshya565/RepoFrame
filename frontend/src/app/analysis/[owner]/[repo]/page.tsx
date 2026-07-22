import { RepoOverviewCard } from "@/components/repo-overview-card";
import { TechStackCard } from "@/components/tech-stack-card";
import { RepoCommitTimeline } from "@/components/repo-commit-timeline";
import { ImportantFilesCard } from "@/components/important-files-card";
import { LazyRepoTreeView } from "@/components/lazy-repo-tree-view";
import { ScrollReveal } from "@/components/scroll-reveal";
import { AnalysisCardBoundary } from "@/components/analysis-card-boundary";
import { repoUrlFromParams } from "@/lib/repo-url";

type AnalysisTabPageProps = {
  params: Promise<{ owner: string; repo: string }>;
};

// The Analysis tab: the supporting evidence the writeup is grounded in. An
// overview hero card pairs the repo summary with the tech-stack icon cloud; below
// it, each facet is its own always-visible section card (tech stack, files we
// read, repository structure). Detail opens in popovers, so the sections stay
// compact without needing to collapse.
export default async function AnalysisTabPage({
  params,
}: AnalysisTabPageProps) {
  const { owner, repo } = await params;
  const repoUrl = repoUrlFromParams(owner, repo);

  return (
    <div className="space-y-6">
      {/* Each card fades and lifts into view as it scrolls on screen. One shared
          fetch of the tech stack feeds both the overview card's icon cloud and the
          Tech stack section's tiles. */}
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
