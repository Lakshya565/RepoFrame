import { RepoOverviewCard } from "@/components/repo-overview-card";
import { TechStackCard } from "@/components/tech-stack-card";
import { RepoCommitTimeline } from "@/components/repo-commit-timeline";
import { ImportantFilesCard } from "@/components/important-files-card";
import { RepoTreeView } from "@/components/repo-tree-view";
import { ScrollReveal } from "@/components/scroll-reveal";
import { TechStackProvider } from "@/lib/tech-stack-context";
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
