"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { GitCommitHorizontal } from "lucide-react";

import {
  fetchCommitActivityPolling,
  type CommitActivityRange,
  type CommitActivityResponse,
} from "@/lib/repo-api";
import { demoFetchCommitActivity } from "@/lib/demo-analysis";
import { useDemo } from "@/lib/demo-mode";
import { useRepoResource, type RepoResource } from "@/lib/use-repo-resource";
import { useRepoAnalysis } from "@/lib/analysis-context";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import { cn } from "@/lib/utils";

const CommitTimelineChart = dynamic(() =>
  import("@/components/commit-timeline-chart").then(
    (module) => module.CommitTimelineChart,
  ),
  { loading: TimelineSkeleton },
);

type RepoCommitTimelineProps = {
  repoUrl: string;
};

const COMMIT_ACTIVITY_ERROR = "RepoFrame could not fetch commit activity.";
const RANGES: { id: CommitActivityRange; label: string; noun: string }[] = [
  { id: "month", label: "1M", noun: "the last month" },
  { id: "year", label: "1Y", noun: "the last year" },
];

// Starts only after the core stream completes, preventing GitHub's slower stats
// endpoint from competing with the overview, stack, and structure requests.
export function RepoCommitTimeline({ repoUrl }: RepoCommitTimelineProps) {
  const [range, setRange] = useState<CommitActivityRange>("month");
  const demo = useDemo();
  const { isCoreComplete } = useRepoAnalysis();
  const fetcher = useCallback(
    (url: string) =>
      demo
        ? demoFetchCommitActivity(url)
        : fetchCommitActivityPolling(url),
    [demo],
  );
  const activity = useRepoResource(
    repoUrl,
    fetcher,
    COMMIT_ACTIVITY_ERROR,
    isCoreComplete,
  );

  useEffect(() => {
    if (activity.data) {
      performance.mark("repoframe-analysis-commit-ready");
    }
  }, [activity.data]);

  return (
    <Card beam className="p-6">
      <div className="mb-6 flex items-center justify-end">
        <RangeToggle range={range} onRangeChange={setRange} />
      </div>
      <TimelineBody range={range} resource={activity} />
    </Card>
  );
}

function RangeToggle({
  range,
  onRangeChange,
}: {
  range: CommitActivityRange;
  onRangeChange: (range: CommitActivityRange) => void;
}) {
  return (
    <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
      {RANGES.map((option) => {
        const isActive = option.id === range;
        return (
          <button
            aria-pressed={isActive}
            className={cn(
              "cursor-pointer rounded-[5px] px-3 py-1 text-xs font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            key={option.id}
            onClick={() => onRangeChange(option.id)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function TimelineBody({
  resource,
  range,
}: {
  resource: RepoResource<CommitActivityResponse>;
  range: CommitActivityRange;
}) {
  if (resource.isLoading) {
    return <TimelineSkeleton />;
  }
  if (resource.error) {
    return (
      <ErrorState
        title="Commit activity unavailable"
        message={resource.error}
        onRetry={resource.reload}
      />
    );
  }

  const activity = resource.data?.ranges?.[range];
  if (!activity || activity.buckets.length === 0 || activity.totalCommits === 0) {
    const noun = RANGES.find((option) => option.id === range)?.noun ?? "this range";
    return (
      <EmptyState
        icon={GitCommitHorizontal}
        title={`No commit activity in ${noun}`}
        description="This repository has no commits in the window GitHub reports, so there's nothing to chart yet."
      />
    );
  }

  return <CommitTimelineChart activity={activity} key={range} range={range} />;
}

function TimelineSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-64" />
      <Skeleton className="mt-6 h-40 w-full rounded-md" />
      <Skeleton className="mt-3 h-3 w-full" />
    </div>
  );
}
