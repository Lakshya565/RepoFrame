"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import { subscribePointer } from "@/lib/pointer";

// ───────────────────────────────────────────────────────────────────────────
// Tunable title settings — single source of truth. Edit these to retune the
// hero wordmark without touching markup.
// ───────────────────────────────────────────────────────────────────────────

// Entrance: each letter fades + rises into place, staggered left → right.
const ENTRANCE_STAGGER_S = 0.06; // gap (s) between consecutive letters
const ENTRANCE_RISE_EM = 0.6; // how far (em) each letter rises from
const ENTRANCE_DURATION_S = 0.5; // per-letter fade duration
const ENTRANCE_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Reaction: as the cursor approaches a letter it grows and bolds, peaking right
// under the cursor and easing back out with distance.
const REACT_RADIUS_PX = 90; // cursor influence radius around each letter
const MAX_SCALE_BOOST = 0.45; // extra scale at peak (1 + this = max scale)
const BASE_WEIGHT = 600; // resting font-weight
const MAX_WEIGHT = 700; // font-weight right under the cursor
const REACT_TRANSITION_MS = 160; // smoothing for the grow/shrink

type KineticLettersProps = {
  text: string;
  className?: string;
  /** Delay (s) before the first letter begins its entrance. */
  delay?: number;
};

// The "RepoFrame" hero wordmark. Each letter fades and rises in on mount, then
// reacts to the cursor: letters scale up and bold as the pointer nears them and
// settle back as it leaves — kinetic typography driven by proximity, not a
// constant wobble. The entrance runs on the OUTER (Motion) span; the cursor
// reaction is written imperatively to the INNER span's transform/weight, so the
// two never fight over `transform`. Reduced motion renders static text.
export function KineticLetters({ text, className, delay = 0 }: KineticLettersProps) {
  const reduce = useReducedMotion();
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reduce) return;
    const container = containerRef.current;
    if (!container) return;

    const letters = Array.from(
      container.querySelectorAll<HTMLElement>("[data-kinetic-letter]"),
    );
    let centers = letters.map(() => ({ x: 0, y: 0 }));
    let bounds = container.getBoundingClientRect();

    // Cache each letter's center (and the word's bounds) so the per-frame work is
    // pure math. Re-measured on scroll/resize and once the entrance settles.
    const measure = () => {
      bounds = container.getBoundingClientRect();
      centers = letters.map((el) => {
        const rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });
    };
    measure();
    const settle = window.setTimeout(measure, 1200);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    if (document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }

    const reset = () => {
      for (const el of letters) {
        el.style.transform = "scale(1)";
        el.style.fontWeight = String(BASE_WEIGHT);
      }
    };

    let parked = true;
    const unsubscribe = subscribePointer((x, y) => {
      // Skip work entirely when the cursor is nowhere near the word.
      const near =
        x > bounds.left - REACT_RADIUS_PX &&
        x < bounds.right + REACT_RADIUS_PX &&
        y > bounds.top - REACT_RADIUS_PX &&
        y < bounds.bottom + REACT_RADIUS_PX;
      if (!near) {
        if (!parked) {
          reset();
          parked = true;
        }
        return;
      }
      parked = false;
      for (let i = 0; i < letters.length; i++) {
        const center = centers[i];
        const distance = Math.hypot(x - center.x, y - center.y);
        const proximity = Math.max(0, 1 - distance / REACT_RADIUS_PX);
        letters[i].style.transform = `scale(${1 + proximity * MAX_SCALE_BOOST})`;
        letters[i].style.fontWeight = String(
          Math.round(BASE_WEIGHT + proximity * (MAX_WEIGHT - BASE_WEIGHT)),
        );
      }
    });

    return () => {
      unsubscribe();
      window.clearTimeout(settle);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [reduce, text]);

  if (reduce) {
    return <span className={cn("font-semibold", className)}>{text}</span>;
  }

  const letters = text.split("");

  return (
    <span ref={containerRef} className={cn("inline-block", className)} aria-label={text}>
      {letters.map((char, index) => (
        <motion.span
          key={index}
          aria-hidden
          className="inline-block"
          initial={{ y: `${ENTRANCE_RISE_EM}em`, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{
            duration: ENTRANCE_DURATION_S,
            ease: ENTRANCE_EASE,
            delay: delay + index * ENTRANCE_STAGGER_S,
          }}
        >
          <span
            data-kinetic-letter
            className="inline-block"
            style={{
              fontWeight: BASE_WEIGHT,
              transformOrigin: "center",
              transition: `transform ${REACT_TRANSITION_MS}ms ease-out`,
              willChange: "transform",
            }}
          >
            {char}
          </span>
        </motion.span>
      ))}
    </span>
  );
}
