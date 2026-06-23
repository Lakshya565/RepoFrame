"use client"

import { motion, useScroll, type MotionProps } from "motion/react"

import { cn } from "@/lib/utils"

interface ScrollProgressProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  keyof MotionProps
> {
  ref?: React.Ref<HTMLDivElement>
}

// Magic UI scroll-progress bar, recolored to a flat brand green to match the
// palette (the registry default is a purple→pink→orange gradient — exactly the
// kind of multi-hue gradient this design avoids). It's a thin rail pinned to the
// very top of the viewport whose width tracks how far the page is scrolled. The
// fill is driven directly by `scrollYProgress`, so it follows the user's own
// scrolling rather than animating on its own — fine to leave on under reduced
// motion.
export function ScrollProgress({
  className,
  ref,
  ...props
}: ScrollProgressProps) {
  const { scrollYProgress } = useScroll()

  return (
    <motion.div
      ref={ref}
      className={cn(
        "fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-brand",
        className
      )}
      style={{
        scaleX: scrollYProgress,
      }}
      {...props}
    />
  )
}
