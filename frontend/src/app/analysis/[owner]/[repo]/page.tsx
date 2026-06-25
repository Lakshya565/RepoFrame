import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { RepoOverviewCard } from "@/components/repo-overview-card";
import { ImportantFilesCard } from "@/components/important-files-card";
import { RepoTreeView } from "@/components/repo-tree-view";
import { repoUrlFromParams } from "@/lib/repo-url";

type AnalysisTabPageProps = {
  params: Promise<{ owner: string; repo: string }>;
};

// The Analysis tab: the supporting evidence the writeup is grounded in. One
// overview card unifies the repo summary, the tech-stack icon cloud, and the
// clickable technology nodes; the heavier "what we read" file/structure views
// stay below in disclosures.
export default async function AnalysisTabPage({
  params,
}: AnalysisTabPageProps) {
  const { owner, repo } = await params;
  const repoUrl = repoUrlFromParams(owner, repo);

  return (
    <div className="space-y-6">
      <RepoOverviewCard repoUrl={repoUrl} />

      <RailDisclosure title="Files we read">
        <ImportantFilesCard repoUrl={repoUrl} />
      </RailDisclosure>
      <RailDisclosure title="Repository structure">
        <RepoTreeView repoUrl={repoUrl} />
      </RailDisclosure>
    </div>
  );
}

// A lightweight, borderless disclosure for the tab's supporting detail. The
// summary is a plain clickable label with a chevron; the revealed child supplies
// its own card chrome, so there is no card-inside-a-card nesting. Native
// <details>, so it needs no client JavaScript.
function RailDisclosure({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-md py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        {title}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
