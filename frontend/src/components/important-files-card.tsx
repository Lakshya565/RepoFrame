"use client";

import { Popover } from "radix-ui";
import { File, X } from "lucide-react";

import { type RankedRepoFile } from "@/lib/repo-api";
import { useRepoAnalysis } from "@/lib/analysis-context";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";

type ImportantFilesCardProps = {
  repoUrl: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

// Shows the deterministic Phase 5 file selections. These are the files
// RepoFrame considers most useful for later evidence gathering and generation.
export function ImportantFilesCard({ repoUrl }: ImportantFilesCardProps) {
  void repoUrl;
  const {
    ranking: { data: ranking, error, isLoading, reload },
  } = useRepoAnalysis();

  if (isLoading) {
    return (
      <Card className="space-y-3 p-6">
        <Skeleton className="h-4 w-2/5" />
        <div className="flex flex-wrap gap-2.5">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
            <Skeleton key={item} className="h-9 w-28" />
          ))}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="File ranking unavailable"
        message={error}
        onRetry={reload}
      />
    );
  }

  if (!ranking || ranking.rankedFiles.length === 0) {
    return (
      <EmptyState
        title="No files ranked yet"
        description="RepoFrame did not find rankable source, README, or configuration files in this repository tree."
      />
    );
  }

  // Per-file chip labels: a bare filename when it's unique, or the smallest
  // trailing path that distinguishes files that share a name (see helper).
  const fileLabels = buildFileLabels(ranking.rankedFiles.map((file) => file.path));

  return (
    <Card beam className="p-6">
      <p className="text-sm text-muted-foreground">
        We focused on {numberFormatter.format(ranking.returnedFiles)} of{" "}
        {numberFormatter.format(ranking.totalFiles)} files to understand your
        project.
      </p>

      <ul className="mt-4 flex flex-wrap items-start justify-start gap-2.5">
        {ranking.rankedFiles.map((file) => {
          const label = fileLabels.get(file.path);
          return (
            <ImportantFileTile
              file={file}
              name={label?.name ?? file.path}
              context={label?.context ?? ""}
              key={file.path}
            />
          );
        })}
      </ul>
    </Card>
  );
}

type ImportantFileTileProps = {
  file: RankedRepoFile;
  // Filename to show prominently on the chip.
  name: string;
  // Disambiguating parent path shown muted after the name; empty when the
  // filename is already unique among the ranked files.
  context: string;
};

// One ranked file as a compact, content-width chip. It shows the filename and,
// only when another ranked file shares that name, a muted trailing path fragment
// to tell them apart. Clicking it opens an anchored popover with the full path and
// the human-readable reasons it was chosen (the same popover pattern as the
// tech-stack tiles). The internal importance score is intentionally not shown — it
// reads as developer detail rather than something a visitor needs. Radix wires the
// trigger/content aria and closes on outside-click or Escape.
function ImportantFileTile({ file, name, context }: ImportantFileTileProps) {
  return (
    <li>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="inline-flex max-w-[16rem] cursor-pointer items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 transition-colors hover:border-foreground/30 hover:bg-accent/50 data-[state=open]:border-foreground/30 data-[state=open]:bg-accent/50"
          >
            <File className="size-4 shrink-0 text-muted-foreground" />
            <span className="shrink-0 whitespace-nowrap font-mono text-sm font-medium text-foreground">
              {name}
            </span>
            {context ? (
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                {context}
              </span>
            ) : null}
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="center"
            sideOffset={8}
            collisionPadding={16}
            className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-3 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words font-mono text-sm font-semibold text-foreground">
                  {name}
                </p>
                <p className="mt-0.5 break-words font-mono text-xs text-muted-foreground">
                  {file.path}
                </p>
              </div>
              <Popover.Close
                aria-label="Close file detail"
                className="-mr-1 -mt-1 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </Popover.Close>
            </div>

            <ul className="mt-3 space-y-1.5 text-sm leading-6 text-muted-foreground">
              {file.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>

            <Popover.Arrow className="fill-border" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </li>
  );
}

type FileLabel = { name: string; context: string };

// Builds a display label for each path that is just unique enough to read.
// Filenames that are unique across the ranked set show on their own; when two or
// more share a name, each grows by the fewest trailing path segments needed to
// become unique, and that extra parent path is returned as `context` (shown muted
// after the filename). The full path is always available in the popover.
function buildFileLabels(paths: string[]): Map<string, FileLabel> {
  const segments = paths.map((path) => path.split("/").filter(Boolean));
  const labels = new Map<string, FileLabel>();

  paths.forEach((path, index) => {
    const mine = segments[index];
    // Grow the trailing window until no other path shares the same suffix (or we
    // run out of segments, which only happens for an exact duplicate path).
    let depth = 1;
    while (depth < mine.length) {
      const suffix = mine.slice(-depth).join("/");
      const collides = segments.some(
        (other, otherIndex) =>
          otherIndex !== index && other.slice(-depth).join("/") === suffix,
      );
      if (!collides) {
        break;
      }
      depth += 1;
    }

    const chosen = mine.slice(-depth);
    labels.set(path, {
      name: chosen[chosen.length - 1] ?? path,
      context: chosen.slice(0, -1).join("/"),
    });
  });

  return labels;
}
