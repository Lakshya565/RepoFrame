"use client";

import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import { Marquee } from "@/components/ui/marquee";
import { MARQUEE_ICONS, type MarqueeIcon } from "@/lib/marquee-icons";

// ───────────────────────────────────────────────────────────────────────────
// Tunable marquee settings — single source of truth.
// ───────────────────────────────────────────────────────────────────────────

// Logo glyph size (px) and the transparent square slot it sits in. The slot
// keeps a uniform rhythm despite logos having different aspect ratios; it has no
// background, border, or shadow, so the logos read as floating.
const LOGO_SIZE_PX = 28;
const TILE_SIZE_PX = 58;

// Gap between consecutive logos in a rail.
const TILE_GAP = "2rem";

// One full scroll cycle (s). Larger = slower, calmer drift.
const MARQUEE_DURATION_S = 60;

// Width reserved for each side rail. Kept narrow so it hugs the screen edge and
// never crowds the centered max-w-3xl content column.
const RAIL_WIDTH = "6.5rem";

// Height of the "portal" fade at the top and bottom of each rail, where chips
// dissolve in and out of view (a soft mask, not a hard cut).
const PORTAL_FADE = "10rem";

// PHASE TOGGLE. Phase 1 (current): false → every logo renders in its real brand
// color. Phase 2 (after the user approves phase 1): set true to recolor every
// logo with the RepoFrame brand green. Because each logo is a single-color path,
// this one flag is the only change needed — see marquee-icons.ts.
const USE_BRAND_GREEN = true;

// Resolves the fill color for a logo under the current phase.
function iconColor(icon: MarqueeIcon): string {
  return USE_BRAND_GREEN ? "var(--brand)" : `#${icon.hex}`;
}

// A single logo floating with no chip/background — just the brand-green glyph on
// the bare page. Centered inside a fixed transparent slot so the column keeps an
// even rhythm regardless of each logo's aspect ratio. Decorative, so it is
// aria-hidden at the rail level; `title` still gives a hover tooltip on the
// desktop where these rails are shown.
function FloatingLogo({ icon }: { icon: MarqueeIcon }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ width: TILE_SIZE_PX, height: TILE_SIZE_PX }}
      title={icon.title}
    >
      <svg
        role="img"
        viewBox="0 0 24 24"
        width={LOGO_SIZE_PX}
        height={LOGO_SIZE_PX}
        fill={iconColor(icon)}
      >
        <path d={icon.path} />
      </svg>
    </div>
  );
}

// One vertical rail pinned to a screen edge. `reverse` flips the scroll
// direction: the left rail scrolls up (default), the right rail scrolls down.
// The mask creates the portal fade at both ends.
function Rail({
  side,
  icons,
  reverse,
}: {
  side: "left" | "right";
  icons: MarqueeIcon[];
  reverse: boolean;
}) {
  const portalMask = `linear-gradient(to bottom, transparent, #000 ${PORTAL_FADE}, #000 calc(100% - ${PORTAL_FADE}), transparent)`;

  return (
    <div
      className={cn(
        "absolute inset-y-0 flex justify-center",
        side === "left" ? "left-0" : "right-0",
      )}
      style={{ width: RAIL_WIDTH }}
    >
      <Marquee
        vertical
        reverse={reverse}
        repeat={3}
        className="h-full"
        style={{
          ["--gap" as string]: TILE_GAP,
          ["--duration" as string]: `${MARQUEE_DURATION_S}s`,
          maskImage: portalMask,
          WebkitMaskImage: portalMask,
        }}
      >
        {icons.map((icon) => (
          <FloatingLogo key={icon.title} icon={icon} />
        ))}
      </Marquee>
    </div>
  );
}

// Two ambient logo rails flanking the page: AI companies and programming
// languages drifting past on each edge. The pool is split by index so each rail
// shows a distinct, balanced slice (no mirrored duplication). Rendered only on
// wide screens (lg+) where the centered content leaves room at the edges, and
// skipped entirely under prefers-reduced-motion since the motion is decorative.
export function BrandMarqueeRails() {
  const reduce = useReducedMotion();
  if (reduce) {
    return null;
  }

  const leftIcons = MARQUEE_ICONS.filter((_, index) => index % 2 === 0);
  const rightIcons = MARQUEE_ICONS.filter((_, index) => index % 2 === 1);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-y-0 left-0 right-0 z-0 hidden lg:block"
    >
      <Rail side="left" icons={leftIcons} reverse={false} />
      <Rail side="right" icons={rightIcons} reverse />
    </div>
  );
}
