"use client";

import { useProjectHydrate } from "@/lib/use-project-hydrate";

// Headless mount point for the reopen-from-history hydrate (Phase 16.0). Rendered
// inside the analysis layout's GenerationProvider (next to ProjectAutoSave) so the
// hook can populate the workspace state; renders no UI. Inert unless the route was
// opened with a ?projectId= query by the saved-projects "Open" button.
export function ProjectHydrator() {
  useProjectHydrate();
  return null;
}
