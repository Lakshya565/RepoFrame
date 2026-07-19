"use client";

import { Dialog } from "radix-ui";
import { FolderOpen, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

// Shown when a user analyzes a repo they have ALREADY analyzed (it's in their
// History). Because analyzing now records a repo in History (see
// use-project-autosave), a re-paste of the same URL would otherwise silently create
// a duplicate; instead we ask what they want. Two explicit actions — reopen the
// saved snapshot, or re-analyze fresh (which upserts the same row) — so neither the
// ConfirmDialog's single confirm nor a bare cancel would fit. Escape / backdrop
// dismisses without navigating.
type DuplicateRepoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: string;
  repo: string;
  // ISO timestamp of the saved analysis, shown so the user knows how stale it is.
  updatedAt: string;
  onOpenSaved: () => void;
  onReanalyze: () => void;
};

export function DuplicateRepoDialog({
  open,
  onOpenChange,
  owner,
  repo,
  updatedAt,
  onOpenSaved,
  onReanalyze,
}: DuplicateRepoDialogProps) {
  const when = new Date(updatedAt);
  const whenLabel = Number.isNaN(when.getTime())
    ? null
    : when.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/50 backdrop-blur-sm duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-xl duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-reduce:animate-none">
          <Dialog.Title className="text-base font-semibold">
            You&apos;ve already analyzed this repo
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
            <span className="font-mono text-foreground">
              {owner}/{repo}
            </span>{" "}
            is already in your History
            {whenLabel ? <> — last saved {whenLabel}</> : null}. Open your saved
            analysis, or re-analyze it fresh?
          </Dialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" size="sm" onClick={onReanalyze}>
              <RefreshCw />
              Re-analyze fresh
            </Button>
            <Button variant="brand" size="sm" onClick={onOpenSaved}>
              <FolderOpen />
              Open saved
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
