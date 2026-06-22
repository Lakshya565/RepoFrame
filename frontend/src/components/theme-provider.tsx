"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Thin client wrapper around next-themes so the server-rendered root layout can
// stay a server component while theme state lives on the client.
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
