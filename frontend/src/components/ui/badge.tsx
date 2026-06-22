import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Badge variants. The neutral variants come from the slate token system; the
// status variants (success/warning/info/destructive) are the only place colored
// hues are used, and they map to the four claim-verification states. Each is a
// soft tinted background with AA-contrast text in both themes — they are always
// rendered alongside a text label (and usually an icon), never as a bare dot.
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
        success:
          "border-transparent bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-400",
        warning:
          "border-transparent bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
        info: "border-transparent bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400",
        destructive:
          "border-transparent bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
