"use client";

import { useCallback, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { GitCommitHorizontal } from "lucide-react";

import {
  fetchCommitActivityPolling,
  type CommitActivityRange,
  type CommitActivityResponse,
  type CommitActivityTimeline,
} from "@/lib/repo-api";
import { demoFetchCommitActivity } from "@/lib/demo-analysis";
import { useDemo } from "@/lib/demo-mode";
import { useRepoResource, type RepoResource } from "@/lib/use-repo-resource";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { EmptyState, ErrorState } from "@/components/states";
import { cn } from "@/lib/utils";

type RepoCommitTimelineProps = {
  repoUrl: string;
};

const COMMIT_ACTIVITY_ERROR = "RepoFrame could not fetch commit activity.";

// The selectable ranges, in display order.
const RANGES: { id: CommitActivityRange; label: string; noun: string }[] = [
  { id: "month", label: "1M", noun: "the last month" },
  { id: "year", label: "1Y", noun: "the last year" },
];

// How long the line takes to draw itself in when the chart scrolls into view. Kept
// deliberately unhurried so the left-to-right draw reads as an intentional reveal.
const LINE_DRAW_MS = 2000;

// Data-point dot sizing, in the chart's SVG units. The visible dot is small at rest
// and grows on hover; a larger transparent hit circle makes each dot comfortable to
// point at without the visible dots crowding one another.
const DOT_RADIUS = 3.5;
const DOT_HOVER_RADIUS = 5;
const DOT_HIT_RADIUS = 12;

// Gap, in px, between a hovered dot and the tooltip anchored just above it.
const TOOLTIP_OFFSET_PX = 12;

// Drives the line/area colour off the brand token via the shadcn chart CSS var.
const chartConfig = {
  commits: { label: "Commits", color: "var(--color-brand)" },
} satisfies ChartConfig;

const numberFormatter = new Intl.NumberFormat("en-US");

// The Analysis-page "Commit activity" card: an area/line chart of commits over a
// selectable range (last month / last year), bucketed by the backend into
// an adaptive interval. Built on shadcn's Chart (which wraps Recharts) so the line
// draws itself in correctly — left to right — when it scrolls into view, with hover
// showing the exact count and date for the nearest point. It reserves a fixed height
// across every state so the page does not shift as it resolves.
export function RepoCommitTimeline({ repoUrl }: RepoCommitTimelineProps) {
  const [range, setRange] = useState<CommitActivityRange>("month");
  const demo = useDemo();

  // Fetches the bundled 1M/1Y response once. The range toggle only selects local
  // data, while polling absorbs GitHub's temporary "still computing" response.
  const fetcher = useCallback(
    (url: string) =>
      demo
        ? demoFetchCommitActivity(url)
        : fetchCommitActivityPolling(url),
    [demo],
  );
  const activity = useRepoResource(repoUrl, fetcher, COMMIT_ACTIVITY_ERROR);

  return (
    <Card beam className="p-6">
      <div className="mb-6 flex items-center justify-end">
        <RangeToggle range={range} onRangeChange={setRange} />
      </div>
      <TimelineBody range={range} resource={activity} />
    </Card>
  );
}

// The segmented range control. Stays visible across every state so the user can
// switch windows while one is loading or errored.
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

// Renders the correct state for the timeline. Kept separate so the Card shell stays
// simple and every state occupies the same footprint.
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

  const activity = resource.data?.ranges[range];
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

  // Keyed by range so switching windows remounts the chart and replays the draw-in.
  return <TimelineChart activity={activity} key={range} range={range} />;
}

// The loading placeholder: a caption line, a chart-sized block, and an axis line, at
// the same footprint the real chart uses so nothing jumps when the data lands.
function TimelineSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-64" />
      <Skeleton className="mt-6 h-40 w-full rounded-md" />
      <Skeleton className="mt-3 h-3 w-full" />
    </div>
  );
}

type DateStyle = "dayMonth" | "monthYear" | "full";

