/**
 * Keepalive — one daily round-trip to each free-tier datastore so neither is
 * flagged inactive and shut down.
 *
 * Supabase pauses a Free-plan project after 7 days with no API requests. It
 * happened on 2026-10-08: the project host lost its DNS record and every
 * sign-in failed. One REST request per day is enough activity to prevent it.
 *
 * Wandr's only other Redis traffic is per-IP rate limiting, which fires only
 * when someone actually builds a trip. On a low-traffic personal app that can
 * be zero commands for weeks — long enough for Upstash to consider the
 * database dormant. This endpoint writes one key per day so the account always
 * shows activity.
 *
 * Invoked by the Vercel cron defined in vercel.json. Not browser-facing:
 * no CORS headers, GET only, and a bearer-token guard.
 *
 * Env vars (set in Vercel dashboard):
 *   CRON_SECRET             — required. Without it this endpoint refuses to
 *                             run (fail closed), so it can never be an open
 *                             lever for burning the Upstash command quota.
 *   UPSTASH_REDIS_REST_URL  — required (already set for rate limiting)
 *   UPSTASH_REDIS_REST_TOKEN— required (already set for rate limiting)
 *   VITE_SUPABASE_URL       — optional. Without it the Supabase ping is skipped.
 *   VITE_SUPABASE_ANON_KEY  — optional. Publishable key; RLS makes the query
 *                             return no rows, the request still counts as use.
 */

import { timingSafeEqual } from "crypto";
import { Redis } from "@upstash/redis";

const KEY = "wandr:keepalive";

// 30 days. Comfortably outlives the daily cron, so the key is always present
// as a "last seen" marker, but self-cleans if the cron is ever removed.
const TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Constant-time bearer-token check. Exported for tests.
 *
 * Returns false when CRON_SECRET is unset — an unauthenticated write endpoint
 * is a quota-burn vector, so absent config means closed, not open.
 */
export function isAuthorizedCron(req, secret) {
  if (!secret) return false;

  const header = req.headers?.authorization || "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;

  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  // timingSafeEqual throws on length mismatch — compare lengths first. The
  // length itself is not a meaningful leak for a random secret.
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/**
 * One REST request against the trips table. Anonymous, so RLS returns an
 * empty list. Exported for tests. Returns { ok, status } or { skipped: true }.
 */
export async function pingSupabase(url, key, fetchImpl = fetch) {
  if (!url || !key) return { skipped: true };
  try {
    const r = await fetchImpl(`${url}/rest/v1/trips?select=id&limit=1`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    return { ok: r.ok, status: r.status };
  } catch (err) {
    return { ok: false, error: err?.cause?.code || err?.message || "fetch failed" };
  }
}

export default async function handler(req, res) {
  // Vercel cron issues GET.
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  if (!isAuthorizedCron(req, process.env.CRON_SECRET)) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.error("[wandr keepalive] Upstash credentials are not configured");
    res.status(503).json({ error: "Keepalive is not configured." });
    return;
  }

  const stamp = new Date().toISOString();

  try {
    const redis = new Redis({ url, token });
    const started = Date.now();
    // Write then read back — proves a full round-trip, not just a reachable
    // endpoint, and registers as real command activity on the account.
    await redis.set(KEY, stamp, { ex: TTL_SECONDS });
    const readBack = await redis.get(KEY);
    const roundTripMs = Date.now() - started;

    if (readBack !== stamp) {
      console.error("[wandr keepalive] read-back mismatch");
      res.status(502).json({ error: "Keepalive round-trip failed." });
      return;
    }

    const supabase = await pingSupabase(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    if (supabase.ok === false) console.error("[wandr keepalive] Supabase ping failed:", supabase.status || supabase.error);

    console.log(`[wandr keepalive] ok — ${stamp} (${roundTripMs}ms)`);
    res.status(200).json({ ok: true, pingedAt: stamp, roundTripMs, supabase });
  } catch (err) {
    console.error("[wandr keepalive] Redis error:", err.message);
    res.status(502).json({ error: "Couldn't reach the datastore." });
  }
}
