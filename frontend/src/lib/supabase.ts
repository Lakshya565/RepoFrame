import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Single browser-side Supabase client for the whole app. RepoFrame's data all
// flows through the separate FastAPI backend (not Next server actions), so the
// only thing Supabase does on the client is AUTH: sign the user in with GitHub and
// hold the session. We then attach that session's access token as a Bearer header
// on our backend calls (see repo-api.ts). No cookies / SSR handoff is needed.
//
// Everything here is safe for the browser bundle: the URL and the PUBLISHABLE key
// (NEXT_PUBLIC_*) are public by design. The service-role/secret key never appears
// in the frontend.

// Read once at module load. NEXT_PUBLIC_* values are inlined at build time; when
// unset (local dev / self-host with no Supabase) both are "" and the app runs in
// its original no-login mode.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// True when the frontend has what it needs to talk to Supabase Auth. Callers use
// this to decide between the login-gated experience and the open dev flow.
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// Memoized client so the whole app shares one session + one refresh loop.
let client: SupabaseClient | null = null;

// Returns the shared client, or null when Supabase is not configured. Returning
// null (rather than throwing) lets the auth layer degrade to "disabled" cleanly.
export function getSupabaseClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // Persist across reloads and refresh access tokens automatically, and
        // parse the tokens Supabase appends to the URL after the OAuth redirect.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

// The current access token (a Supabase-signed JWT), or null when not signed in /
// not configured. This is what the backend verifies (auth.py). Read fresh each
// call so an auto-refreshed token is always the one we send.
export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
