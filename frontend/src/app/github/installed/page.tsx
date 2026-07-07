import { Suspense } from "react";

import { SiteHeader } from "@/components/site-header";
import { GithubInstalledClient } from "@/components/github-installed-client";

// GitHub App post-install landing (the App's Setup URL points here). The client
// piece reads the installation_id from the query string, so it's wrapped in
// Suspense per Next's requirement for useSearchParams.
export default function GithubInstalledPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto w-full max-w-xl flex-1 px-5 py-16 sm:px-8">
        <Suspense
          fallback={
            <p className="py-12 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          }
        >
          <GithubInstalledClient />
        </Suspense>
      </div>
    </main>
  );
}
