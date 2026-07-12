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
