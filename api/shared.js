/**
 * Shared proxy logic — imported by both server.js (Express dev) and
 * api/anthropic.js (Vercel serverless).
 *
 * Any change here applies to both environments automatically.
 */

import { Redis }      from "@upstash/redis";
import { Ratelimit }  from "@upstash/ratelimit";

const TARGET = "https://api.anthropic.com/v1/messages";

// Only these models may be requested — prevents key abuse for arbitrary workloads.
const ALLOWED_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-8",
]);

// Hard cap on tokens regardless of what the client requests.
const MAX_TOKENS_CAP = 16_000;

// ── CORS ──────────────────────────────────────────────────────────────────────

export const LOCAL_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
]);

export function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (LOCAL_ORIGINS.has(origin)) return true;
  if (process.env.ALLOWED_ORIGIN && origin === process.env.ALLOWED_ORIGIN) return true;
  if (process.env.VERCEL_URL && origin === `https://${process.env.VERCEL_URL}`) return true;
  if (process.env.VERCEL_BRANCH_URL && origin === `https://${process.env.VERCEL_BRANCH_URL}`) return true;
  return false;
}

export function setCorsHeaders(res, origin) {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

// A trip build is now two parallel non-stream calls (categories + meta), so
// each logical trip consumes two against this counter. 6 ⇒ ~3 trips per IP/day.
const LIMIT_TRIPS = 6;
const LIMIT_PLANS = 10;
// Venue-grounding lookups (api/places). One call per trip build normally;
// 20 leaves headroom for retries while bounding per-IP Google-quota spend.
// (The structural backstop is the request cap set in Google Cloud Console —
// app-layer limits alone must never be the only thing between us and a bill.)
const LIMIT_PLACES = 20;
export const WINDOW_MS = 24 * 60 * 60 * 1000;

// ── Redis-backed limiters (production) ───────────────────────────────────────
//
// Initialized only when Upstash credentials are present in the environment.
// When absent (local dev, or if Redis is misconfigured), all rate-limit calls
// fall through to the in-memory stub below — users are never locked out due to
// a missing Redis connection.
//
// To enable: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in the
// Vercel dashboard. Never commit these values to source control.

function createRedisLimiters() {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const redis = new Redis({ url, token });

  return {
    trips: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(LIMIT_TRIPS, "24 h"),
      prefix:  "wandr:trips",
    }),
    plans: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(LIMIT_PLANS, "24 h"),
      prefix:  "wandr:plans",
    }),
    places: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(LIMIT_PLACES, "24 h"),
      prefix:  "wandr:places",
    }),
  };
}

const redisLimiters = createRedisLimiters();

// ── In-memory fallback stub ───────────────────────────────────────────────────
//
// Used when Redis is not configured. In Vercel serverless this Map resets on
// every cold start (effectively no-op). In the Express dev server it persists
// for the process lifetime and provides real limiting in development.

// Exported so server.js can prune stale entries in its hourly setInterval.
export const rateLimitStore = new Map();

export function getClientIp(req) {
  // Prefer x-real-ip: on Vercel the edge sets it to the actual connecting
  // client, so (unlike the leftmost value of x-forwarded-for) a client can't
  // prepend a spoofed IP to mint unlimited fresh rate-limit buckets.
  const realIp = req.headers["x-real-ip"];
  if (realIp) return String(realIp).trim();
  // Fallback (off-Vercel / x-real-ip absent): XFF leftmost, then socket.
  const forwarded = req.headers["x-forwarded-for"];
  return (forwarded ? forwarded.split(",")[0] : req.socket?.remoteAddress || "unknown").trim();
}

function humanTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.ceil((ms % 3600000) / 60000);
  if (h >= 1) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m} minute${m !== 1 ? "s" : ""}`;
}

function checkRateLimitMemory(ip, isStream) {
  const now = Date.now();
  let entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { trips: 0, plans: 0, resetAt: now + WINDOW_MS };
    rateLimitStore.set(ip, entry);
  }
  if (isStream) {
    if (entry.plans >= LIMIT_PLANS) {
      return `You've reached today's plan limit. Check back in ${humanTime(entry.resetAt - now)}.`;
    }
    entry.plans++;
  } else {
    if (entry.trips >= LIMIT_TRIPS) {
      return `You've reached today's trip limit. Check back in ${humanTime(entry.resetAt - now)}.`;
    }
    entry.trips++;
  }
  return null;
}

async function checkRateLimitRedis(ip, isStream) {
  const limiter = isStream ? redisLimiters.plans : redisLimiters.trips;
  const { success, reset } = await limiter.limit(ip);
  if (!success) {
    const type = isStream ? "plan" : "trip";
    return `You've reached today's ${type} limit. Check back in ${humanTime(reset - Date.now())}.`;
  }
  return null;
}

// Returns an error string if the IP is over limit, null if the request is allowed.
async function checkRateLimit(ip, isStream) {
  if (redisLimiters) {
    try {
      return await checkRateLimitRedis(ip, isStream);
    } catch (err) {
      // Fail open — a Redis outage must never lock out all users.
      console.error("[wandr proxy] Redis rate limit error, falling back to memory:", err.message);
    }
  }
  return checkRateLimitMemory(ip, isStream);
}

/**
 * Per-IP limit for venue-grounding lookups (api/places). Additive sibling of
 * checkRateLimit — the trips/plans paths are deliberately untouched. Returns
 * an error string when over limit, null when allowed. The client treats any
 * places error as "grounding unavailable" and builds the trip regardless, so
 * this message is a log line, not UX.
 */
export async function checkPlacesRateLimit(ip) {
  if (redisLimiters) {
    try {
      const { success } = await redisLimiters.places.limit(ip);
      return success ? null : "Daily verification limit reached.";
    } catch (err) {
      console.error("[wandr places] Redis rate limit error, falling back to memory:", err.message);
    }
  }
  const now = Date.now();
  let entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { trips: 0, plans: 0, places: 0, resetAt: now + WINDOW_MS };
    rateLimitStore.set(ip, entry);
  }
  // Entries created before this counter existed lack .places — tolerate them.
  entry.places = entry.places || 0;
  if (entry.places >= LIMIT_PLACES) return "Daily verification limit reached.";
  entry.places++;
  return null;
}

// ── Core proxy handler ────────────────────────────────────────────────────────

/**
 * Validate, rate-limit, and proxy a request to Anthropic.
 *
 * Called by both server.js and api/anthropic.js after their own
 * environment-specific setup (CORS, method guard, key check).
 *
 * @param {{ key: string, isDev: boolean }} opts
 *   key   — ANTHROPIC_API_KEY value (already verified non-empty by caller)
 *   isDev — if true, rate limiting is skipped
 */
export async function handleAnthropicProxy(req, res, { key, isDev }) {
  const { model, max_tokens, messages, stream } = req.body ?? {};

  if (!ALLOWED_MODELS.has(model)) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  if (typeof max_tokens !== "number" || max_tokens < 1 || max_tokens > MAX_TOKENS_CAP) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  if (!isDev) {
    const limitErr = await checkRateLimit(getClientIp(req), !!stream);
    if (limitErr) {
      res.status(429).json({ error: limitErr });
      return;
    }
  }

  // Reconstruct body from validated fields only — never spread req.body.
  const upstreamBody = { model, max_tokens, messages, stream: !!stream };

  try {
    const upstream = await fetch(TARGET, {
      method:  "POST",
      headers: {
        "content-type":      "application/json",
        "x-api-key":         key,
        "anthropic-version": "2023-06-01",
        "anthropic-beta":    "output-128k-2025-02-19",
      },
      body: JSON.stringify(upstreamBody),
    });

    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("content-type", ct);

    // Reader loop works for both streaming SSE and one-shot JSON responses.
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    console.error("[wandr proxy] upstream error:", err);
    if (!res.headersSent) {
      res.status(502).json({ error: "Couldn't reach the AI service. Please try again." });
    }
  }
}
