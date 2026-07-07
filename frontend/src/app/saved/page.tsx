import { SiteHeader } from "@/components/site-header";
import { SavedProjectsList } from "@/components/saved-projects-list";
import { ConnectReposButton } from "@/components/connect-repos-button";

// Standalone "Saved projects" page. A signed-in user's home for their saved
// analyses, separate from any single repo's History tab. Gated behind
// NEXT_PUBLIC_SHOW_SAVED so it stays dark until the feature ships.
const SAVED_FEATURE_ENABLED = process.env.NEXT_PUBLIC_SHOW_SAVED === "true";

export default function SavedPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Saved projects
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your saved repo analyses. Open one to revisit it, or delete what you
              no longer need.
            </p>
          </div>
          {/* Connect the GitHub App to analyze private repos (Phase 15.6). */}
          <ConnectReposButton className="shrink-0" />
        </div>
        <div className="mt-6">
          {SAVED_FEATURE_ENABLED ? (
            <SavedProjectsList />
          ) : (
            <p className="text-sm text-muted-foreground">
              Saved projects will appear here once the feature is enabled.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
