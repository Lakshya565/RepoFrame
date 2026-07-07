"use client";

import { useProjectAutoSave } from "@/lib/use-project-autosave";

// Headless mount point for the auto-save effect. Rendered inside the analysis
// layout's GenerationProvider so the hook can read the workspace state; renders no
// UI. Auto-save is itself gated (feature flag + signed-in + content), so this is
// inert in the public/dev flow.
export function ProjectAutoSave() {
  useProjectAutoSave();
  return null;
}
