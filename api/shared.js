/**
 * Shared proxy logic — imported by both server.js (Express dev) and
 * api/anthropic.js (Vercel serverless).
 *
 * Any change here applies to both environments automatically.
 */

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
// TODO: replace with Upstash Redis before wide public launch.
// In Vercel serverless, this Map resets on every cold start — it's a no-op stub.
// In the Express dev server it persists for the lifetime of the process.

const LIMIT_TRIPS = 3;
const LIMIT_PLANS = 10;
export const WINDOW_MS = 24 * 60 * 60 * 1000;

// Exported so server.js can prune stale entries in its setInterval.
export const rateLimitStore = new Map();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return (forwarded ? forwarded.split(",")[0] : req.socket?.remoteAddress || "unknown").trim();
}

function humanTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.ceil((ms % 3600000) / 60000);
  if (h >= 1) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m} minute${m !== 1 ? "s" : ""}`;
}

function checkRateLimit(ip, isStream) {
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
    const limitErr = checkRateLimit(getClientIp(req), !!stream);
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
