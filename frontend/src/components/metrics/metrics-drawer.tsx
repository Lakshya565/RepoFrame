"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Gauge, X } from "lucide-react";

import {
  fetchLifetimeUsage,
  fetchMetrics,
  type LifetimeUsage,
  type MetricsResponse,
} from "@/lib/repo-api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const numberFormatter = new Intl.NumberFormat("en-US");

// These metrics are backend-GLOBAL (not per-user), so the drawer is gated behind
// an env flag: on for local/dev builds, hidden in public builds until per-user
// metrics + auth exist (Phase 15+). NEXT_PUBLIC_* is inlined at build time.
const METRICS_ENABLED = process.env.NEXT_PUBLIC_SHOW_METRICS === "true";

// Public entry point. Renders nothing unless explicitly enabled, so it is safe to
// always mount in the root layout. The hooks live in the inner component so this
// gate can early-return before any hook runs.
export function MetricsDrawer() {
  if (!METRICS_ENABLED) {
    return null;
  }
  return <MetricsDrawerInner />;
}

function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

// Floating button + slide-in drawer that displays the read-only developer metrics
// the backend already records. It fetches both zero-cost endpoints on open (never
// on mount, so an idle landing page makes no backend calls) and re-fetches each
// time it is reopened so the numbers stay fresh.
function MetricsDrawerInner() {
  const reduce = useReducedMotion();
  const [open, setOpen] = React.useState(false);
  const [lifetime, setLifetime] = React.useState<LifetimeUsage | null>(null);
  const [metrics, setMetrics] = React.useState<MetricsResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Opens the drawer and pulls a fresh snapshot. Fetching lives in the click
  // handler (not an effect) so the data only loads on an explicit open.
  async function openDrawer() {
    setOpen(true);
    setLoading(true);
    setError(null);

    try {
      const [usage, snapshot] = await Promise.all([
        fetchLifetimeUsage(),
        fetchMetrics(),
      ]);
      setLifetime(usage);
      setMetrics(snapshot);
    } catch (caught) {
      setError(
        messageOf(caught, "RepoFrame could not load metrics. Is the backend running?"),
      );
    } finally {
      setLoading(false);
    }
  }

  // Lets Escape close the drawer, matching the scrim click. Only attaches the
  // listener while open; no state is set synchronously here.
  React.useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const counters = metrics?.counters ?? {};
  const llm = metrics?.latency.llm;
  const backend = metrics?.latency.backend;
  const requests = counters.requests ?? 0;
  const errorRate =
    requests > 0 ? `${((counters.errors ?? 0) / requests) * 100}`.slice(0, 4) : "0";

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        aria-label="Open developer metrics"
        onClick={openDrawer}
        className="fixed bottom-5 right-5 z-40 rounded-full bg-card shadow-sm"
      >
        <Gauge />
      </Button>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.2 }}
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <motion.aside
              role="dialog"
              aria-label="Developer metrics"
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l bg-card"
              initial={{ x: reduce ? 0 : "100%" }}
              animate={{ x: 0 }}
              exit={{ x: reduce ? 0 : "100%" }}
              transition={{ duration: reduce ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <header className="flex items-center justify-between border-b px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold">Developer metrics</h2>
                  <p className="text-xs text-muted-foreground">
                    Read-only — recorded by the backend.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close metrics"
                  onClick={() => setOpen(false)}
                >
                  <X />
                </Button>
              </header>

              <div className="flex-1 overflow-auto px-5 py-5">
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : error ? (
                  <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {error}
                  </p>
                ) : (
                  <div className="space-y-6">
                    <MetricGroup title="Tokens" scope="lifetime">
                      <MetricRow label="Prompt" value={lifetime?.promptTokens ?? 0} open={open} />
                      <MetricRow label="Completion" value={lifetime?.completionTokens ?? 0} open={open} />
                      <MetricRow label="Reasoning" value={lifetime?.reasoningTokens ?? 0} open={open} />
                      <MetricRow label="Total" value={lifetime?.totalTokens ?? 0} open={open} emphasis />
                      <MetricRow label="Runs" value={lifetime?.runs ?? 0} open={open} />
                    </MetricGroup>

                    <MetricGroup title="Activity" scope="since restart">
                      <MetricRow label="Repos analyzed" value={counters.repos_analyzed ?? 0} open={open} />
                      <MetricRow label="Files scanned" value={counters.files_scanned ?? 0} open={open} />
                      <MetricRow label="Files selected" value={counters.files_selected ?? 0} open={open} />
                      <MetricRow label="Outputs generated" value={counters.outputs_generated ?? 0} open={open} />
                    </MetricGroup>

                    <MetricGroup title="Claim quality" scope="since restart">
                      <MetricRow label="Verified" value={counters.claims_verified ?? 0} open={open} />
                      <MetricRow label="Supported" value={counters.claims_supported ?? 0} open={open} />
                      <MetricRow label="Partially supported" value={counters.claims_partially_supported ?? 0} open={open} />
                      <MetricRow label="Needs confirmation" value={counters.claims_needs_confirmation ?? 0} open={open} />
                      <MetricRow label="Unsupported" value={counters.claims_unsupported ?? 0} open={open} />
                    </MetricGroup>

                    <MetricGroup title="Reliability" scope="since restart">
                      <MetricRow label="Requests" value={requests} open={open} />
                      <MetricRow label="Errors" value={counters.errors ?? 0} open={open} />
                      <TextRow label="Error rate" value={`${errorRate}%`} />
                      <TextRow
                        label="LLM latency (avg / max)"
                        value={`${Math.round(llm?.avg_ms ?? 0)} / ${Math.round(llm?.max_ms ?? 0)} ms`}
                      />
                      <TextRow
                        label="Backend latency (avg / max)"
                        value={`${Math.round(backend?.avg_ms ?? 0)} / ${Math.round(backend?.max_ms ?? 0)} ms`}
                      />
                    </MetricGroup>
                  </div>
                )}
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}

// A titled group of metric rows. The scope tag spells out whether the numbers are
// persistent ("lifetime") or in-memory ("since restart"), so the two are never
// confused.
function MetricGroup({
  title,
  scope,
  children,
}: {
  title: string;
  scope: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {scope}
        </span>
      </div>
      <dl className="mt-2 divide-y rounded-md border">{children}</dl>
    </section>
  );
}

// One numeric metric row with a count-up value on open.
function MetricRow({
  label,
  value,
  open,
  emphasis = false,
}: {
  label: string;
  value: number;
  open: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-mono text-sm tabular-nums",
          emphasis ? "font-semibold text-foreground" : "text-foreground",
        )}
      >
        <CountUp value={value} active={open} />
      </dd>
    </div>
  );
}

// One text metric row (latency, rates) — no count-up since the value isn't a
// plain integer.
function TextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

// Animates a number from 0 up to its value when the drawer opens. Honors reduced
// motion (renders the final value immediately) and only updates state inside the
// rAF callback, never synchronously in the effect body.
function CountUp({ value, active }: { value: number; active: boolean }) {
  const reduce = useReducedMotion();
  const shouldAnimate = active && !reduce && value > 0;
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    if (!shouldAnimate) {
      return;
    }
    let raf = 0;
    const start = performance.now();
    const duration = 600;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, shouldAnimate]);

  return <>{numberFormatter.format(shouldAnimate ? display : value)}</>;
}