// Formats a UTC ISO date (YYYY-MM-DD). timeZone: "UTC" keeps the label on the date
// the backend bucketed on, regardless of the viewer's local zone.
function formatDate(iso: string, style: DateStyle): string {
  const options: Intl.DateTimeFormatOptions = { month: "short", timeZone: "UTC" };
  if (style === "dayMonth") {
    options.day = "numeric";
  } else if (style === "monthYear") {
    options.year = "numeric";
  } else {
    options.day = "numeric";
    options.year = "numeric";
  }
  return new Intl.DateTimeFormat("en-US", options).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

// The point whose dot is currently hovered. x/y are the dot's pixel coordinates
// within the chart's SVG, used to anchor the tooltip directly over that dot.
type HoverPoint = { x: number; y: number; date: string; commits: number };

// A single data-point marker. Recharts injects cx/cy/payload when it renders this as
// the Area's `dot`. The visible dot grows while hovered; a larger transparent circle
// on top provides a comfortable hit area so the tooltip only opens when the pointer
// is actually over a point — never trailing the cursor across the whole chart.
function CommitDot({
  cx,
  cy,
  payload,
  hoveredDate,
  onEnter,
  onLeave,
}: {
  cx?: number;
  cy?: number;
  payload?: { date: string; commits: number };
  hoveredDate: string | null;
  onEnter: (point: HoverPoint) => void;
  onLeave: () => void;
}) {
  if (cx == null || cy == null || !payload) {
    return null;
  }

  const isHovered = payload.date === hoveredDate;
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        fill="var(--color-commits)"
        r={isHovered ? DOT_HOVER_RADIUS : DOT_RADIUS}
      />
      <circle
        cx={cx}
        cy={cy}
        fill="transparent"
        onMouseEnter={() =>
          onEnter({ x: cx, y: cy, date: payload.date, commits: payload.commits })
        }
        onMouseLeave={onLeave}
        r={DOT_HIT_RADIUS}
        style={{ cursor: "pointer" }}
      />
    </g>
  );
}

// The rendered chart. The area/line draws in when it scrolls into view (Recharts
// animates on mount, so the chart is only mounted once in view). Each data point has
// its own dot; hovering a dot opens a tooltip anchored to it with the exact count and
// date. The curve is `monotone`, so it never overshoots below the data — the line
// stays flat at zero across empty stretches instead of dipping off the chart.
function TimelineChart({
  activity,
  range,
}: {
  activity: CommitActivityTimeline;
  range: CommitActivityRange;
}) {
  const { buckets, totalCommits, intervalLabel } = activity;

  const rangeNoun =
    RANGES.find((option) => option.id === range)?.noun ?? "the last year";
  const axisStyle: DateStyle = range === "month" ? "dayMonth" : "monthYear";

  const data = buckets.map((bucket) => ({
    date: bucket.periodStart,
    commits: bucket.commitCount,
  }));

  const containerRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(containerRef, { once: true, amount: 0.3 });
  // Mount the chart (and thus start Recharts' draw animation) only once it scrolls
  // into view; under reduced motion, render immediately with no animation.
  const shouldRender = inView || !!reduce;

  // The dot the pointer is currently over. Only a direct dot hover sets this, so the
  // tooltip stays pinned to that point rather than following the cursor.
  const [hovered, setHovered] = useState<HoverPoint | null>(null);

  return (
    <div ref={containerRef}>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {numberFormatter.format(totalCommits)}
        </span>{" "}
        commits over {rangeNoun} · each point spans {intervalLabel}
      </p>

      <div className="relative mt-6 h-40">
        {shouldRender ? (
          <>
            <ChartContainer
              className="aspect-auto h-full w-full"
              config={chartConfig}
            >
              <AreaChart
                accessibilityLayer
                data={data}
                margin={{ left: 4, right: 4, top: 8, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="fill-commits" x1="0" x2="0" y1="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-commits)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-commits)"
                      stopOpacity={0.04}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="date"
                  minTickGap={40}
                  tickFormatter={(value: string) => formatDate(value, axisStyle)}
                  tickLine={false}
                  tickMargin={8}
                />
                <Area
                  activeDot={false}
                  animationDuration={reduce ? 0 : LINE_DRAW_MS}
                  animationEasing="ease-in-out"
                  dataKey="commits"
                  dot={
                    <CommitDot
                      hoveredDate={hovered?.date ?? null}
                      onEnter={setHovered}
                      onLeave={() => setHovered(null)}
                    />
                  }
                  fill="url(#fill-commits)"
                  isAnimationActive={!reduce}
                  stroke="var(--color-commits)"
                  strokeWidth={2}
                  type="monotone"
                />
              </AreaChart>
            </ChartContainer>

            {hovered ? (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
                style={{ left: hovered.x, top: hovered.y - TOOLTIP_OFFSET_PX }}
              >
                <div className="font-medium text-foreground">
                  {formatDate(hovered.date, "full")}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                  <span
                    aria-hidden
                    className="size-2 rounded-[2px] bg-[var(--color-brand)]"
                  />
                  Commits
                  <span className="ml-2 font-mono font-medium tabular-nums text-foreground">
                    {numberFormatter.format(hovered.commits)}
                  </span>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div aria-hidden className="h-full w-full" />
        )}
      </div>

    </div>
  );
}
