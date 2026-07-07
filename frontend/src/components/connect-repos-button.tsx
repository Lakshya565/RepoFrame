"use client";

import { useAuth } from "@/lib/auth-context";
import { installAppUrl } from "@/lib/github-app-api";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// "Connect repositories" control (Phase 15.6): opens GitHub's own install screen
// for the RepoFrame App, where the user chooses All or Selected repositories
// (public and/or private). After install, GitHub redirects to /github/installed,
// which records the mapping. Renders nothing unless signed in with a configured
// slug — so it's inert in the public/dev flow. Minimal by design; the real UI
// treatment lands in the UI pass.
export function ConnectReposButton({ className }: { className?: string }) {
  const { status, user } = useAuth();

  if (status !== "signedIn" || !user) {
    return null;
  }
  const url = installAppUrl(user.id);
  if (!url) {
    return null;
  }

  return (
    <a
      href={url}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), className)}
    >
      Connect repositories
    </a>
  );
}
