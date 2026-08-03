"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import {
  completeGitHubInstall,
  connectInstallation,
} from "@/lib/github-app-api";

type Outcome =
  | { ok: true; body: string; returnTo: string }
  | { ok: false; message: string };

export function GithubInstalledClient() {
  const params = useSearchParams();
  const router = useRouter();
  const { status, signInWithGitHub } = useAuth();
  const started = useRef(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const code = params.get("code");
  const queryState = params.get("state");
  const oauthError = params.get("error_description") ?? params.get("error");
  const installationIdRaw = params.get("installation_id");
  const installationId = installationIdRaw ? Number(installationIdRaw) : NaN;
  const hasLegacyId = Boolean(installationIdRaw) && Number.isFinite(installationId);
  const hasOAuthCallback = Boolean(code);

  useEffect(() => {
    if (
      status !== "signedIn" ||
      started.current ||
      oauthError ||
      (!hasOAuthCallback && !hasLegacyId)
    ) {
      return;
    }
    started.current = true;
    let active = true;
    async function finish() {
      try {
        if (code) {
          const callbackState =
            queryState ?? sessionStorage.getItem("repoframe:github-install-state");
          if (!callbackState) {
            throw new Error(
              "GitHub returned without the connection state. Start the connection again.",
            );
          }
          const codeVerifier = sessionStorage.getItem(
            "repoframe:github-code-verifier",
          );
          const result = await completeGitHubInstall(
            code,
            callbackState,
            codeVerifier,
          );
          sessionStorage.removeItem("repoframe:github-install-state");
          sessionStorage.removeItem("repoframe:github-code-verifier");
          if (result.nextUrl && result.state) {
            sessionStorage.setItem(
              "repoframe:github-install-state",
              result.state,
            );
            window.location.assign(result.nextUrl);
            return;
          }
          const accountCount = result.installations.length;
          const body = accountCount
            ? `${accountCount} GitHub ${accountCount === 1 ? "account is" : "accounts are"} ready for private-repository analysis.`
            : "GitHub authorization succeeded, but no RepoFrame installation was selected.";
          if (active) {
            setOutcome({ ok: true, body, returnTo: result.returnTo });
            router.replace(result.returnTo);
          }
          return;
        }

        const connection = await connectInstallation(installationId);
        if (active) {
          setOutcome({
            ok: true,
            body: `${connection.accountLogin} was linked. Reconnect once to authorize private-repository access.`,
            returnTo: "/github/connect",
          });
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
    void finish();
    return () => {
      active = false;
    };
  }, [code, hasLegacyId, hasOAuthCallback, installationId, oauthError, queryState, router, status]);

  if (status === "loading") {
    return <Centered>Checking your session…</Centered>;
  }
  if (status === "disabled") {
    return <Centered>Connecting GitHub requires the hosted RepoFrame.</Centered>;
  }
  if (status === "signedOut") {
    const callbackPath = `/github/installed?${params.toString()}`;
    return (
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Continue with GitHub to finish connecting repository access.
        </p>
        <Button variant="brand" onClick={() => void signInWithGitHub(callbackPath)}>
          Continue with GitHub
        </Button>
      </Card>
    );
  }
  if (oauthError) {
    return (
      <StatusCard
        icon={<XCircle className="size-8 text-destructive" />}
        title="GitHub connection canceled"
        body={oauthError}
        action={<Link href="/"><Button variant="outline">Return home</Button></Link>}
      />
    );
  }
  if (!hasOAuthCallback && !hasLegacyId) {
    return (
      <StatusCard
        icon={<XCircle className="size-8 text-destructive" />}
        title="Missing GitHub authorization"
        body="Start the connection from RepoFrame so the callback can be verified."
        action={<Link href="/github/connect"><Button variant="brand">Connect GitHub</Button></Link>}
      />
    );
  }
  if (outcome === null) {
    return (
      <StatusCard
        icon={<Loader2 className="size-8 animate-spin text-brand" />}
        title="Connecting GitHub…"
        body="Verifying your GitHub identity and repository installations."
      />
    );
  }
  if (!outcome.ok) {
    return (
      <StatusCard
        icon={<XCircle className="size-8 text-destructive" />}
        title="Could not connect"
        body={outcome.message}
        action={<Link href="/github/connect"><Button variant="brand">Try again</Button></Link>}
      />
    );
  }
  return (
    <StatusCard
      icon={<CheckCircle2 className="size-8 text-brand" />}
      title="GitHub connected"
      body={outcome.body}
      action={<Link href={outcome.returnTo}><Button variant="brand">Continue</Button></Link>}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <p className="py-12 text-center text-sm text-muted-foreground">{children}</p>;
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
