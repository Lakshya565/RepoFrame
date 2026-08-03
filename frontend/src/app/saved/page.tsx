import { SiteHeader } from "@/components/site-header";
import { SavedProjectsList } from "@/components/saved-projects-list";
import { ConnectReposButton } from "@/components/connect-repos-button";

// Standalone home for a signed-in user's saved repository analyses.
export default function SavedPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              History
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your saved repository analyses. Open one to revisit it, or delete what you
              no longer need.
            </p>
          </div>
          {/* Repository authorization stays visible alongside saved work. */}
          <ConnectReposButton className="shrink-0" />
        </div>
        <div className="mt-6">
          <SavedProjectsList />
        </div>
      </div>
    </main>
  );
}
