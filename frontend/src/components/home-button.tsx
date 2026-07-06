"use client";

import { Home as HomeIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────────
// Tunable Home-button settings — single source of truth. Edit here to retune
// the hover pop without touching markup.
// ───────────────────────────────────────────────────────────────────────────

// House icon size (px).
const ICON_SIZE = 16;
// How long (ms) the house icon takes to pop in / collapse out on hover.
const HOVER_REVEAL_MS = 300;
// Easing for the pop — expo-out, so it springs in and settles.
const HOVER_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

type HomeButtonProps = {
  className?: string;
};

// The top-left "Home" control. At rest it's just the word "Home"; on hover a
// house icon pops up (scales + rises) into the space before the label. Clicking
// does a full-page load to "/" so it always lands on a fresh landing page rather
// than a cached client nav. The pop is pure CSS group-hover and is disabled under
// prefers-reduced-motion.
export function HomeButton({ className }: HomeButtonProps) {
  return (
    <button
      type="button"
      aria-label="Home — reload RepoFrame"
      onClick={() => window.location.assign("/")}
      className={cn(
        // The border sits on the button itself, so as the house icon pops in and
        // widens the button the rectangle resizes with it. `transition-colors`
        // animates the border to brand green on hover.
        "group relative -ml-2 inline-flex cursor-pointer items-center rounded-md border border-border px-2 py-1 text-sm font-medium tracking-tight transition-colors hover:border-brand hover:text-brand",
        className,
      )}
    >
      {/* House icon: collapsed (zero-width, scaled down) at rest, pops up and
          opens a gap before the label on hover. */}
      <span
        aria-hidden
        className="grid w-0 -translate-y-1 scale-0 place-items-center overflow-hidden opacity-0 transition-all group-hover:mr-1.5 group-hover:w-4 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 motion-reduce:transition-none"
        style={{
          transitionDuration: `${HOVER_REVEAL_MS}ms`,
          transitionTimingFunction: HOVER_EASE,
        }}
      >
        <HomeIcon style={{ width: ICON_SIZE, height: ICON_SIZE }} />
      </span>
      Home
    </button>
  );
}
