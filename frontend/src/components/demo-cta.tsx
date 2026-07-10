"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { GithubMark } from "@/components/github-mark";

// Call-to-action shown on the demo. A signed-in visitor is nudged to analyze their
// own repo; everyone else is prompted to log in. Kept tiny and client-side so the
// demo page itself can stay a server component fed by the static fixture.
export function DemoCta() {
  const { status, signInWithGitHub } = useAuth();
  const router = useRouter();

  if (status === "signedIn") {
    return (
      <Button variant="brand" onClick={() => router.push("/")}>
        Analyze your own repo
        <ArrowRight />
      </Button>
    );
  }

  return (
    <Button variant="brand" onClick={() => void signInWithGitHub()}>
      <GithubMark />
      Log in with GitHub to analyze your own repo
    </Button>
  );
}
