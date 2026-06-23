"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────────
// Tunable ripple settings — single source of truth for the click ripple shared
// by every Button. Edit here to retune the effect everywhere at once.
// ───────────────────────────────────────────────────────────────────────────

// Ripple fill. `currentColor` makes the ripple inherit each variant's text
// color, so it reads on every treatment: light on the brand/primary fills,
// dark on ghost/outline/link. Override per-button via the `rippleColor` prop.
export const RIPPLE_COLOR = "currentColor";

// How long (ms) a single ripple takes to expand and fade out.
export const RIPPLE_DURATION_MS = 600;

// Button variants. `default` is the near-black primary (Swiss-minimal); `brand`
// is the single blue accent reserved for the main call-to-action; the rest are
// quiet secondary/ghost/outline treatments. `buttonVariants` is exported so links
// (<a> / next/link) can borrow the same styling without an extra Slot dependency.
const buttonVariants = cva(
  // `relative overflow-hidden` clips the ripple to the button's rounded box.
  "relative overflow-hidden inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 cursor-pointer [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        brand: "bg-brand text-brand-foreground hover:bg-brand/90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline:
          "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 rounded-md px-3 text-xs",
        default: "h-9 px-4 py-2",
        lg: "h-10 rounded-md px-6",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Ripple fill color; defaults to the variant's text color. */
  rippleColor?: string;
  /** Ripple lifetime in ms; defaults to RIPPLE_DURATION_MS. */
  rippleDuration?: number;
}

type Ripple = { x: number; y: number; size: number; key: number };

// Shared button with a Material-style click ripple baked in, so every button in
// the app ripples consistently without each call site opting in. The ripple is a
// circle spawned at the click point that expands and fades (see the `rippling`
// keyframe in globals.css). Children are wrapped in a `relative z-10` layer so
// they paint above the ripple while preserving the icon/label gap.
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      onClick,
      children,
      rippleColor = RIPPLE_COLOR,
      rippleDuration = RIPPLE_DURATION_MS,
      ...props
    },
    ref,
  ) => {
    const [ripples, setRipples] = React.useState<Ripple[]>([]);

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      const button = event.currentTarget;
      const rect = button.getBoundingClientRect();
      // A circle large enough to cover the button from the click point.
      const diameter = Math.max(rect.width, rect.height);
      setRipples((prev) => [
        ...prev,
        {
          x: event.clientX - rect.left - diameter / 2,
          y: event.clientY - rect.top - diameter / 2,
          size: diameter,
          key: Date.now(),
        },
      ]);
      onClick?.(event);
    };

    // Drop each ripple from state once its animation has finished.
    React.useEffect(() => {
      if (ripples.length === 0) return;
      const last = ripples[ripples.length - 1];
      const timeout = setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.key !== last.key));
      }, rippleDuration);
      return () => clearTimeout(timeout);
    }, [ripples, rippleDuration]);

    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        onClick={handleClick}
        {...props}
      >
        <span className="relative z-10 inline-flex items-center gap-2">
          {children}
        </span>
        <span className="pointer-events-none absolute inset-0">
          {ripples.map((ripple) => (
            <span
              key={ripple.key}
              className="animate-rippling absolute rounded-full opacity-30"
              style={
                {
                  width: ripple.size,
                  height: ripple.size,
                  top: ripple.y,
                  left: ripple.x,
                  backgroundColor: rippleColor,
                  transform: "scale(0)",
                  "--duration": `${rippleDuration}ms`,
                } as React.CSSProperties
              }
            />
          ))}
        </span>
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
