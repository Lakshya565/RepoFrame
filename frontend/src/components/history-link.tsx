"use client";

import Link from "next/link";
import { History } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HistoryLink() {
  const { status } = useAuth();
  if (status !== "signedIn") {
    return null;
  }
  return (
    <Link
      href="/saved"
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}
    >
      <History />
      History
    </Link>
  );
}
