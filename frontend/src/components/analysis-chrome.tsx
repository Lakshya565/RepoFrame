"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TokenUsagePanel } from "@/components/token-usage-panel";
import { GitHubRateLimitCard } from "@/components/github-rate-limit-card";
import { AnalysisTabs } from "@/components/analysis-tabs";
import { useGeneration } from "@/lib/generation-context";

type AnalysisChromeProps = {
  owner: string;
  repo: string;
  // The repo's base route (e.g. "/analysis/facebook/react"), used to build the
  // tab links.
  basePath: string;
  children: React.ReactNode;
};

// The persistent chrome around every analysis tab: the back link, the repo
// title, the developer toggle/panel, and the route-based tab bar. It lives in the
// shared layout (inside GenerationProvider) so it — and the generation state it
// reads — survive navigation between tabs. The token meter shown in the developer
// panel is read from the generation context, so it keeps accumulating across tab
// switches and even background generations.
export function AnalysisChrome({
  owner,
  repo,
  basePath,
  children,
}: AnalysisChromeProps) {
  const { sessionUsage, usageRefresh } = useGeneration();
  // The developer panel (token spend + GitHub rate limit) is operational detail
  // kept off the customer-facing view; it's a quick toggle for local development
  // and is intended to be removed before launch.
  const [devOpen, setDevOpen] = React.useState(false);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={devOpen}
          onClick={() => setDevOpen((open) => !open)}
        >
          <Wrench />
          Developer
        </Button>
      </div>

      <div className="mt-4">
        <h1 className="break-words text-2xl font-semibold tracking-tight">
          {owner}/{repo}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We read your repository so every writeup is grounded in real evidence.
        </p>
      </div>

      {devOpen ? (
        <section className="mt-6 rounded-lg border border-dashed p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Developer · removed before launch
          </p>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <TokenUsagePanel
              sessionUsage={sessionUsage}
              refreshSignal={usageRefresh}
            />
            <GitHubRateLimitCard />
          </div>
        </section>
      ) : null}

      <div className="mt-6">
        <AnalysisTabs basePath={basePath} />
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}
