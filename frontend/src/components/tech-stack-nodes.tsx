"use client";

import { Popover } from "radix-ui";
import { X } from "lucide-react";

import {
  type DetectedTechnology,
  type TechStackEvidence,
} from "@/lib/repo-api";
import { TechGlyph } from "@/components/tech-glyph";

type TechStackNodesProps = {
  technologies: DetectedTechnology[];
};

// Fixed width of each technology tile. Exported so the parent's loading skeleton
// can reserve the same footprint. Tune this to trade tile size vs. per-row count.
export const TECH_TILE_WIDTH = "10rem";

// The detected technologies as a left-aligned, wrapping row of compact tiles.
// Presentational only — the parent owns fetching and the loading/error/empty
// states. Clicking a tile opens its source evidence in an anchored popover rather
// than expanding the tile, so the grid stays a clean, stable wall of cards.
export function TechStackNodes({ technologies }: TechStackNodesProps) {
  return (
    <ul className="flex flex-wrap items-start justify-start gap-3">
      {technologies.map((technology) => (
        <TechStackItem key={technology.name} technology={technology} />
      ))}
    </ul>
  );
}

type TechStackItemProps = {
  technology: DetectedTechnology;
};

// One technology tile. The whole tile is the popover trigger (like the solo/team
// choices): pressing it opens a small popup anchored to the tile that lists the
// detector's source evidence. Radix wires the trigger/content aria automatically
// and closes the popup on outside-click or Escape.
function TechStackItem({ technology }: TechStackItemProps) {
  return (
    <li style={{ width: TECH_TILE_WIDTH }}>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="flex w-full cursor-pointer flex-col rounded-md border bg-muted/40 p-3 text-center transition-colors hover:border-foreground/30 hover:bg-accent/50 data-[state=open]:border-foreground/30 data-[state=open]:bg-accent/50"
          >
            <span className="mx-auto flex size-10 items-center justify-center rounded-md border bg-card">
              <TechGlyph name={technology.name} size={22} decorative />
            </span>
            <span className="mt-2 break-words text-sm font-semibold text-foreground">
              {technology.name}
            </span>
            <span className="mt-0.5 text-xs text-muted-foreground">
              {technology.category}
            </span>
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
                <p className="break-words text-sm font-semibold text-foreground">
                  {technology.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {technology.category}
                </p>
              </div>
              <Popover.Close
                aria-label="Close evidence"
                className="-mr-1 -mt-1 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </Popover.Close>
            </div>

            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto text-left">
              {technology.evidence.map((evidence) => (
                <EvidenceDetail
                  evidence={evidence}
                  key={getEvidenceKey(evidence)}
                />
              ))}
            </ul>

            <Popover.Arrow className="fill-border" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </li>
  );
}

type EvidenceDetailProps = {
  evidence: TechStackEvidence;
};

// One evidence row inside the popover. break-words keeps long, unbreakable file
// paths (in either the detail text or the path line) inside the popup instead of
// overflowing it.
function EvidenceDetail({ evidence }: EvidenceDetailProps) {
  return (
    <li className="break-words rounded-md border bg-card px-3 py-2 text-sm leading-6 text-muted-foreground">
      <span className="font-semibold text-foreground">{evidence.source}</span>
      {": "}
      <span>{evidence.detail}</span>
      {evidence.path ? (
        <span className="mt-1 block break-words font-mono text-xs text-muted-foreground">
          {evidence.path}
        </span>
      ) : null}
    </li>
  );
}

// Creates a stable key from backend evidence fields without relying on array
// position, which may change as the detector gains more rules.
function getEvidenceKey(evidence: TechStackEvidence) {
  return `${evidence.source}-${evidence.detail}-${evidence.path ?? ""}`;
}
