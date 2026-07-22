import { type ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";
import { AnalysisChrome } from "@/components/analysis-chrome";
import { GenerationProvider } from "@/lib/generation-context";
import { DemoModeProvider } from "@/lib/demo-mode";
import { DEMO_REPO_NAME, DEMO_REPO_OWNER } from "@/lib/demo-fixture";
import { DEMO_REPO_URL } from "@/lib/demo-fixture";
import { AnalysisProvider } from "@/lib/analysis-context";

// The signed-out demo: a full, interactive replica of the analysis experience
// (Analysis / Generate / History tabs) for RepoFrame's own repo, wrapped in
// DemoModeProvider so every data + generation call resolves from frozen fixtures
// — zero GitHub calls, zero OpenAI tokens, and no hint that it isn't live. It
// reuses the exact same chrome and pages the real app uses; only the data source
// and the login gates differ. The auto-save / reopen headless components are
// intentionally omitted because the demo has nothing to persist.
export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader />
      <DemoModeProvider>
        <GenerationProvider>
          <AnalysisProvider repoUrl={DEMO_REPO_URL} analysisPath="/demo">
            <AnalysisChrome
              owner={DEMO_REPO_OWNER}
              repo={DEMO_REPO_NAME}
              basePath="/demo"
            >
              {children}
            </AnalysisChrome>
          </AnalysisProvider>
        </GenerationProvider>
      </DemoModeProvider>
    </main>
  );
}
