"use client";

import * as React from "react";
import { createPortal, flushSync } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────────
// Tunable toggle settings — single source of truth. Edit these to retune the
// toggle's feel without hunting through className strings.
// ───────────────────────────────────────────────────────────────────────────

// Edge length (px) of the lucide sun/moon glyphs (resting size and the float
// size, before the expand grows them).
const ICON_SIZE = 16;

// Width (px) the hidden "target" icon slot grows to when revealed on hover. It
// needs to fit the preview chip (icon + its padding + the gap from the current
// icon); bump it if you enlarge ICON_SIZE or the chip padding.
const TARGET_SLOT_PX = 30;

// Hover reveal speed (ms) — how fast the second icon slides/fades in.
const HOVER_REVEAL_MS = 300;

// Theme-switch animation timing (single source of truth). On click, the
// target-theme glyph floats from the toggle's corner to screen center, then
// grows to fill the screen. The float is intentionally a touch slower than the
// expand, and the total stays well under 1.5s.
const FLOAT_MS = 400;
const EXPAND_MS = 300;
// Float arrives gently (ease-out); the expand accelerates into the fill (ease-in).
const FLOAT_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const EXPAND_EASING = "cubic-bezier(0.7, 0, 0.84, 0)";
// Fraction of the expand after which the theme is swapped underneath the overlay.
// By then the glyph nearly fills the viewport, so the revealed background already
// matches the glyph color — hiding the gaps between the sun's rays / the moon
// crescent's notch, and seamlessly filling the corners the glyph doesn't reach.
const THEME_SWAP_AT = 0.9;
// How large (relative to the viewport diagonal) the glyph's BOX grows. The filled
// part of each glyph (the sun's center disc, the moon's body) is only a fraction
// of its box, so the box must overshoot the diagonal to cover the screen. The
// mid-expand theme swap fills any remaining corners, so this needn't be exact.
const FILL_DIAGONAL_FACTOR = 3;
// Safety cap so we never exceed browser max layer/element sizes on huge displays.
const FILL_MAX_PX = 14000;

// Fill colors for the expanding glyph, each matching the theme it reveals so the
// overlay can be removed seamlessly. Sun → light (white); moon → dark (the dark
// `--background`, #0a0f0d).
const SUN_FILL = "#ffffff";
const MOON_FILL = "#0a0f0d";

// The moon glyph's solid mass sits off-center in its box (the crescent thins on
// the notch side), so when it grows it can leave a sliver of the screen uncovered
// before the theme swaps. These nudge the moon's expansion center off the screen
// center (in px) to push the notch off-screen. Positive X = right, positive Y =
// down — so "up and to the right" is positive X, negative Y. Only the moon uses
// these (the sun is symmetric). Tune to taste: because the moon grows large, a
// meaningful shift is on the order of tens-to-hundreds of px, not a few.
const MOON_FILL_OFFSET_X = 1;
const MOON_FILL_OFFSET_Y = 1;

// The in-flight theme switch: which theme we're going to, the float's start offset
// (px from screen center to the toggle), and the box size (px) that fills the
// screen at the end of the expand.
type ThemeTransition = {
  to: "light" | "dark";
  offsetX: number;
  offsetY: number;
  fillPx: number;
};

