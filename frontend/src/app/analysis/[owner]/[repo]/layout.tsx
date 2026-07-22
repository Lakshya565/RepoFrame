import { type ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";
import { AnalysisChrome } from "@/components/analysis-chrome";
import { ProjectAutoSave } from "@/components/project-auto-save";
import { ProjectHydrator } from "@/components/project-hydrator";
import { GenerationProvider } from "@/lib/generation-context";
import { AnalysisProvider } from "@/lib/analysis-context";
import { repoUrlFromParams } from "@/lib/repo-url";

type AnalysisLayoutProps = {
  children: ReactNode;
  params: Promise<{ owner: string; repo: string }>;
};

// Shared layout for every analysis tab (Analysis / Generate / History). Because
// the App Router keeps a layout mounted while navigating between its child pages,
// this is the one place that survives tab switches — so GenerationProvider lives
// here and the user's generated writeup is never lost when they change tabs.
//
// Layouts (unlike pages) receive `params` but not `searchParams`, which is the
// reason the repo identity moved into the path: owner/repo are available here to
// build the tab links and the title. The provider is keyed by the base path so a
// navigation to a different repo resets the generation state instead of leaking
// one repo's outputs into another.
export default async function AnalysisLayout({
  children,
  params,
}: AnalysisLayoutProps) {
  const { owner, repo } = await params;
  const basePath = `/analysis/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const repoUrl = repoUrlFromParams(owner, repo);

  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader />
      <GenerationProvider key={basePath}>
        <AnalysisProvider repoUrl={repoUrl} analysisPath={basePath}>
          {/* Headless: persists the workspace after each generation when the saved-
              projects feature is on and the user is signed in (inert otherwise). */}
          <ProjectAutoSave />
          {/* Headless: when opened with ?projectId= (reopen from History), loads that
              saved snapshot into the workspace so the Generate page is pre-filled;
              inert for a normal fresh analysis. */}
          <ProjectHydrator />
          <AnalysisChrome owner={owner} repo={repo} basePath={basePath}>
            {children}
          </AnalysisChrome>
        </AnalysisProvider>
      </GenerationProvider>
    </main>
  );
}
