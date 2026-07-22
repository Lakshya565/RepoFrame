"use client";

import { useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import type {
  CommitActivityRange,
  CommitActivityTimeline,
} from "@/lib/repo-api";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

const LINE_DRAW_MS = 2000;
const DOT_RADIUS = 3.5;
const DOT_HOVER_RADIUS = 5;
const DOT_HIT_RADIUS = 12;
const TOOLTIP_OFFSET_PX = 12;
const numberFormatter = new Intl.NumberFormat("en-US");

const chartConfig = {
  commits: { label: "Commits", color: "var(--color-brand)" },
} satisfies ChartConfig;

type DateStyle = "dayMonth" | "monthYear" | "full";

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

type HoverPoint = { x: number; y: number; date: string; commits: number };

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

  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        fill="var(--color-commits)"
        r={payload.date === hoveredDate ? DOT_HOVER_RADIUS : DOT_RADIUS}
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

// Loaded as a separate client chunk only after commit data exists. Recharts is
// therefore absent from the Analysis route's initial JavaScript bundle.
export function CommitTimelineChart({
  activity,
  range,
}: {
  activity: CommitActivityTimeline;
  range: CommitActivityRange;
}) {
  const { buckets, totalCommits, intervalLabel } = activity;
  const rangeNoun = range === "month" ? "the last month" : "the last year";
  const axisStyle: DateStyle = range === "month" ? "dayMonth" : "monthYear";
  const data = buckets.map((bucket) => ({
    date: bucket.periodStart,
    commits: bucket.commitCount,
  }));

  const containerRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(containerRef, { once: true, amount: 0.3 });
  const [hovered, setHovered] = useState<HoverPoint | null>(null);
  const shouldRender = inView || !!reduce;

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
