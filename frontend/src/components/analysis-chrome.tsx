import { type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AnalysisTabs } from "@/components/analysis-tabs";

type AnalysisChromeProps = {
  owner: string;
  repo: string;
  // The repo's base route (e.g. "/analysis/facebook/react"), used to build the
  // tab links.
  basePath: string;
  children: ReactNode;
};

// The persistent chrome around every analysis tab: the back link, repository
// title, and route-based tab bar. It lives in the shared layout so the generation
// workspace survives navigation between tabs.
export function AnalysisChrome({
  owner,
  repo,
  basePath,
  children,
}: AnalysisChromeProps) {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>
      </div>

      <div className="mt-4">
        <h1 className="break-words text-2xl font-semibold tracking-tight">
          {owner}/{repo}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We read your repository so every writeup is grounded in real evidence.
        </p>
      </div>

      <div className="mt-6">
        <AnalysisTabs basePath={basePath} />
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}
