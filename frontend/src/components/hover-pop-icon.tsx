import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// A button icon that stays hidden at rest and "pops" in on hover — the same
// interaction the Home control uses (see home-button.tsx), so the header's controls
// share one motion language. Place it as the first child of a `group`ed Button whose
// default gap is removed (`className="group gap-0"`); the icon opens its own gap
// before the label on hover. Collapsed to zero width at rest so it takes no space
// until revealed. Disabled under prefers-reduced-motion.

// Tunable pop settings, matched to the Home button's feel — single source of truth.
const POP_REVEAL_MS = 300;
// Expo-out: springs in and settles.
const POP_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

export function HoverPopIcon({
  children,
  className,
  // Which side of the label the icon sits on. "start" (default) opens a gap after
  // itself (a leading icon); "end" opens a gap before itself (a trailing icon, e.g.
  // a "View the demo →" arrow).
  side = "start",
}: {
  children: ReactNode;
  className?: string;
  side?: "start" | "end";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid w-0 -translate-y-1 scale-0 place-items-center overflow-hidden opacity-0 transition-all group-hover:w-4 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 motion-reduce:transition-none",
        side === "start" ? "group-hover:mr-1.5" : "group-hover:ml-1.5",
        className,
      )}
      style={{
        transitionDuration: `${POP_REVEAL_MS}ms`,
        transitionTimingFunction: POP_EASE,
      }}
    >
      {children}
    </span>
  );
}
