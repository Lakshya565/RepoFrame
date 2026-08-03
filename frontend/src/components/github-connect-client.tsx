"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import {
  getGitHubConnections,
  startGitHubInstall,
} from "@/lib/github-app-api";

function safeReturnTo(value: string | null) {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/";
  }
  return value;
}

export function GitHubConnectClient() {
  const params = useSearchParams();
  const router = useRouter();
  const { status, signInWithGitHub } = useAuth();
  const started = useRef(false);
  const returnTo = safeReturnTo(params.get("returnTo"));
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (status !== "signedIn" || started.current) {
      return;
    }
    started.current = true;
    let active = true;
    async function connect() {
      try {
        // A GitHub callback that had to restore its Supabase session must finish
        // exchanging its one-time code before starting any new install flow.
        if (returnTo.startsWith("/github/installed?")) {
          router.replace(returnTo);
          return;
        }
        const connection = await getGitHubConnections();
        if (connection.status === "connected") {
          router.replace(returnTo);
          return;
        }
        const install = await startGitHubInstall(returnTo);
        sessionStorage.setItem("repoframe:github-install-state", install.state);
        if (install.codeVerifier) {
          sessionStorage.setItem(
            "repoframe:github-code-verifier",
            install.codeVerifier,
          );
        } else {
          sessionStorage.removeItem("repoframe:github-code-verifier");
        }
        const nextUrl = install.authorizationUrl ?? install.installUrl;
        if (!nextUrl) {
          throw new Error("GitHub connection did not return a destination.");
        }
        window.location.assign(nextUrl);
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "RepoFrame could not connect GitHub.",
          );
        }
      }
    }
    void connect();
    return () => {
      active = false;
    };
  }, [retryKey, returnTo, router, status]);

  if (status === "signedOut") {
    return (
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Continue with GitHub to sign in and connect repository access.
        </p>
        <Button
          variant="brand"
          onClick={() => void signInWithGitHub(returnTo)}
        >
          Continue with GitHub
        </Button>
      </Card>
    );
  }

  if (status === "disabled") {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        GitHub connection requires the hosted RepoFrame configuration.
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <XCircle className="size-8 text-destructive" />
        <h1 className="font-semibold">Could not connect GitHub</h1>
        <p className="text-sm text-muted-foreground">{error}</p>
        <div className="flex gap-2">
          <Button
            variant="brand"
            onClick={() => {
              started.current = false;
              setError(null);
              setRetryKey((value) => value + 1);
            }}
          >
            Try again
          </Button>
          <Link href={returnTo}>
            <Button variant="outline">Continue without private repos</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col items-center gap-3 p-8 text-center">
      <Loader2 className="size-8 animate-spin text-brand" />
      <h1 className="font-semibold">Connecting GitHub</h1>
      <p className="text-sm text-muted-foreground">
        Checking your repository access and continuing setup if needed…
      </p>
    </Card>
  );
}
