"use client";

import { ExternalLink } from "lucide-react";

import {
  fetchRepoMetadata,
  fetchTechStack,
  type DetectedTechnology,
  type RepoMetadataResponse,
  type TechStackResponse,
} from "@/lib/repo-api";
import { useRepoResource, type RepoResource } from "@/lib/use-repo-resource";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TechIconCloud } from "@/components/tech-icon-cloud";
import { TechStackNodes } from "@/components/tech-stack-nodes";

type RepoOverviewCardProps = {
  repoUrl: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

const METADATA_ERROR = "RepoFrame could not fetch repository metadata.";
const TECH_STACK_ERROR = "RepoFrame could not detect the repository tech stack.";

// The single "overview" card for the Analysis tab. It unifies what used to be two
// separate cards: the repository summary and the icon cloud sit side by side on
// top (roughly equal halves on desktop), with the clickable technology nodes
// spanning the full width below. Repo metadata and the tech stack are two
// independent fetches, so each region carries its own loading/error/empty state
// inside the one shared card — there is no card-inside-a-card nesting.
export function RepoOverviewCard({ repoUrl }: RepoOverviewCardProps) {
  const metadata = useRepoResource(repoUrl, fetchRepoMetadata, METADATA_ERROR);
  const techStack = useRepoResource(repoUrl, fetchTechStack, TECH_STACK_ERROR);

  return (
    <Card beam className="p-6">
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <RepoSummarySection resource={metadata} />
        <TechCloudSection
          technologies={techStack.data?.technologies ?? null}
          isLoading={techStack.isLoading}
        />
      </div>

      <div className="mt-8">
        <h3 className="text-base font-semibold">Tech stack</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          What your project is built with. Select any technology to see the
          evidence we found.
        </p>
        <div className="mt-4">
          <TechNodesSection resource={techStack} />
        </div>
      </div>
    </Card>
  );
}

// Top-left: the repository summary (title, description, key stats), with the same
// hover highlight on each stat tile as the rest of the analysis surfaces.
function RepoSummarySection({
  resource,
}: {
  resource: RepoResource<RepoMetadataResponse>;
}) {
  if (resource.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-[68px]" />
          ))}
        </div>
      </div>
    );
  }

  if (resource.error) {
    return (
      <ErrorState
        title="Repository metadata unavailable"
        message={resource.error}
        onRetry={resource.reload}
      />
    );
  }

  const metadata = resource.data;
  if (!metadata) {
    return (
      <p className="text-sm text-muted-foreground">
        No repository metadata was returned.
      </p>
    );
  }

  const summaryFields = [
    { label: "Default branch", value: metadata.defaultBranch },
    { label: "Stars", value: numberFormatter.format(metadata.stars) },
    { label: "Forks", value: numberFormatter.format(metadata.forks) },
    ...(metadata.language
      ? [{ label: "Primary language", value: metadata.language }]
      : []),
  ];

  return (
    <div>
      <div className="flex flex-col items-start gap-3">
        <h3 className="break-words text-lg font-semibold">
          {metadata.owner}/{metadata.name}
        </h3>
        <a
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          href={metadata.htmlUrl}
          rel="noreferrer"
          target="_blank"
        >
          Open repository
          <ExternalLink />
        </a>
      </div>

      {metadata.description ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {metadata.description}
        </p>
      ) : null}

      <dl className="mt-5 grid grid-cols-2 gap-3">
        {summaryFields.map((field) => (
          <div
            className="rounded-md border bg-muted/40 p-4 transition-colors hover:border-foreground/30 hover:bg-accent/50"
            key={field.label}
          >
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {field.label}
            </dt>
            <dd className="mt-1.5 break-words font-mono text-sm text-foreground">
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Top-right: the interactive 3D icon cloud of the detected technologies. While the
// stack is still loading it reserves the same square footprint with a skeleton, so
// the row does not jump. On error/empty it renders nothing — the nodes section
// below surfaces the message in one place.
function TechCloudSection({
  technologies,
  isLoading,
}: {
  technologies: DetectedTechnology[] | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="mx-auto aspect-square w-full max-w-[340px]">
        <Skeleton className="h-full w-full rounded-full" />
      </div>
    );
  }

  if (!technologies || technologies.length === 0) {
    return null;
  }

  return (
    <TechIconCloud techNames={technologies.map((technology) => technology.name)} />
  );
}

// Bottom: the clickable technology nodes, plus the stack's loading/error/empty
// states (which also cover the cloud above, since both read the same fetch).
function TechNodesSection({
  resource,
}: {
  resource: RepoResource<TechStackResponse>;
}) {
  if (resource.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-28" />
        ))}
      </div>
    );
  }

  if (resource.error) {
    return (
      <ErrorState
        title="Stack detection unavailable"
        message={resource.error}
        onRetry={resource.reload}
      />
    );
  }

  const stack = resource.data;
  if (!stack || stack.technologies.length === 0) {
    return (
      <EmptyState
        title="No stack detected yet"
        description="RepoFrame did not find stack evidence in the ranked README, dependency, configuration, or source-path signals for this repository."
      />
    );
  }

  return <TechStackNodes technologies={stack.technologies} />;
}
