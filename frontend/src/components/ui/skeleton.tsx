import { cn } from "@/lib/utils";

// Loading placeholder. A muted block with a gentle pulse; the pulse is disabled
// under prefers-reduced-motion. Size it with width/height utilities via className
// and compose several to mirror the shape of the content being loaded.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
