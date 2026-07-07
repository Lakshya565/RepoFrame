"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

// App-wide auth state, lifted into a client provider mounted in the root layout
// (React context can't live in a server component). Every part of the UI reads
// the current sign-in status from here — the header button, the login gates on
// the context form, and the saved/history surfaces.

// The four states the rest of the UI branches on:
//   - "disabled": Supabase isn't configured (local dev / self-host) → no login UI,
//     the app behaves exactly as it did before Phase 15.
//   - "loading": configured, still resolving the persisted session on first paint.
//   - "signedOut" / "signedIn": resolved.
export type AuthStatus = "disabled" | "loading" | "signedOut" | "signedIn";

type AuthContextValue = {
  status: AuthStatus;
  // Convenience flag: true only in the production-like configured state, whether
  // or not the user is signed in. Drives the "show the demo / gate the form" UI.
  configured: boolean;
  user: User | null;
  session: Session | null;
  signInWithGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(
    configured ? "loading" : "disabled",
  );

  // Resolve the persisted session once, then subscribe to auth changes (login,
  // logout, token refresh). Only runs when configured; the dev flow stays inert.
  useEffect(() => {
    if (!configured) {
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }
      setSession(data.session);
      setStatus(data.session ? "signedIn" : "signedOut");
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setStatus(nextSession ? "signedIn" : "signedOut");
      },
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [configured]);

  // Start the GitHub OAuth flow, returning the user to the page they left from.
  const signInWithGitHub = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: window.location.origin },
    });
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      configured,
      user: session?.user ?? null,
      session,
      signInWithGitHub,
      signOut,
    }),
    [status, configured, session, signInWithGitHub, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Reads auth state. Throws if used outside the provider so a missing layout
// wrapper fails loudly rather than silently reporting "signed out".
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return value;
}
