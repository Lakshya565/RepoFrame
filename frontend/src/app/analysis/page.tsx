import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { AnalysisWorkspace } from "@/components/analysis-workspace";
import { ErrorState } from "@/components/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AnalysisPageProps = {
  searchParams: Promise<{
    owner?: string | string[];
    repo?: string | string[];
    normalizedUrl?: string | string[];
  }>;
};

// Pulls one query string value out of Next's possible string-or-array shape.
function getParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

// Validates the query params produced by the repo form, then hands off to the
// client workspace, which owns the two-column layout and all live GitHub/OpenAI
// fetching. The route shell stays thin.
export default async function AnalysisPage({ searchParams }: AnalysisPageProps) {
  const params = await searchParams;
  const owner = getParam(params.owner);
  const repo = getParam(params.repo);
  const normalizedUrl = getParam(params.normalizedUrl);

  if (!owner || !repo || !normalizedUrl) {
    return (
      <main className="flex min-h-screen flex-col">
        <SiteHeader />
        <div className="mx-auto w-full max-w-2xl flex-1 px-5 py-16 sm:px-8">
          <ErrorState
            title="RepoFrame could not read that repository."
            message="Enter a GitHub URL like https://github.com/{owner}/{repo}."
          />
          <div className="mt-6 flex justify-center">
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
              <ArrowLeft />
              Back to RepoFrame
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader />
      <AnalysisWorkspace owner={owner} repo={repo} repoUrl={normalizedUrl} />
    </main>
  );
}
