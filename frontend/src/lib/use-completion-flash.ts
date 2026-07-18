"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

// The class that runs the one-shot radial-bloom keyframe (see globals.css). It's
// added to a `.card-done-overlay` element sitting inside the card.
const FLASH_CLASS = "animate-card-done-radial";

// Plays a one-shot "generation done" bloom on the returned ref's overlay element
// whenever `active` transitions from true to false — i.e. a generation/regeneration
// that was running has just finished — so the user's eye is drawn back to the fresh
// result.
//
// It toggles a CSS class on the DOM node directly (theme-aware via var(--brand))
// rather than setting React state, so it never causes a re-render, and self-clears
// on animationend so it can fire again next time. Skipped under reduced motion.
export function useCompletionFlash<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);
  const wasActive = useRef(active);
  const reduce = useReducedMotion();

  useEffect(() => {
    const previouslyActive = wasActive.current;
    wasActive.current = active;

    const element = ref.current;
    // Only fire on the falling edge (busy → done), and never under reduced motion.
    if (!previouslyActive || active || !element || reduce) {
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
  }, [active, reduce]);

  return ref;
}
