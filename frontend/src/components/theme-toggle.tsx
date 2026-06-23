"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────────
// Tunable toggle settings — single source of truth. Edit these to retune the
// toggle's feel without hunting through className strings.
// ───────────────────────────────────────────────────────────────────────────

// Edge length (px) of the lucide sun/moon glyphs.
const ICON_SIZE = 16;

// Width (px) the hidden "target" icon slot grows to when revealed on hover. It
// needs to fit the preview chip (icon + its padding + the gap from the current
// icon); bump it if you enlarge ICON_SIZE or the chip padding.
const TARGET_SLOT_PX = 30;

// Hover reveal speed (ms) — how fast the second icon slides/fades in.
const HOVER_REVEAL_MS = 300;

// Circular theme-wipe duration (ms) for the View Transitions reveal on click.
const THEME_SWITCH_MS = 1000;

// Easing for the theme wipe — the app's shared expo-out curve.
const THEME_SWITCH_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

// Minimal typing for the View Transitions API, which isn't in the TS DOM lib
// yet. We only touch `startViewTransition` and the `ready` promise.
type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { ready: Promise<void> };
};

// Light/dark toggle styled as an interactive hover button. The current mode's
// icon sits centered and alone; hovering (or focusing) reveals the *other* mode's
// icon sliding in beside it on a tinted "preview" chip — dark for the moon, light
// for the sun — so it previews where a click will take you. Clicking flips the
// theme with a circular View-Transition wipe that radiates from the button.
//
// next-themes only resolves the active theme on the client, so we guard on
// `mounted` to avoid a hydration mismatch; before mount we render a fixed,
// invisible glyph that just holds the button's size.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  // Flip to mounted exactly once after the first client render. This is the
  // canonical next-themes hydration guard, so the synchronous setState here is
  // intentional (it runs a single time, not a cascading render loop).
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";

  // Flip the theme. When the browser supports View Transitions and the user
  // hasn't asked for reduced motion, animate the new theme in as an expanding
  // circle centered on the button; otherwise switch instantly.
  const toggleTheme = React.useCallback(() => {
    const next = isDark ? "light" : "dark";
    const doc = document as ViewTransitionDocument;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion || !doc.startViewTransition) {
      setTheme(next);
      return;
    }

    // Circle origin = the button's center, so the wipe radiates from where the
    // user clicked. End radius reaches the farthest viewport corner.
    const rect = buttonRef.current?.getBoundingClientRect();
    const originX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const originY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const endRadius = Math.hypot(
      Math.max(originX, window.innerWidth - originX),
      Math.max(originY, window.innerHeight - originY),
    );

    // flushSync forces next-themes to apply the new class synchronously inside
    // the transition callback, so the View Transition captures the new theme.
    const transition = doc.startViewTransition(() => {
      flushSync(() => setTheme(next));
    });

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${originX}px ${originY}px)`,
            `circle(${endRadius}px at ${originX}px ${originY}px)`,
          ],
        },
        {
          duration: THEME_SWITCH_MS,
          easing: THEME_SWITCH_EASING,
          pseudoElement: "::view-transition-new(root)",
        },
      );
    });
  }, [isDark, setTheme]);

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

  return (
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
