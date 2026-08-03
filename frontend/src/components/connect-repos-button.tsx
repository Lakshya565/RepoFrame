"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Unplug } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import {
  disconnectGitHub,
  getGitHubConnections,
  startGitHubInstall,
  type GitHubConnections,
} from "@/lib/github-app-api";
import { cn } from "@/lib/utils";

export function ConnectReposButton({ className }: { className?: string }) {
  const { status } = useAuth();
  const [connection, setConnection] = useState<GitHubConnections | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== "signedIn") {
      return;
    }
    let active = true;
    getGitHubConnections()
      .then((result) => {
        if (active) setConnection(result);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Connection unavailable.");
        }
      });
    return () => {
      active = false;
    };
  }, [status]);

  if (status !== "signedIn") {
    return null;
  }

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      const install = await startGitHubInstall(
        returnTo,
        connection?.status === "connected",
      );
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
      setError(caught instanceof Error ? caught.message : "Could not connect GitHub.");
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await disconnectGitHub();
      setConnection({ status: "not_connected", installations: [] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not disconnect GitHub.");
    } finally {
      setBusy(false);
    }
  }

  if (!connection && !error) {
    return (
      <span className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <Loader2 className="size-3.5 animate-spin" />
        Checking GitHub access…
      </span>
    );
  }

  if (connection?.status === "connected") {
    const accounts = connection.installations.map((item) => item.accountLogin).join(", ");
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={accounts}>
          <Check className="size-3.5 text-brand" />
          {connection.installations.length === 1
            ? `${accounts} connected`
            : `${connection.installations.length} GitHub accounts connected`}
        </span>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void connect()}>
          Manage
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void disconnect()}>
          <Unplug />
          Disconnect
        </Button>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void connect()}>
        {busy ? <Loader2 className="animate-spin" /> : null}
        {connection?.status === "reauthorization_required" ? "Reconnect GitHub" : "Connect private repos"}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
