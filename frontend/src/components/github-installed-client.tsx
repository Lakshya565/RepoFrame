"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { connectInstallation, type Connection } from "@/lib/github-app-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// The post-install landing (GitHub's Setup URL points here). It reads the
// installation_id GitHub appends, then asks the backend to bind that installation
// to the signed-in user. The view is DERIVED from auth status + params so the only
// state the effect sets happens after the await (satisfying the no-sync-setState
// rule); the network result lands in `outcome`.
type Outcome =
  | { ok: true; connection: Connection }
  | { ok: false; message: string };

export function GithubInstalledClient() {
  const params = useSearchParams();
  const { status, signInWithGitHub } = useAuth();
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const installationIdRaw = params.get("installation_id");
  const installationId = installationIdRaw ? Number(installationIdRaw) : NaN;
  const hasValidId = Boolean(installationIdRaw) && !Number.isNaN(installationId);

  // Only the actual bind runs in the effect, and only when signed in with a valid
  // id. setOutcome fires after the await, never synchronously in the effect body.
  useEffect(() => {
    if (status !== "signedIn" || !hasValidId) {
      return;
    }
    let active = true;
    async function run() {
      try {
        const connection = await connectInstallation(installationId);
        if (active) {
          setOutcome({ ok: true, connection });
        }
      } catch (caught) {
        if (active) {
          setOutcome({
            ok: false,
            message:
              caught instanceof Error
                ? caught.message
                : "RepoFrame could not connect the GitHub App.",
          });
        }
      }
    }
    void run();
    return () => {
      active = false;
    };
  }, [status, hasValidId, installationId]);

  // Still resolving the session.
  if (status === "loading") {
    return <Centered>Checking your session…</Centered>;
  }

  // Should not happen on the hosted app (this page implies Supabase is configured).
  if (status === "disabled") {
    return (
      <Centered>Connecting the GitHub App requires the hosted RepoFrame.</Centered>
    );
  }

  if (status === "signedOut") {
    return (
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Log in with GitHub to finish connecting the app.
        </p>
        <Button variant="brand" onClick={() => void signInWithGitHub()}>
          Log in with GitHub
        </Button>
      </Card>
    );
  }

  if (!hasValidId) {
    return (
      <StatusCard
        icon={<XCircle className="size-8 text-destructive" />}
        title="Missing installation"
        body="This page expects an installation_id from GitHub. Try installing the app again from RepoFrame."
      />
    );
  }

  if (outcome === null) {
    return (
      <StatusCard
        icon={<Loader2 className="size-8 animate-spin text-brand" />}
        title="Connecting…"
        body="Linking your GitHub App installation to your RepoFrame account."
      />
    );
  }

  if (!outcome.ok) {
    return (
      <StatusCard
        icon={<XCircle className="size-8 text-destructive" />}
        title="Could not connect"
        body={outcome.message}
      />
    );
  }

  return (
    <StatusCard
      icon={<CheckCircle2 className="size-8 text-brand" />}
      title="GitHub App connected"
      body={`Connected as ${outcome.connection.accountLogin} (${outcome.connection.repoSelection} repositories). You can now analyze your private repositories.`}
      action={
        <Link href="/">
          <Button variant="brand">Analyze a repo</Button>
        </Link>
      }
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-12 text-center text-sm text-muted-foreground">{children}</p>
  );
}

function StatusCard({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 p-8 text-center">
      {icon}
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
      {action}
    </Card>
  );
}
