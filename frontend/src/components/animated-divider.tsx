import { cn } from "@/lib/utils";

// Seconds for one full left-to-right pass of the sheen. Slow enough to read as an
// ambient shimmer rather than a busy, attention-grabbing animation.
const DIVIDER_SHEEN_SECONDS = 3.5;

// A hairline divider for separating form sections. The plain `border-t` it
// replaces read too faint, so the resting line is a brand-tinted gradient
// (brightest in the middle, fading to nothing at the ends) and a brighter
// highlight sweeps across it on a slow loop — the shimmer technique Magic UI uses
// for its buttons, adapted to a 1px rule. The sweep is CSS-only (keyframe
// `divider-sheen` in globals.css) and hides under prefers-reduced-motion via
// `motion-reduce:hidden`, leaving the static gradient line.
export function AnimatedDivider({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative h-px w-full overflow-hidden bg-gradient-to-r from-transparent via-brand/40 to-transparent",
        className,
      )}
    >
      {/* The travelling highlight. Its `w-1/2` (half the track) is coupled to the
          keyframe's -100%->200% translate range, so it sweeps fully off one edge
          to the other. */}
      <div
        className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-brand to-transparent motion-reduce:hidden"
        style={{
          animation: `divider-sheen ${DIVIDER_SHEEN_SECONDS}s ease-in-out infinite`,
        }}
      />
    </div>
  );
}
