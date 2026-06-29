"use client";

import { useTechStack } from "@/lib/tech-stack-context";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import { TechStackNodes, TECH_TILE_WIDTH } from "@/components/tech-stack-nodes";

// The detected tech stack as its own section card, matching the "Files we read"
// and "Repository structure" sections (an <h2> heading lives in the page; this
// supplies the card chrome and content). Clicking a technology opens its evidence
// in a popover. The stack comes from the shared TechStackProvider — the same
// single fetch the overview card's icon cloud reads — so the GitHub-backed
// detection runs only once per repo.
export function TechStackCard() {
  const { data, error, isLoading, reload } = useTechStack();

  if (isLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-4 w-2/5" />
        <div className="mt-4 flex flex-wrap justify-start gap-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <Skeleton
              key={item}
              className="h-28"
              style={{ width: TECH_TILE_WIDTH }}
            />
          ))}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Stack detection unavailable"
        message={error}
        onRetry={reload}
      />
    );
  }

  if (!data || data.technologies.length === 0) {
    return (
      <EmptyState
        title="No stack detected yet"
        description="RepoFrame did not find stack evidence in the ranked README, dependency, configuration, or source-path signals for this repository."
      />
    );
  }

  return (
    <Card beam className="p-6">
      <p className="text-sm text-muted-foreground">
        What your project is built with. Select any technology to see the
        evidence we found.
      </p>
      <div className="mt-4">
        <TechStackNodes technologies={data.technologies} />
      </div>
    </Card>
  );
}
