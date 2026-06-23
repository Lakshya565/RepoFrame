"use client";

import * as React from "react";
import { Fragment } from "react";
import { motion, useReducedMotion } from "motion/react";

// Shared easing for entrance motion. This is an expo-out curve: fast to start,
// gently settling at the end, which reads as "confident" rather than bouncy.
// Reused everywhere so all entrances share one rhythm.
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Stagger offset in seconds, used to cascade sibling reveals. */
  delay?: number;
  /** Vertical travel distance before settling, in pixels. */
  y?: number;
  /** Animate when scrolled into view (below the fold) vs. on mount (hero). */
  inView?: boolean;
};

// Fades and rises an element into place. Above-the-fold content animates on mount
// (`inView={false}`); below-the-fold content animates the first time it scrolls
// into view. When the user prefers reduced motion we skip the animation entirely
// and render the element in its final state, so nothing moves or fades.
export function Reveal({
  children,
  className,
  delay = 0,
  y = 16,
  inView = false,
}: RevealProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  const motionState = inView
    ? { whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-80px" } }
    : { animate: { opacity: 1, y: 0 } };

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      transition={{ duration: 0.6, ease: EASE, delay }}
      {...motionState}
    >
      {children}
    </motion.div>
  );
}

// A thin accent rule that draws in from the left — the small "graphic" flourish
// that gives an entrance a designed feel without decoration. Style it with width
// + height + color via `className` (e.g. `h-0.5 w-12 bg-brand`). Static under
// reduced motion.
export function GrowLine({
  className,
  delay = 0.3,
}: {
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <span className={className} aria-hidden />;
  }

  return (
    <motion.span
      aria-hidden
      className={className}
      style={{ transformOrigin: "left", display: "block" }}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: 0.7, ease: EASE, delay }}
    />
  );
}

// Reveals text one letter at a time, each character rising and fading into place
// with a stagger. Best for a short display word (e.g. the "RepoFrame" wordmark)
// where a per-letter cascade reads as a deliberate, "graphic" entrance. The full
// word is exposed to screen readers via aria-label while the per-letter spans are
// hidden from them, and reduced motion renders the text instantly. Animates on
// mount, so use it above the fold.
export function LettersReveal({
  text,
  className,
  delay = 0,
  stagger = 0.05,
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <span className={className}>{text}</span>;
  }

  const letters = text.split("");

  return (
    <span className={className} aria-label={text}>
      {letters.map((char, index) => (
        <motion.span
          key={index}
          aria-hidden
          className="inline-block"
          initial={{ y: "0.6em", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE, delay: delay + index * stagger }}
        >
          {/* Non-breaking space keeps spaces from collapsing on inline-block. */}
          {char === " " ? " " : char}
        </motion.span>
      ))}
    </span>
  );
}

// Reveals a headline one word at a time, each word rising and fading into place
// with a stagger — a more dramatic, "graphic" entrance than a single block fade.
// The full text is preserved as readable inline content (no overflow clipping of
// descenders), and reduced motion renders it instantly. Animates on mount, so use
// it for above-the-fold headings.
export function WordsReveal({
  text,
  className,
  delay = 0,
  stagger = 0.06,
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <span className={className}>{text}</span>;
  }

  const words = text.split(" ");

  return (
    <span className={className}>
      {words.map((word, index) => (
        <Fragment key={index}>
          <motion.span
            className="inline-block"
            initial={{ y: "0.5em", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, ease: EASE, delay: delay + index * stagger }}
          >
            {word}
          </motion.span>
          {index < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );
}
