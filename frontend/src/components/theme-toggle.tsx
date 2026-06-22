"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

// Icon button that flips between light and dark. next-themes only resolves the
// active theme on the client, so we guard on `mounted` to avoid a hydration
// mismatch — before mount we render an invisible placeholder icon to hold the
// button's size without flashing the wrong glyph.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // Flip to mounted exactly once after the first client render. This is the
  // canonical next-themes hydration guard, so the synchronous setState here is
  // intentional (it runs a single time, not a cascading render loop).
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={
        mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Toggle theme"
      }
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {!mounted ? (
        <Sun className="opacity-0" />
      ) : isDark ? (
        <Sun />
      ) : (
        <Moon />
      )}
    </Button>
  );
}
