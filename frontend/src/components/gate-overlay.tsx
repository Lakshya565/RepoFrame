"use client";

import { type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Home, Lock } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { GithubMark } from "@/components/github-mark";
import { cn } from "@/lib/utils";

type GateOverlayProps = {
  // The real UI behind the gate. It is rendered (so the demo shows what's on the
  // other side) but blurred, dimmed, and made inert.
  children: ReactNode;
  // The pitch shown to a signed-out visitor, e.g. "Log in to add your own context".
  title: string;
  className?: string;
};

// A login gate for the demo: it shows the real feature behind a blur + dim and
// floats a call-to-action over it, so a visitor sees exactly what unlocking gets
// them without the demo ever calling an API. The CTA is auth-aware:
//   - signed out → "Log in with GitHub" (the whole point of the gate).
//   - signed in  → a wry "Why are you here?" nudging them back to the real app,
//     since the frozen demo is pointless once you can analyze your own repos.
// The children stay in the layout (so the card keeps its real height) but are
// blurred, non-interactive, and hidden from the tab order and screen readers.
export function GateOverlay({ children, title, className }: GateOverlayProps) {
  const { status, signInWithGitHub } = useAuth();
  const router = useRouter();
  const signedIn = status === "signedIn";

  return (
    // min-h ensures short gated regions (e.g. a single instruction box or one
    // history row) are still tall enough to hold the centered CTA card, so it is
    // never clipped or "chopped" by the region — taller regions ignore it.
    <div className={cn("relative min-h-48", className)}>
      {/* The real UI, made inert: blurred, dimmed, unfocusable, and unreadable to
          assistive tech so the gate is the only thing a visitor can act on. */}
      <div
        aria-hidden
        inert
        className="pointer-events-none select-none blur-[1px] opacity-80"
      >
        {children}
      </div>

      {/* The floating CTA. */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="flex max-w-xs flex-col items-center gap-3 rounded-lg border bg-background/80 px-6 py-5 text-center shadow-lg backdrop-blur-sm">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand/10 text-brand [&_svg]:size-4">
            {signedIn ? <Home aria-hidden /> : <Lock aria-hidden />}
          </span>
          {signedIn ? (
            <>
              <p className="text-sm font-semibold">Why are you here?</p>
              <p className="text-sm text-muted-foreground">
                You&apos;re already signed in — head back and frame a repo of your
                own for real.
              </p>
              <Button variant="brand" size="sm" onClick={() => router.push("/")}>
                Return home
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-sm text-muted-foreground">
                This part is yours to fill in once you log in.
              </p>
              <Button
                variant="brand"
                size="sm"
                onClick={() => void signInWithGitHub()}
              >
                <GithubMark />
                Log in with GitHub
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
