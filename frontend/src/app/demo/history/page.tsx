import { FolderGit2 } from "lucide-react";

import { GateOverlay } from "@/components/gate-overlay";
import { Card } from "@/components/ui/card";

// The demo's History tab: fully login-gated. A single saved analysis — RepoFrame
// itself — sits behind the gate so a visitor sees what history looks like, but it
// holds no real data and never calls the saved-projects API.
export default function DemoHistoryPage() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Saved analyses</h2>
      <GateOverlay title="Log in to keep your history">
        <ul className="grid gap-3 sm:grid-cols-2">
          <li>
            <Card className="flex items-center gap-3 p-4">
              <span className="flex size-9 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
                <FolderGit2 className="size-4" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium">RepoFrame</span>
                <span className="text-xs text-muted-foreground">
                  Updated 2 days ago
                </span>
              </span>
            </Card>
          </li>
        </ul>
      </GateOverlay>
    </div>
  );
}
