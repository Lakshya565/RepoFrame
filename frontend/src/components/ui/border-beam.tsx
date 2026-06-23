"use client"

import { motion, MotionStyle, Transition } from "motion/react"

import { cn } from "@/lib/utils"

interface BorderBeamProps {
  /**
   * The size of the border beam.
   */
  size?: number
  /**
   * The duration of the border beam.
   */
  duration?: number
  /**
   * The delay of the border beam.
   */
  delay?: number
  /**
   * The color of the border beam from.
   */
  colorFrom?: string
  /**
   * The color of the border beam to.
   */
  colorTo?: string
  /**
   * The motion transition of the border beam.
   */
  transition?: Transition
  /**
   * The class name of the border beam.
   */
  className?: string
  /**
   * The style of the border beam.
   */
  style?: React.CSSProperties
  /**
   * Whether to reverse the animation direction.
   */
  reverse?: boolean
  /**
   * The initial offset position (0-100).
   */
  initialOffset?: number
  /**
   * The border width of the beam.
   */
  borderWidth?: number
}

// ───────────────────────────────────────────────────────────────────────────
// Tunable beam settings — the single source of truth. Edit these numbers to
// retune every beam in the app at once; consumers (e.g. Card) import these by
// name rather than hardcoding values, so a value can never get stranded behind
// an override. They're also the component's prop defaults below.
// ───────────────────────────────────────────────────────────────────────────

// Side length (px) of the gradient square that rides the border. Larger = a
// longer, more spread-out streak. Note: once this exceeds the card's own size
// the gradient stretches past the whole card and the border just looks evenly
// tinted, so there's a practical ceiling (~250); past that it stops changing.
export const BORDER_BEAM_SIZE = 250;

// Seconds for one full lap around the border. Larger = slower. This is a fixed
// time regardless of card size, so bigger cards make the beam appear to move
// faster — raise this to compensate.
export const BORDER_BEAM_DURATION = 15;

// Magic UI border beam, adapted to RepoFrame's palette: the defaults are the
// brand green (`--brand`) fading to a lighter green, so it reads as a refined
// green light rather than the registry's stock purple/orange. Hover gating —
// only lighting up the card under the cursor — is the consumer's job; the shared
// `Card` mounts this on hover (see card.tsx) so at most one beam animates at a
// time and idle cards cost nothing.
export const BorderBeam = ({
  className,
  size = BORDER_BEAM_SIZE,
  delay = 0,
  duration = BORDER_BEAM_DURATION,
  colorFrom = "var(--brand)",
  colorTo = "color-mix(in oklab, var(--brand), white 80%)",
  transition,
  style,
  reverse = false,
  initialOffset = 0,
  borderWidth = 1,
}: BorderBeamProps) => {
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[inherit] border-(length:--border-beam-width) border-transparent mask-[linear-gradient(transparent,transparent),linear-gradient(#000,#000)] mask-intersect [mask-clip:padding-box,border-box]"
      style={
        {
          "--border-beam-width": `${borderWidth}px`,
        } as React.CSSProperties
      }
    >
      <motion.div
        className={cn(
          "absolute aspect-square",
          "bg-linear-to-l from-(--color-from) via-(--color-to) to-transparent",
          className
        )}
        style={
          {
            width: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            "--color-from": colorFrom,
            "--color-to": colorTo,
            ...style,
          } as MotionStyle
        }
        initial={{ offsetDistance: `${initialOffset}%` }}
        animate={{
          offsetDistance: reverse
            ? [`${100 - initialOffset}%`, `${-initialOffset}%`]
            : [`${initialOffset}%`, `${100 + initialOffset}%`],
        }}
        transition={{
          repeat: Infinity,
          ease: "linear",
          duration,
          delay: -delay,
          ...transition,
        }}
      />
    </div>
  )
}
