import type { Metadata } from "next";
import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { MetricsDrawer } from "@/components/metrics/metrics-drawer";
import { ScrollProgress } from "@/components/ui/scroll-progress";

// IBM Plex Sans for body/UI text and JetBrains Mono for code, file paths, and
// data labels — a deliberate developer-tool pairing rather than a single generic
// sans. Both are self-hosted by next/font (no external requests, no layout shift).
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  // 800 (ExtraBold) is loaded for the large "RepoFrame" hero wordmark.
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "RepoFrame",
  description:
    "Turn GitHub repositories into evidence-backed project writeups.",
};

// Root layout applies the shared fonts and wraps the app in the theme provider.
// `suppressHydrationWarning` is required because next-themes sets the `class` on
// <html> on the client, which would otherwise mismatch the server-rendered HTML.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plexSans.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Thin green rail pinned to the top of every page, tracking scroll. */}
          <ScrollProgress />
          {children}
          <MetricsDrawer />
        </ThemeProvider>
      </body>
    </html>
  );
}
