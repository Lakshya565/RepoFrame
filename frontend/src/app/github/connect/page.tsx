import { Suspense } from "react";

import { GitHubConnectClient } from "@/components/github-connect-client";
import { SiteHeader } from "@/components/site-header";

export default function GitHubConnectPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto w-full max-w-xl flex-1 px-5 py-16 sm:px-8">
        <Suspense
          fallback={
            <p className="py-12 text-center text-sm text-muted-foreground">
              Connecting GitHub…
            </p>
          }
        >
          <GitHubConnectClient />
        </Suspense>
      </div>
    </main>
  );
}
