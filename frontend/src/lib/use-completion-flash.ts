"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

// The class that runs the one-shot radial-bloom keyframe (see globals.css). It's
// added to a `.card-done-overlay` element sitting inside the card.
const FLASH_CLASS = "animate-card-done-radial";

// Plays a one-shot "generation done" bloom on the returned ref's overlay element.
// It fires on either trigger:
//   * `active` transitions from true to false — a generation/regeneration that was
//     running has just finished; or
//   * `pulseKey` changes to a new value — an explicit, imperative pulse the caller
//     bumps for events that aren't a busy→idle transition (a revert/redo swap, or
//     the first time the user views a bulk-generated card).
// Either way the eye is drawn back to the fresh result.
//
// It toggles a CSS class on the DOM node directly (theme-aware via var(--brand))
// rather than setting React state, so it never causes a re-render, and self-clears
// on animationend so it can fire again next time. Skipped under reduced motion, and
// never fired on mount (the initial pulseKey is the baseline, not a change).
export function useCompletionFlash<T extends HTMLElement>(
  active: boolean,
  pulseKey: number = 0,
) {
  const ref = useRef<T>(null);
  const wasActive = useRef(active);
  const lastPulse = useRef(pulseKey);
  const reduce = useReducedMotion();

  useEffect(() => {
    const previouslyActive = wasActive.current;
    wasActive.current = active;
    const pulsed = pulseKey !== lastPulse.current;
    lastPulse.current = pulseKey;

    // Fire on the busy→done falling edge OR an explicit pulse, but never while a
    // generation is still running, and never under reduced motion.
    const fallingEdge = previouslyActive && !active;
    const element = ref.current;
    if ((!fallingEdge && !pulsed) || active || !element || reduce) {
      return;
    }

    // Clear any in-flight pulse and force a reflow so re-adding the class restarts
    // the animation from the top.
    element.classList.remove(FLASH_CLASS);
    void element.offsetWidth;
    element.classList.add(FLASH_CLASS);

    const clear = () => element.classList.remove(FLASH_CLASS);
    element.addEventListener("animationend", clear, { once: true });
    return () => element.removeEventListener("animationend", clear);
  }, [active, pulseKey, reduce]);

  return ref;
}
