import { RepoOverviewCard } from "@/components/repo-overview-card";
import { TechStackCard } from "@/components/tech-stack-card";
import { ImportantFilesCard } from "@/components/important-files-card";
import { RepoTreeView } from "@/components/repo-tree-view";
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
      {/* One shared fetch of the tech stack feeds both the overview card's icon
          cloud and the Tech stack section's tiles. */}
      <TechStackProvider repoUrl={repoUrl}>
        <RepoOverviewCard repoUrl={repoUrl} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Tech stack</h2>
          <TechStackCard />
        </section>
      </TechStackProvider>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Files we read</h2>
        <ImportantFilesCard repoUrl={repoUrl} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Repository structure</h2>
        <RepoTreeView repoUrl={repoUrl} />
      </section>
    </div>
  );
}
