import { AuthButton } from "@/components/auth-button";
import { HomeButton } from "@/components/home-button";
import { ThemeToggle } from "@/components/theme-toggle";

// Slim top bar shared across pages: the Home control (left) and, on the right, the
// sign-in control + the light/dark toggle. Kept intentionally minimal — no nav
// menu — so the app reads as a focused developer tool, not a marketing site. The
// Home control is a hover button that reveals a house icon and reloads to "/".
// AuthButton renders nothing when Supabase is unconfigured, so the dev layout is
// visually unchanged.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <HomeButton />
        <div className="flex items-center gap-2">
          <AuthButton />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
