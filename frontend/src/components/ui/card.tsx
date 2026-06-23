"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import {
  BorderBeam,
  BORDER_BEAM_DURATION,
  BORDER_BEAM_SIZE,
} from "@/components/ui/border-beam";

// Shared expo-out easing, matching the rest of the app's entrance motion.
const BEAM_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

type CardProps = React.ComponentProps<"div"> & {
  // Opt in to a green border beam that lights up only while the cursor is over
  // this card. Off by default so loading/error/empty surfaces stay quiet.
  beam?: boolean;
};

// Card primitives. A card is a single flat surface with a hairline border and no
// drop shadow by default (Swiss-minimal). Compose with the sub-parts below and
// avoid nesting cards inside cards — depth comes from spacing and borders, not
// stacked containers.
//
// With `beam`, the card detects when the cursor is over *it specifically* (the
// same hover-detection idea as the interactive hover button) and mounts a green
// border beam for that card alone. We mount on hover rather than running every
// card's beam continuously, so at most one beam animates at a time and idle
// cards cost nothing. Reduced-motion users never see the beam.
function Card({ className, beam = false, children, ...props }: CardProps) {
  const reduce = useReducedMotion();
  const [isHovered, setIsHovered] = React.useState(false);
  const beamEnabled = beam && !reduce;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground",
        beamEnabled && "relative",
        className,
      )}
      onMouseEnter={beamEnabled ? () => setIsHovered(true) : undefined}
      onMouseLeave={beamEnabled ? () => setIsHovered(false) : undefined}
      {...props}
    >
      {children}
      {beamEnabled ? (
        <AnimatePresence>
          {isHovered ? (
            <motion.span
              key="card-border-beam"
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: BEAM_EASE }}
            >
              <BorderBeam
                size={BORDER_BEAM_SIZE}
                duration={BORDER_BEAM_DURATION}
              />
            </motion.span>
          ) : null}
        </AnimatePresence>
      ) : null}
    </div>
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      className={cn(
        "text-base font-semibold leading-none tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex items-center p-6 pt-0", className)} {...props} />
  );
}

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
};
