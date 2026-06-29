"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
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

// --- Concentric-ring backdrop (single source of truth) ---------------------
// A fixed set of concentric brand-green rings is centered on the cloud and sits
// behind it as a static backdrop. The rings do nothing until the cursor crosses
// one; crossing a ring fires a wave that pulses that ring and ripples outward
// through the larger rings in sequence (RING_WAVE_STAGGER_MS apart).
const RING_COUNT = 4;
// Ring diameters as a fraction of the square box, from the innermost ring (just
// outside the shrunk cloud) to the outermost (kept under 1 so the scale-up pulse
// never paints past the box edge).
const RING_INNER_FRACTION = 0.6;
const RING_OUTER_FRACTION = 0.96;
// The icon cloud is shrunk to this fraction of the box and centered, so it reads
// as sitting *inside* the ring field rather than filling the whole square.
const CLOUD_SCALE = 0.85;
// Resting ring opacity fades from the innermost ring outward (outer = fainter).
const RING_BASE_OPACITY_INNER = 0.35;
const RING_BASE_OPACITY_OUTER = 0.12;
// One ring's pulse duration; must match the ring-pulse keyframe's intent in
// globals.css. The wave delays each successive outer ring by the stagger.
const RING_PULSE_MS = 500;
const RING_WAVE_STAGGER_MS = 100;
// Cooldown after a wave: new crossings are ignored until the in-flight wave has
// fully finished (its last ring's staggered pulse ends) plus this buffer, so a
// cursor lingering on the rings can't stack overlapping ripples.
const RING_WAVE_COOLDOWN_MS = 1000;

// Diameter fraction for ring `index` (0 = innermost), linearly interpolated
// between the inner/outer constants above.
function ringFraction(index: number): number {
  if (RING_COUNT <= 1) {
    return RING_OUTER_FRACTION;
  }
  const t = index / (RING_COUNT - 1);
  return RING_INNER_FRACTION + (RING_OUTER_FRACTION - RING_INNER_FRACTION) * t;
}

// Resting opacity for ring `index` (outer rings fade out).
function ringOpacity(index: number): number {
  if (RING_COUNT <= 1) {
    return RING_BASE_OPACITY_INNER;
  }
  const t = index / (RING_COUNT - 1);
  return (
    RING_BASE_OPACITY_INNER +
    (RING_BASE_OPACITY_OUTER - RING_BASE_OPACITY_INNER) * t
  );
}

// Per-ring animation token: bumping `seq` remounts the ring so its pulse
// animation restarts; `delay` staggers it within the outward-rippling wave.
type RingPulse = { seq: number; delay: number };

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

  // Ring wave state. Each ring tracks its own pulse token; the cursor's previous
  // distance from center lets us detect the exact moment it crosses a ring.
  // Hooks stay above the reduced-motion early return (Rules of Hooks); in that
  // branch the rings aren't rendered, so the handlers never run and this idles.
  const [pulses, setPulses] = useState<RingPulse[]>(() =>
    Array.from({ length: RING_COUNT }, () => ({ seq: 0, delay: 0 })),
  );
  const prevDistRef = useRef<number | null>(null);
  // Timestamp (performance.now) before which no new wave may start (see cooldown).
  const cooldownUntilRef = useRef(0);

  // Fire a wave: the crossed ring and every larger ring re-animate, each delayed
  // by its distance (in rings) from the origin so the pulse travels outward.
  const triggerWave = (fromIndex: number) => {
    setPulses((current) =>
      current.map((pulse, index) =>
        index >= fromIndex
          ? {
              seq: pulse.seq + 1,
              delay: (index - fromIndex) * RING_WAVE_STAGGER_MS,
            }
          : pulse,
      ),
    );
  };

  // On every pointer move, track only whether the cursor crossed *into* the
  // outermost ring (from outside to inside its radius). Each such entry fires one
  // full wave from the smallest ring out to the largest — the wave is always the
  // same regardless of where within the field the cursor is.
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    const outerRadius = ringFraction(RING_COUNT - 1) * (rect.width / 2);
    const prev = prevDistRef.current;
    prevDistRef.current = dist;
    if (prev === null) {
      return;
    }

    const enteredOuterRing = prev > outerRadius && dist <= outerRadius;
    if (enteredOuterRing) {
      const now = performance.now();
      if (now < cooldownUntilRef.current) {
        return;
      }
      // The wave's outermost ring starts (RING_COUNT - 1) staggers in and runs for
      // one pulse; block new waves until then, plus the buffer.
      const waveDuration =
        (RING_COUNT - 1) * RING_WAVE_STAGGER_MS + RING_PULSE_MS;
      cooldownUntilRef.current = now + waveDuration + RING_WAVE_COOLDOWN_MS;
      triggerWave(0);
    }
  };

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

  // Reduced-motion fallback: skip the auto-rotating canvas and ring backdrop
  // entirely and show the same brand-green logos as a calm, static cluster. These
  // are real DOM SVGs, so they are theme-aware on their own; the cluster is
  // aria-hidden because the technology list below already names every entry.
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
  // resolves. The static ring backdrop sits behind a centered, shrunk cloud;
  // pointer-move on the wrapper (canvas events bubble up here) drives the ring
  // wave, and the ring layer is pointer-events-none so dragging the sphere — and
  // the wave detection itself — are unaffected.
  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[340px]"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        prevDistRef.current = null;
      }}
    >
      <div className="pointer-events-none absolute inset-0 z-0">
        {pulses.map((pulse, index) => {
          const fraction = ringFraction(index);
          const base = ringOpacity(index);
          return (
            <span
              key={`${index}-${pulse.seq}`}
              aria-hidden
              className="absolute left-1/2 top-1/2 rounded-full border"
              style={
                {
                  width: `${fraction * 100}%`,
                  height: `${fraction * 100}%`,
                  borderColor: "var(--brand)",
                  opacity: base,
                  transform: "translate(-50%, -50%)",
                  animation:
                    pulse.seq > 0
                      ? `ring-pulse ${RING_PULSE_MS}ms ease-out`
                      : undefined,
                  animationDelay: `${pulse.delay}ms`,
                  // Read back by the keyframe so each ring returns to its own
                  // resting opacity instead of a shared hard-coded value.
                  "--ring-base": base,
                } as CSSProperties
              }
            />
          );
        })}
      </div>

      <div
        className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 [&_canvas]:h-full [&_canvas]:w-full"
        style={{ width: `${CLOUD_SCALE * 100}%`, height: `${CLOUD_SCALE * 100}%` }}
      >
        {icons ? <IconCloud icons={icons} /> : null}
      </div>
    </div>
  );
}
