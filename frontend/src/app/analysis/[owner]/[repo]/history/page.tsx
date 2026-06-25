import { History } from "lucide-react";

import { Card } from "@/components/ui/card";

// The History tab: a placeholder today. A later phase will back this with the
// database of saved analyses and past generations; the tab exists now so the
// information architecture is visible and the eventual view has its home.
export default function HistoryTabPage() {
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
