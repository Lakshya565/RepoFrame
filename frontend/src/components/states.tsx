import type { LucideIcon } from "lucide-react";
import { TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Shared empty/error surfaces so every async flow (intake, analysis, generation,
// verification) presents missing or failed states identically. Both fade in via
// tw-animate-css utilities and stay static under prefers-reduced-motion. They are
// presentational leaves — the caller (a client component) supplies any handlers.

// Neutral "nothing here yet" surface with an optional icon and call to action.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center duration-500 animate-in fade-in-0 motion-reduce:animate-none",
        className,
      )}
    >
      {Icon ? (
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

// Failure surface with a destructive accent and an optional retry button.
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center duration-500 animate-in fade-in-0 motion-reduce:animate-none",
        className,
      )}
    >
      <TriangleAlert className="size-6 text-destructive" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      {message ? (
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      ) : null}
      {onRetry ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-2"
        >
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
