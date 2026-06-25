import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { ErrorState } from "@/components/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AnalysisPageProps = {
  searchParams: Promise<{
    owner?: string | string[];
    repo?: string | string[];
  }>;
};

// Pulls one query string value out of Next's possible string-or-array shape.
function getParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

// Compatibility redirect. The analysis page moved from query params
// (/analysis?owner=…&repo=…) to path segments (/analysis/[owner]/[repo]); this
// keeps any older bookmarked links working by forwarding them to the new route.
// A link missing owner/repo can't be forwarded, so it falls back to a prompt home.
export default async function AnalysisRedirectPage({
  searchParams,
}: AnalysisPageProps) {
  const params = await searchParams;
  const owner = getParam(params.owner);
  const repo = getParam(params.repo);

  if (owner && repo) {
    redirect(`/analysis/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  }

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
