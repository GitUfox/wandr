/**
 * Supabase client — lazy, env-gated. The accounts feature switch.
 *
 * Absent env vars ⇒ every accounts surface reports "not configured" and the
 * app is byte-identical to the local-only build. Setting the two vars (plus a
 * redeploy, since VITE_ vars bake at build time) IS the activation — the same
 * self-activation pattern as venue grounding.
 *
 * ── Why a VITE_ key is correct here when it was a firing offense for the
 *    Anthropic key ──
 * The Anthropic key is a SECRET: possession = spend money as us. The Supabase
 * anon key is a PUBLISHABLE key by design — Supabase's own docs ship it to the
 * browser. It grants nothing by itself; Row Level Security (see the migration)
 * is the boundary that keeps user A out of user B's rows. The thing that must
 * never appear here (or anywhere client-side) is the service_role key.
 *
 * supabase-js is dynamically imported so the ~30KB+ lands in its own chunk,
 * paid only when accounts are configured — same treatment as Globe.jsx.
 */

const URL_  = import.meta.env.VITE_SUPABASE_URL;
const ANON  = import.meta.env.VITE_SUPABASE_ANON_KEY;

let clientPromise = null;

/** True when the deploy has Supabase wired at build time. */
export function accountsConfigured() {
  return !!(URL_ && ANON);
}

/** The shared client, or null when accounts aren't configured. */
export function getSupabase() {
  if (!accountsConfigured()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(URL_, ANON, {
        auth: {
          // Magic-link flow: the emailed link returns with tokens in the URL;
          // detectSessionInUrl consumes them on load. Session persists in
          // localStorage under Supabase's own sb-* keys (NOT wandr_* — so
          // "Clear my data" wipes trips but not the sign-in, which is its own
          // explicit Sign out action).
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    ).catch(() => null); // chunk load failure (offline first hit) — fail soft
  }
  return clientPromise;
}
