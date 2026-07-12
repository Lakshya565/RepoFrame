"use client";

import type { ReactNode } from "react";
import { Dialog } from "radix-ui";

import { Button, type ButtonProps } from "@/components/ui/button";

// A small centered confirm/cancel dialog built on Radix Dialog (focus trap, Esc to
// cancel, and a click on the backdrop cancels). The backdrop is a slight dim +
// blur so the page recedes and attention stays on the prompt. Confirm fires the
// caller's action; Cancel just closes. Reusable, but currently the log-out warning
// is its only caller.
type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmVariant = "brand",
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Slight dim + blur so the background recedes without going fully dark. */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/50 backdrop-blur-sm duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-xl duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-reduce:animate-none">
          <Dialog.Title className="text-base font-semibold">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </Dialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="outline" size="sm">
                {cancelLabel}
              </Button>
            </Dialog.Close>
            <Button variant={confirmVariant} size="sm" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
