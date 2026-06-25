"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// The analysis page's top-level sections, in display order. Each is a real route
// segment under the repo's base path (an empty segment is the base path itself).
// History is a stub today but lives here so the information architecture — and
// the place a later, database-backed history view will slot in — is visible now.
const TABS: { label: string; segment: string }[] = [
  { label: "Analysis", segment: "" },
  { label: "Generate", segment: "generate" },
  { label: "History", segment: "history" },
];

type AnalysisTabsProps = {
  // The repo's base route, e.g. "/analysis/facebook/react". Tab hrefs are built
  // by appending each segment to this.
  basePath: string;
};

// Route-based tab bar for the analysis page. These are navigation links (not
// in-page tab panels), so each tab is its own URL — shareable, back/forward
// friendly, and code-split. The active tab is derived from the current path and
// marked with aria-current; the indicator is a border/color change only, so it
// is calm under prefers-reduced-motion.
export function AnalysisTabs({ basePath }: AnalysisTabsProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Analysis sections" className="border-b">
      <ul className="-mb-px flex gap-1">
        {TABS.map((tab) => {
          const href = tab.segment ? `${basePath}/${tab.segment}` : basePath;
          const isActive = pathname === href;

          return (
            <li key={tab.segment || "analysis"}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex items-center border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "border-brand text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
