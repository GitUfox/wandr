/**
 * Vercel serverless proxy — keeps ANTHROPIC_API_KEY off the browser.
 *
 * Security controls:
 *  1. CORS allowlist — only the deployed origin + localhost can call this.
 *     Set ALLOWED_ORIGIN in the Vercel dashboard after first deploy.
 *  2. Method guard — POST and OPTIONS only.
 *  3. Input validation — model, max_tokens, and messages are validated and
 *     the upstream body is reconstructed from clean values (no passthrough).
 *  4. Rate limiting — TODO: in-memory won't survive serverless cold starts.
 *     Upstash Redis is the next step before wide public launch.
 *
 * Env vars (set in Vercel dashboard):
 *   ANTHROPIC_API_KEY   — required
 *   ALLOWED_ORIGIN      — your production URL, e.g. https://wandr.vercel.app
 */

// Disable the 4MB response size cap so streaming SSE can flow through.
export const config = {
  api: {
    responseLimit: false,
  },
};

const TARGET = "https://api.anthropic.com/v1/messages";

// Only these models may be requested — prevents key abuse for arbitrary workloads.
const ALLOWED_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-8",
]);

// Hard cap on tokens regardless of what the client requests.
const MAX_TOKENS_CAP = 16_000;

// ── CORS ─────────────────────────────────────────────────────────────────────

const LOCAL_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
]);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (LOCAL_ORIGINS.has(origin)) return true;

  // Production URL set in Vercel dashboard.
  if (process.env.ALLOWED_ORIGIN && origin === process.env.ALLOWED_ORIGIN) return true;

  // Vercel auto-sets these per-deployment and per-branch — covers preview URLs.
  if (process.env.VERCEL_URL && origin === `https://${process.env.VERCEL_URL}`) return true;
  if (process.env.VERCEL_BRANCH_URL && origin === `https://${process.env.VERCEL_BRANCH_URL}`) return true;

  return false;
}

function setCorsHeaders(res, origin) {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}

// ── Rate limiting stub ────────────────────────────────────────────────────────
// TODO: replace with Upstash Redis before wide public launch.
// In-memory state here is ephemeral — each serverless cold start resets it.
// The structure below is a no-op placeholder so the logic wires in cleanly.
const LIMIT_TRIPS = 3;
const LIMIT_PLANS = 10;
const WINDOW_MS   = 24 * 60 * 60 * 1000;
const rateLimitStore = new Map();

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

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const origin = req.headers.origin || "";

  // CORS preflight
  if (req.method === "OPTIONS") {
    if (isAllowedOrigin(origin)) setCorsHeaders(res, origin);
    res.status(204).end();
    return;
  }

  // Method guard
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  // CORS guard — hard-reject disallowed origins
  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }
  setCorsHeaders(res, origin);

  // API key check
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) {
    res.status(500).json({ error: "Service unavailable — please contact the owner." });
    return;
  }

  // ── Input validation ────────────────────────────────────────────────────────

  const body = req.body ?? {};
  const { model, max_tokens, messages, stream } = body;

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

  // ── Rate limiting ───────────────────────────────────────────────────────────

  const ip    = getClientIp(req);
  const isDev = LOCAL_ORIGINS.has(origin);
  if (!isDev) {
    const limitErr = checkRateLimit(ip, !!stream);
    if (limitErr) {
      res.status(429).json({ error: limitErr });
      return;
    }
  }

  // ── Proxy to Anthropic ──────────────────────────────────────────────────────
  // Reconstruct body from validated fields only — never spread req.body.

  const upstreamBody = {
    model,
    max_tokens,
    messages,
    stream: !!stream,
  };

  try {
    const upstream = await fetch(TARGET, {
      method:  "POST",
      headers: {
        "content-type":      "application/json",
        "x-api-key":         KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta":    "output-128k-2025-02-19",
      },
      body: JSON.stringify(upstreamBody),
    });

    res.status(upstream.status);

    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("content-type", ct);

    if (stream && upstream.body) {
      const reader  = upstream.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
      res.end();
    } else {
      const data = await upstream.json();
      res.json(data);
    }
  } catch {
    if (!res.headersSent) {
      res.status(502).json({ error: "Couldn't reach the AI service. Please try again." });
    }
  }
}
