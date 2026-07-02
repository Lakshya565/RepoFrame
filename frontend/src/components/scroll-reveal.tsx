"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

// The reveal's fade/lift duration.
const REVEAL_DURATION_SECONDS = 0.5;
// How far (px) each card lifts up as it fades in.
const REVEAL_OFFSET_PX = 12;
// How far each successive card's reveal is offset, so cards that are on screen
// together cascade in rather than firing all at once.
const REVEAL_STAGGER_SECONDS = 0.08;
// Cap on the staggered delay so cards deep in the page still reveal promptly as they
// scroll into view instead of waiting on an ever-growing offset.
const MAX_REVEAL_DELAY_SECONDS = 0.2;
// Fraction of the card that must be on screen before it reveals. Kept low so a card
// already in view on load reveals immediately instead of waiting for a scroll.
const REVEAL_VIEWPORT_AMOUNT = 0.1;
// Safety net: force the card visible after this long even if the observer never
// reports, so a card can never be left stuck invisible.
const REVEAL_FALLBACK_MS = 600;

type ScrollRevealProps = {
  children: ReactNode;
  // Position in the sequence. Only staggers the initial on-screen group; cards
  // further down reveal as they scroll in, so the delay is capped.
  index?: number;
  className?: string;
};

// Fades and lifts its children up as they scroll into view. It drives the reveal with
// its own IntersectionObserver (plus a fallback timeout) rather than delegating to a
// motion hook, so the content is always revealed and can never get stuck at opacity 0.
// Under reduced motion it renders the children immediately with no animation.
export function ScrollReveal({
  children,
  index = 0,
  className,
}: ScrollRevealProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Reduced motion renders the plain-div branch below and never animates.
    if (reduce) {
      return;
    }

    const element = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: REVEAL_VIEWPORT_AMOUNT },
    );
    if (element) {
      observer.observe(element);
    }

    // Guarantee the content appears even if the observer never fires (odd layouts,
    // missing ref); reveals after a short delay at the latest.
    const fallback = window.setTimeout(() => {
      setVisible(true);
      observer.disconnect();
    }, REVEAL_FALLBACK_MS);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, [reduce]);

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  const delay = Math.min(index * REVEAL_STAGGER_SECONDS, MAX_REVEAL_DELAY_SECONDS);
  return (
    <motion.div
      animate={
        visible
          ? { opacity: 1, y: 0 }
          : { opacity: 0, y: REVEAL_OFFSET_PX }
      }
      className={className}
      initial={{ opacity: 0, y: REVEAL_OFFSET_PX }}
      ref={ref}
      transition={{ duration: REVEAL_DURATION_SECONDS, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
