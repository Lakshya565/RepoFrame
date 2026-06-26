"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useReducedMotion } from "motion/react";

import { IconCloud } from "@/components/ui/icon-cloud";
import { TechGlyph } from "@/components/tech-glyph";
import { FALLBACK_ICON_PATH, techIconPath } from "@/lib/tech-icons";

// Size (px) each logo SVG rasterizes at before the cloud scales it onto the
// sphere. The cloud draws icons into a 40px cell at 0.4 scale, so 100px keeps
// them crisp without aliasing.
const ICON_RENDER_SIZE = 100;

// Brand green per theme. The canvas rasterizes SVGs and cannot read CSS
// variables, so these mirror --brand in globals.css and MUST stay in sync with
// it (light → #157f4c, dark → #45c07d).
const BRAND_GREEN_LIGHT = "#157f4c";
const BRAND_GREEN_DARK = "#45c07d";

// Ripple tuning (single source of truth). While the cursor hovers the cloud, a
// brand-green ring spawns every RIPPLE_INTERVAL_MS and expands from the center,
// fading out over RIPPLE_LIFETIME_MS (must match the cloud-ripple keyframe's
// intent in globals.css).
const RIPPLE_INTERVAL_MS = 600;
const RIPPLE_LIFETIME_MS = 1100;

type TechIconCloudProps = {
  // Exact technology names from the detector (DetectedTechnology.name).
  techNames: string[];
};

// A draggable 3D sphere of the repository's detected technologies, each rendered
// as a brand-green logo. Brand green (not real brand colors) keeps the cloud
// consistent with the marquee and always legible on the dark canvas, while the
// logo *shapes* stay recognizable. The themed color is derived from the resolved
// theme (no DOM read needed); icons carry an explicit xmlns so they rasterize as
// data-URI images inside the cloud.
export function TechIconCloud({ techNames }: TechIconCloudProps) {
  const reduce = useReducedMotion();
  const { resolvedTheme } = useTheme();

  // Hover-driven ripples. While the pointer is over the cloud, a new ring id is
  // pushed every RIPPLE_INTERVAL_MS; each ring removes itself when its animation
  // ends. Hooks stay above the reduced-motion early return (Rules of Hooks); in
  // that branch the cloud isn't rendered, so isHovered never flips and this idles.
  const [isHovered, setIsHovered] = useState(false);
  const [ripples, setRipples] = useState<number[]>([]);
  const rippleIdRef = useRef(0);

  useEffect(() => {
    if (!isHovered) {
      return;
    }

    const spawnRipple = () => {
      rippleIdRef.current += 1;
      setRipples((current) => [...current, rippleIdRef.current]);
    };

    spawnRipple(); // one immediately on enter, then on a steady cadence
    const interval = window.setInterval(spawnRipple, RIPPLE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [isHovered]);

  // Build one themed SVG element per technology. Memoized so the cloud only
  // re-rasterizes when the tech list or the active theme changes. While the
  // theme is still resolving (first client render), icons is null and we render
  // a reserved box to avoid both a wrong-color flash and any layout shift.
  const icons = useMemo(() => {
    if (!resolvedTheme) {
      return null;
    }

    const brandColor =
      resolvedTheme === "dark" ? BRAND_GREEN_DARK : BRAND_GREEN_LIGHT;

    // Collapse every technology that has no dedicated logo into a single generic
    // code glyph: those all resolve to FALLBACK_ICON_PATH, and repeating the same
    // anonymous glyph around the sphere just reads as noise. Technologies with a
    // real logo each keep their own node.
    let fallbackAdded = false;
    const nodes: { key: string; path: string }[] = [];
    for (const name of techNames) {
      const path = techIconPath(name);
      if (path === FALLBACK_ICON_PATH) {
        if (fallbackAdded) {
          continue;
        }
        fallbackAdded = true;
        nodes.push({ key: "__fallback__", path });
      } else {
        nodes.push({ key: name, path });
      }
    }

    return nodes.map(({ key, path }) => (
      <svg
        key={key}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={ICON_RENDER_SIZE}
        height={ICON_RENDER_SIZE}
        fill={brandColor}
      >
        <path d={path} />
      </svg>
    ));
  }, [techNames, resolvedTheme]);

  // Reduced-motion fallback: skip the auto-rotating canvas entirely and show the
  // same brand-green logos as a calm, static cluster. These are real DOM SVGs, so
  // they are theme-aware on their own; the cluster is aria-hidden because the
  // technology list below already names every entry.
  if (reduce) {
    return (
      <div
        aria-hidden
        className="mx-auto flex max-w-[340px] flex-wrap items-center justify-center gap-4 py-6"
      >
        {techNames.map((name) => (
          <TechGlyph key={name} name={name} size={32} decorative />
        ))}
      </div>
    );
  }

  // Reserve a fixed square box so there is no layout shift while the theme
  // resolves. The canvas keeps its crisp 400px internal resolution but is scaled
  // to fit the box via CSS. A ripple layer sits behind the (transparent) canvas;
  // pointer enter/leave on the wrapper drives it (canvas events bubble up here),
  // and the layer is pointer-events-none so dragging the sphere is unaffected.
  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[340px]"
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      <div className="pointer-events-none absolute inset-0">
        {ripples.map((id) => (
          <span
            key={id}
            aria-hidden
            onAnimationEnd={() =>
              setRipples((current) => current.filter((rippleId) => rippleId !== id))
            }
            className="absolute left-1/2 top-1/2 h-full w-full rounded-full border-2"
            style={{
              borderColor: "var(--brand)",
              animation: `cloud-ripple ${RIPPLE_LIFETIME_MS}ms ease-out forwards`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 h-full w-full [&_canvas]:h-full [&_canvas]:w-full">
        {icons ? <IconCloud icons={icons} /> : null}
      </div>
    </div>
  );
}
