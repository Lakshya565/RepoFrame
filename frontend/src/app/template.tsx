"use client";

import { motion, useReducedMotion } from "motion/react";

// A template re-mounts on every navigation (unlike a layout), so wrapping its
// children here gives each route a fresh entrance animation. The page content
// rises and fades in with the app's shared expo-out easing — a more pronounced
// transition than an instant swap. Reduced motion renders the route immediately.
export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <>{children}</>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