// Light/dark toggle styled as an interactive hover button. The current mode's
// icon sits centered and alone; hovering (or focusing) reveals the *other* mode's
// icon sliding in beside it on a tinted "preview" chip — dark for the moon, light
// for the sun — so it previews where a click will take you.
//
// Clicking plays a full-screen transition: the destination glyph (white sun going
// to light, dark moon going to dark) floats from the toggle's corner to center,
// then grows to fill the screen while the theme swaps underneath it. next-themes
// only resolves the active theme on the client, so we guard on `mounted` to avoid a
// hydration mismatch; before mount we render a fixed, invisible glyph holding the
// button's size.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [transition, setTransition] = React.useState<ThemeTransition | null>(
    null,
  );
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const overlayIconRef = React.useRef<SVGSVGElement>(null);

  // next-themes returns a NEW setTheme identity whenever the theme changes. The
  // animation effect swaps the theme mid-flight, so depending on setTheme directly
  // would tear down and restart the effect — running the whole transition twice.
  // Keep it in a ref so the effect can depend only on `transition`.
  const setThemeRef = React.useRef(setTheme);
  React.useEffect(() => {
    setThemeRef.current = setTheme;
  }, [setTheme]);

  // Flip to mounted exactly once after the first client render. This is the
  // canonical next-themes hydration guard, so the synchronous setState here is
  // intentional (it runs a single time, not a cascading render loop).
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";

  // Begin a theme switch. When the browser supports the Web Animations API and the
  // user hasn't asked for reduced motion, kick off the float→fill overlay by
  // setting transition state (the effect below runs the animation); otherwise switch
  // instantly. Ignored while a transition is already running.
  const toggleTheme = React.useCallback(() => {
    const next = isDark ? "light" : "dark";
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (
      prefersReducedMotion ||
      transition ||
      typeof Element.prototype.animate !== "function"
    ) {
      setTheme(next);
      return;
    }

    // Float start = the toggle's center; offsets are measured from screen center.
    const rect = buttonRef.current?.getBoundingClientRect();
    const startX = rect ? rect.left + rect.width / 2 : window.innerWidth;
    const startY = rect ? rect.top + rect.height / 2 : 0;
    const diagonal = Math.hypot(window.innerWidth, window.innerHeight);

    setTransition({
      to: next,
      offsetX: startX - window.innerWidth / 2,
      offsetY: startY - window.innerHeight / 2,
      fillPx: Math.min(Math.ceil(FILL_DIAGONAL_FACTOR * diagonal), FILL_MAX_PX),
    });
  }, [isDark, setTheme, transition]);

  // Drives the overlay glyph once a transition begins: float to center (animating
  // transform), then grow to fill (animating width/height so the SVG stays vector
  // crisp instead of pixelating like a scaled-up bitmap). The theme is swapped
  // partway through the fill so the revealed background matches the glyph. Depends
  // only on `transition`, so it runs exactly once per click. Cleanup cancels
  // in-flight timers if the component unmounts mid-transition.
  React.useEffect(() => {
    const icon = overlayIconRef.current;
    if (!transition || !icon) {
      return;
    }

    let cancelled = false;
    let swapTimer = 0;

    // The moon expands about a point nudged off screen center (see
    // MOON_FILL_OFFSET_*) so its off-center crescent still covers the screen; the
    // sun is symmetric and stays centered. The float ends at this point, and the
    // width/height expand (which doesn't touch transform) keeps it there.
    const fillOffsetX = transition.to === "dark" ? MOON_FILL_OFFSET_X : 0;
    const fillOffsetY = transition.to === "dark" ? MOON_FILL_OFFSET_Y : 0;
    const centeredTransform = `translate(-50%, -50%) translate(${fillOffsetX}px, ${fillOffsetY}px)`;

    const float = icon.animate(
      [
        {
          transform: `translate(-50%, -50%) translate(${transition.offsetX}px, ${transition.offsetY}px)`,
        },
        { transform: centeredTransform },
      ],
      { duration: FLOAT_MS, easing: FLOAT_EASING, fill: "forwards" },
    );

    float.finished
      .then(() => {
        if (cancelled) {
          return;
        }

        const expand = icon.animate(
          [
            { width: `${ICON_SIZE}px`, height: `${ICON_SIZE}px` },
            { width: `${transition.fillPx}px`, height: `${transition.fillPx}px` },
          ],
          { duration: EXPAND_MS, easing: EXPAND_EASING, fill: "forwards" },
        );

        // Swap the theme underneath once the glyph nearly fills the screen.
        swapTimer = window.setTimeout(() => {
          if (!cancelled) {
            flushSync(() => setThemeRef.current(transition.to));
          }
        }, EXPAND_MS * THEME_SWAP_AT);

        return expand.finished;
      })
      .then(() => {
        if (!cancelled) {
          // Belt-and-suspenders: ensure the theme is applied, then drop the overlay.
          flushSync(() => setThemeRef.current(transition.to));
          setTransition(null);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(swapTimer);
    };
  }, [transition]);

  // Before mount we don't know the theme, so render a stable, invisible glyph to
  // reserve the button's footprint without flashing the wrong icon.
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Toggle theme"
        className="inline-flex h-9 items-center justify-center rounded-full border bg-background px-2"
      >
        <Sun size={ICON_SIZE} className="opacity-0" />
      </button>
    );
  }

  const OverlayIcon = transition?.to === "light" ? Sun : Moon;
  const overlayFill = transition?.to === "light" ? SUN_FILL : MOON_FILL;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
        onClick={toggleTheme}
        // `--reveal-w` (set from a tunable constant) drives how far the hidden icon
        // slot expands; `group` lets the slots react to hover/focus on the button.
        style={{ ["--reveal-w" as string]: `${TARGET_SLOT_PX}px` }}
        className={cn(
          "group relative inline-flex h-9 items-center justify-center overflow-hidden rounded-full border bg-background px-2 text-foreground",
          "transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
        )}
      >
        <span className="flex items-center">
          {/* Current-theme icon first, preview icon second, so the preview always
              slides in to the *right* of the current icon regardless of theme. */}
          {isDark ? (
            <>
              <IconSlot kind="moon" isCurrent />
              <IconSlot kind="sun" isCurrent={false} />
            </>
          ) : (
            <>
              <IconSlot kind="sun" isCurrent />
              <IconSlot kind="moon" isCurrent={false} />
            </>
          )}
        </span>
      </button>

      {/* Full-screen transition overlay, portaled to the body so no header stacking
          context can clip it. The glyph is filled (not the usual stroke-only icon)
          so its solid area can cover the screen as it grows. It stays centered via
          translate(-50%, -50%); the expand animates width/height (not scale), so the
          SVG re-rasterizes crisply at every size. The initial inline transform
          plants it at the toggle's corner before the float runs. */}
      {transition
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[100]" aria-hidden>
              <OverlayIcon
                ref={overlayIconRef}
                size={ICON_SIZE}
                fill={overlayFill}
                stroke={overlayFill}
                className="absolute left-1/2 top-1/2"
                style={{
                  transform: `translate(-50%, -50%) translate(${transition.offsetX}px, ${transition.offsetY}px)`,
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

type IconSlotProps = {
  kind: "sun" | "moon";
  // True when this icon represents the active theme (shown centered and solo).
  isCurrent: boolean;
};

// One icon position in the toggle. The current-theme icon is always visible; the
// other ("target") icon is collapsed to zero width and revealed on hover/focus of
// the parent button, riding a tinted chip that previews the destination theme —
// a darker chip for the moon (going dark), a lighter chip for the sun (going
// light). Reveal animation is skipped under reduced motion.
function IconSlot({ kind, isCurrent }: IconSlotProps) {
  const Icon = kind === "sun" ? Sun : Moon;

  if (isCurrent) {
    return (
      <span className="flex shrink-0 items-center justify-center">
        <Icon size={ICON_SIZE} />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      style={{ transitionDuration: `${HOVER_REVEAL_MS}ms` }}
      className={cn(
        "flex w-0 shrink-0 items-center justify-center overflow-hidden opacity-0 transition-all ease-out motion-reduce:transition-none",
        "group-hover:w-[var(--reveal-w)] group-hover:opacity-100",
        "group-focus-visible:w-[var(--reveal-w)] group-focus-visible:opacity-100",
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full p-1",
          // The preview chip always sits to the right of the current icon, so the
          // gap is always on its left.
          "ml-1.5",
          kind === "moon"
            ? // Dark preview: near-black green gradient, light glyph.
              "bg-gradient-to-br from-[#1c2a22] to-[#0a0f0d] text-[#e8f0ea]"
            : // Light preview: off-white→pale-green gradient, deep-green glyph.
              "bg-gradient-to-br from-[#ffffff] to-[#e1f4e8] text-[#0e3528]",
        )}
      >
        <Icon size={ICON_SIZE - 2} />
      </span>
    </span>
  );
}
