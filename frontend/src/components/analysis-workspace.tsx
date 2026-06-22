"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Wrench } from "lucide-react";

import { RepoSummaryCard } from "@/components/repo-summary-card";
import { TechStackCard } from "@/components/tech-stack-card";
import { ImportantFilesCard } from "@/components/important-files-card";
import { RepoTreeView } from "@/components/repo-tree-view";
import { ProjectWriteupSection } from "@/components/project-writeup-section";
import { GitHubRateLimitCard } from "@/components/github-rate-limit-card";
import { TokenUsagePanel } from "@/components/token-usage-panel";
import { Button } from "@/components/ui/button";
import { type UsageTotals } from "@/lib/repo-api";

type AnalysisWorkspaceProps = {
  owner: string;
  repo: string;
  repoUrl: string;
};

const EMPTY_USAGE_TOTALS: UsageTotals = {
  promptTokens: 0,
  completionTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
};

// Sums two usage totals field by field to accumulate the per-session meter.
function addTotals(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

// The analysis page workspace. A product-first, two-column layout: a sticky left
// rail carries the supporting evidence (repo summary, tech stack, and peekable
// "what we read" detail), while the main column is the writeup workspace — the
// thing the visitor actually came to use. Token-usage state is owned here so it
// can be shown in the developer panel rather than in the customer-facing flow.
export function AnalysisWorkspace({
  owner,
  repo,
  repoUrl,
}: AnalysisWorkspaceProps) {
  const [sessionUsage, setSessionUsage] =
    React.useState<UsageTotals>(EMPTY_USAGE_TOTALS);
  const [usageRefresh, setUsageRefresh] = React.useState(0);
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

      <div className="mt-8 grid gap-8 lg:grid-cols-[320px_1fr]">
        <aside className="flex flex-col gap-6 lg:sticky lg:top-20 lg:self-start">
          <RepoSummaryCard repoUrl={repoUrl} />
          <TechStackCard repoUrl={repoUrl} />
          <RailDisclosure title="Files we read">
            <ImportantFilesCard repoUrl={repoUrl} />
          </RailDisclosure>
          <RailDisclosure title="Repository structure">
            <RepoTreeView repoUrl={repoUrl} />
          </RailDisclosure>
        </aside>

        <main className="min-w-0">
          <ProjectWriteupSection
            repoUrl={repoUrl}
            onAddUsage={(usage) =>
              setSessionUsage((prev) => addTotals(prev, usage))
            }
            onGenerationComplete={() => setUsageRefresh((count) => count + 1)}
          />
        </main>
      </div>
    </div>
  );
}

// A lightweight, borderless disclosure for the rail's supporting detail. The
// summary is a plain clickable label with a chevron; the revealed child supplies
// its own card chrome, so there is no card-inside-a-card nesting.
function RailDisclosure({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
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
