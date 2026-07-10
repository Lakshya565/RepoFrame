"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GithubMark } from "@/components/github-mark";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";

// The header's sign-in control. It mirrors the four auth states: nothing when
// Supabase is unconfigured (local dev), a skeleton while resolving, a "Log in with
// GitHub" button when signed out, and the GitHub handle + "Log out" when signed
// in. Login/logout themselves live in the auth context; this is just the surface.

// Reads the GitHub handle out of the Supabase user metadata without leaking `any`:
// the field is provider-supplied and only present for a GitHub sign-in.
function displayName(metadata: Record<string, unknown>, email: string | null) {
  const handle = metadata["user_name"] ?? metadata["preferred_username"];
  if (typeof handle === "string" && handle) {
    return handle;
  }
  return email ?? "Signed in";
}

export function AuthButton() {
  const { status, user, signInWithGitHub, signOut } = useAuth();

  // Local dev / self-host: no Supabase, so no login UI at all.
  if (status === "disabled") {
    return null;
  }

  if (status === "loading") {
    return <Skeleton className="h-8 w-28" />;
  }

  if (status === "signedIn") {
    const label = displayName(user?.user_metadata ?? {}, user?.email ?? null);
    return (
      <div className="flex items-center gap-2">
        <span
          className="hidden max-w-[12rem] items-center gap-1.5 truncate text-sm text-muted-foreground sm:inline-flex"
          title={label}
        >
          <GithubMark className="size-3.5 shrink-0" />
          {label}
        </span>
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          <LogOut />
          Log out
        </Button>
      </div>
    );
  }

  // signedOut
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void signInWithGitHub()}
    >
      <GithubMark />
      Log in with GitHub
    </Button>
  );
}
