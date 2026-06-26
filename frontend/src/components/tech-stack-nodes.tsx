"use client";

import { useId, useState } from "react";

import {
  type DetectedTechnology,
  type TechStackEvidence,
} from "@/lib/repo-api";
import { TechGlyph } from "@/components/tech-glyph";

type TechStackNodesProps = {
  technologies: DetectedTechnology[];
};

// Fixed width of each technology tile. Exported so the parent's loading skeleton
// can reserve the same footprint. A centered flex-wrap of fixed-width tiles is
// what lets a partial last row center instead of left-packing (a CSS grid would
// align the final row to the start). Tune this to trade tile size vs. per-row
// count.
export const TECH_TILE_WIDTH = "10rem";

// The detected technologies as a centered, wrapping row of compact, clickable
// tiles. Presentational only — the parent owns fetching and the
// loading/error/empty states. items-start lets an opened tile grow downward
// without stretching its neighbours.
export function TechStackNodes({ technologies }: TechStackNodesProps) {
  return (
    <ul className="flex flex-wrap items-start justify-center gap-3">
      {technologies.map((technology) => (
        <TechStackItem key={technology.name} technology={technology} />
      ))}
    </ul>
  );
}

type TechStackItemProps = {
  technology: DetectedTechnology;
};

// One technology tile. The entire tile is a button (like the solo/team choices):
// pressing it toggles that technology's source evidence open beneath it. Only
// phrasing content (spans) lives inside the button so the markup stays valid; the
// evidence list is a sibling, wired to the button via aria-controls/aria-expanded.
function TechStackItem({ technology }: TechStackItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const evidenceId = useId();

  return (
    <li style={{ width: TECH_TILE_WIDTH }}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={evidenceId}
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full cursor-pointer flex-col rounded-md border bg-muted/40 p-3 text-center transition-colors hover:border-foreground/30 hover:bg-accent/50"
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
        <span className="mt-2 text-xs font-medium text-brand">
          {isOpen ? "Click to hide evidence" : "Click to view evidence"}
        </span>
      </button>

      {isOpen ? (
        <ul id={evidenceId} className="mt-2 space-y-2 text-left">
          {technology.evidence.map((evidence) => (
            <EvidenceDetail evidence={evidence} key={getEvidenceKey(evidence)} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

type EvidenceDetailProps = {
  evidence: TechStackEvidence;
};

// One evidence row, revealed when a tile is opened. break-words on the row keeps
// long, unbreakable file paths (in either the detail text or the path line) inside
// the tile instead of overflowing it.
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
