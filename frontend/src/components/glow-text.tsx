"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import { subscribePointer } from "@/lib/pointer";

// ───────────────────────────────────────────────────────────────────────────
// Tunable glow settings — single source of truth.
// ───────────────────────────────────────────────────────────────────────────

// Radius (px) of the cursor's influence: letters whose outline falls within this
// distance of the pointer light up, fading out toward the edge. The effect
// reaches this far *outside* the text too, so it reacts as the cursor approaches.
const GLOW_RADIUS_PX = 150;

// Outline color. The shared theme-aware `--glow` token: a faint near-black in
// light mode (so the halo stays visible against the light surface) and white in
// dark mode, matching the MagicCard spotlight.
const GLOW_COLOR = "var(--glow)";

// Thickness (px) of the glowing letter outline.
const STROKE_WIDTH_PX = 0.5;

// Soft halo radius (px) around the lit outline.
const GLOW_BLUR_PX = 3;

type GlowTextProps = {
  text: string;
  className?: string;
};

// Renders text that lights up as the cursor approaches: each letter's outline
// traces in green when the pointer comes within GLOW_RADIUS_PX, like the
// magic-card border effect mapped onto the glyphs. Mechanism: an invisible
// outlined duplicate of the text is stacked exactly over the real (readable)
// text, and a single radial-gradient mask centered on the cursor reveals only the
// outlines within range — one extra element per block, not per letter. Pointer
// tracking is global (via the shared tracker) so it reacts before the cursor even
// reaches the text. Reduced motion renders plain text with no glow.
export function GlowText({ text, className }: GlowTextProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reduce) return;
    const element = ref.current;
    if (!element) return;

    // Cache the block's viewport position; refresh on scroll/resize rather than
    // reading layout on every pointer frame.
    let rect = element.getBoundingClientRect();
    const refresh = () => {
      rect = element.getBoundingClientRect();
    };
    window.addEventListener("scroll", refresh, { passive: true });
    window.addEventListener("resize", refresh);
    const resizeObserver = new ResizeObserver(refresh);
    resizeObserver.observe(element);

    const park = () => {
      element.style.setProperty("--glow-x", "-9999px");
      element.style.setProperty("--glow-y", "-9999px");
    };

    let parked = true;
    const unsubscribe = subscribePointer((x, y) => {
      // Only touch styles when the cursor is within range of this block.
      const near =
        x > rect.left - GLOW_RADIUS_PX &&
        x < rect.right + GLOW_RADIUS_PX &&
        y > rect.top - GLOW_RADIUS_PX &&
        y < rect.bottom + GLOW_RADIUS_PX;
      if (!near) {
        if (!parked) {
          park();
          parked = true;
        }
        return;
      }
      parked = false;
      element.style.setProperty("--glow-x", `${x - rect.left}px`);
      element.style.setProperty("--glow-y", `${y - rect.top}px`);
    });

    return () => {
      unsubscribe();
      window.removeEventListener("scroll", refresh);
      window.removeEventListener("resize", refresh);
      resizeObserver.disconnect();
    };
  }, [reduce]);

  if (reduce) {
    return <span className={className}>{text}</span>;
  }

  const mask = `radial-gradient(${GLOW_RADIUS_PX}px circle at var(--glow-x, -9999px) var(--glow-y, -9999px), #000 0%, #000 20%, transparent 72%)`;

  const overlayStyle: CSSProperties = {
    color: "transparent",
    WebkitTextStrokeWidth: `${STROKE_WIDTH_PX}px`,
    WebkitTextStrokeColor: GLOW_COLOR,
    filter: `drop-shadow(0 0 ${GLOW_BLUR_PX}px ${GLOW_COLOR})`,
    WebkitMaskImage: mask,
    maskImage: mask,
  };

  return (
    <span
      ref={ref}
      className={cn("relative block", className)}
      style={{
        ["--glow-x" as string]: "-9999px",
        ["--glow-y" as string]: "-9999px",
      }}
    >
      {text}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 select-none"
        style={overlayStyle}
      >
        {text}
      </span>
    </span>
  );
}
