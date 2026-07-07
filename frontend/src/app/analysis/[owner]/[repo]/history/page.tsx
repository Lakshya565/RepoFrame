import { History } from "lucide-react";

import { Card } from "@/components/ui/card";
import { SavedProjectsList } from "@/components/saved-projects-list";

// The History tab. When the saved-projects feature is enabled
// (NEXT_PUBLIC_SHOW_SAVED), it lists the signed-in user's saved analyses; until
// then it keeps the original "coming soon" placeholder so the flag can ship dark.
const SAVED_FEATURE_ENABLED = process.env.NEXT_PUBLIC_SHOW_SAVED === "true";

export default function HistoryTabPage() {
  if (SAVED_FEATURE_ENABLED) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Saved analyses</h2>
        <SavedProjectsList />
      </div>
    );
  }

  return (
    <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      <History className="size-8 text-muted-foreground" aria-hidden />
      <div>
        <h2 className="text-base font-semibold">History is coming soon</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Saved analyses and past generations will live here once accounts and
          storage land in a later phase.
        </p>
      </div>
    </Card>
  );
}
