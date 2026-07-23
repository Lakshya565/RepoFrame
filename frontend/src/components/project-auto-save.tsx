"use client";

import { useProjectAutoSave } from "@/lib/use-project-autosave";

// Headless mount point for the auto-save effect. Rendered inside the analysis
// layout's GenerationProvider so the hook can read the workspace state; renders no
// UI. The hook stays inert until a signed-in workspace has savable content, so
// this component is safe to mount unconditionally.
export function ProjectAutoSave() {
  useProjectAutoSave();
  return null;
}
