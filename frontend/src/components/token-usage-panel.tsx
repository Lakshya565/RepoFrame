"use client";

import { useEffect, useState } from "react";

import {
  fetchLifetimeUsage,
  type LifetimeUsage,
  type UsageTotals,
} from "@/lib/repo-api";
import { Card } from "@/components/ui/card";

const numberFormatter = new Intl.NumberFormat("en-US");

type TokenUsagePanelProps = {
  // Accumulated token usage for the current analysis session, summed by the
  // writeup orchestrator across every generation it has run.
  sessionUsage: UsageTotals;
  // Bumped by the parent after each generation so the lifetime total re-fetches.
  refreshSignal: number;
};

// Shows OpenAI token spend at two scopes so the user never has to open the OpenAI
// dashboard: this analysis session, and the persistent lifetime total the backend
// has recorded across all runs. Reasoning tokens are called out separately because
// that is where a reasoning model's cost mostly hides.
export function TokenUsagePanel({
  sessionUsage,
  refreshSignal,
}: TokenUsagePanelProps) {
  const [lifetime, setLifetime] = useState<LifetimeUsage | null>(null);

  // Refetches the lifetime total on mount and whenever the parent signals that a
  // generation just completed. Ignores the result if the component unmounted.
  useEffect(() => {
    let isCurrent = true;

    fetchLifetimeUsage()
      .then((data) => {
        if (isCurrent) {
          setLifetime(data);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setLifetime(null);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [refreshSignal]);

  return (
    <Card className="p-6">
      <h3 className="text-base font-semibold">Token usage</h3>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <UsageStat
          label="This session"
          total={sessionUsage.totalTokens}
          note={`${numberFormatter.format(sessionUsage.reasoningTokens)} reasoning`}
        />
        <UsageStat
          label="Lifetime"
          total={lifetime?.totalTokens ?? 0}
          note={
            lifetime
              ? `${numberFormatter.format(lifetime.runs)} runs`
              : "unavailable"
          }
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Counts tokens this RepoFrame backend has spent, not your whole OpenAI
        account — so it can differ from the OpenAI dashboard.
      </p>
    </Card>
  );
}

type UsageStatProps = {
  label: string;
  total: number;
  note: string;
};

// One total-tokens stat with a small secondary note (reasoning tokens or run
// count). Kept local since only this panel uses it.
function UsageStat({ label, total, note }: UsageStatProps) {
  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-mono text-lg font-semibold text-foreground">
        {numberFormatter.format(total)}
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          tokens
        </span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
