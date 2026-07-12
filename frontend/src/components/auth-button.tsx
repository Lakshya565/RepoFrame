"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { GithubMark } from "@/components/github-mark";
import { HoverPopIcon } from "@/components/hover-pop-icon";
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
  const router = useRouter();
  const pathname = usePathname();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  // The repo being analyzed on the current route, if any (the header sits outside
  // the analysis GenerationProvider, so read it from the path). Drives the log-out
  // warning: logging out mid-analysis ends the session, so we confirm first.
  const analysisMatch = pathname.match(/^\/analysis\/([^/]+)\/([^/]+)/);
  const analyzingRepo = analysisMatch
    ? `${decodeURIComponent(analysisMatch[1])}/${decodeURIComponent(analysisMatch[2])}`
    : null;

  // Local dev / self-host: no Supabase, so no login UI at all.
  if (status === "disabled") {
    return null;
  }

  if (status === "loading") {
    return <Skeleton className="h-8 w-28" />;
  }

  // Log out directly, except mid-analysis where we warn first (see the dialog).
  function handleLogoutClick() {
    if (analyzingRepo) {
      setLogoutConfirmOpen(true);
    } else {
      void signOut();
    }
  }

  // Confirmed log-out from an analysis: end the session and return to the landing
  // page rather than leaving the user on a now-signed-out analysis route.
  async function confirmLogout() {
    setLogoutConfirmOpen(false);
    await signOut();
    router.push("/");
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
        <Button
          variant="ghost"
          size="sm"
          className="group gap-0"
          onClick={handleLogoutClick}
        >
          <HoverPopIcon>
            <LogOut />
          </HoverPopIcon>
          Log out
        </Button>
        <ConfirmDialog
          open={logoutConfirmOpen}
          onOpenChange={setLogoutConfirmOpen}
          title="Log out of RepoFrame?"
          description={
            analyzingRepo
              ? `You're analyzing ${analyzingRepo}. Logging out ends this session — you can reopen it from History anytime.`
              : "Logging out will end your current session."
          }
          confirmLabel="Log out"
          onConfirm={() => void confirmLogout()}
        />
      </div>
    );
  }

  // signedOut
  return (
    <Button
      variant="outline"
      size="sm"
      className="group gap-0"
      onClick={() => void signInWithGitHub()}
    >
      <HoverPopIcon>
        <GithubMark />
      </HoverPopIcon>
      Log in with GitHub
    </Button>
  );
}
