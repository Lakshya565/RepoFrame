import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

// Slim top bar shared across pages: the RepoFrame wordmark (links home) and the
// light/dark toggle. Kept intentionally minimal — no nav menu — so the app reads
// as a focused developer tool, not a marketing site. The wordmark uses the mono
// font to reinforce the developer-tool identity.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="font-mono text-sm font-semibold tracking-tight transition-colors hover:text-brand"
        >
          RepoFrame
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
