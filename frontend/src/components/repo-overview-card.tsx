"use client";

import { ExternalLink } from "lucide-react";

import {
  fetchRepoMetadata,
  type DetectedTechnology,
  type RepoMetadataResponse,
} from "@/lib/repo-api";
import { useRepoResource, type RepoResource } from "@/lib/use-repo-resource";
import { useTechStack } from "@/lib/tech-stack-context";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TechIconCloud } from "@/components/tech-icon-cloud";

type RepoOverviewCardProps = {
  repoUrl: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

const METADATA_ERROR = "RepoFrame could not fetch repository metadata.";

// The repository "overview" hero card for the Analysis tab: the repository
// summary and the tech-stack icon cloud sit side by side (roughly equal halves on
// desktop). Repo metadata is fetched here; the tech stack comes from the shared
// TechStackProvider (the same single fetch the Tech stack section below uses), so
// the GitHub-backed detection only runs once. The clickable technology nodes live
// in their own "Tech stack" section below this card (see TechStackCard).
export function RepoOverviewCard({ repoUrl }: RepoOverviewCardProps) {
  const metadata = useRepoResource(repoUrl, fetchRepoMetadata, METADATA_ERROR);
  const techStack = useTechStack();

  return (
    <Card beam className="p-6">
      {/* Top split is summary-weighted (the cloud caps at 340px, so an even 50/50
          left its half looking empty); the wider gap keeps the two sides distinct. */}
      <div className="grid items-start gap-8 lg:grid-cols-[3fr_2fr]">
        <RepoSummarySection resource={metadata} />
        <TechCloudSection
          technologies={techStack.data?.technologies ?? null}
          isLoading={techStack.isLoading}
        />
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
