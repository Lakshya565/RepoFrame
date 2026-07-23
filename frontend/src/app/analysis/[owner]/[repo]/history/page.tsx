import { SavedProjectsList } from "@/components/saved-projects-list";

// Lists the signed-in user's saved analyses inside the current workspace.
export default function HistoryTabPage() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Saved analyses</h2>
      <SavedProjectsList />
    </div>
  );
}
