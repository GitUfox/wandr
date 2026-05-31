/**
 * Wandr proxy server
 *
 * Sits between the browser and the Anthropic API so the API key never
 * appears in the browser bundle.
 *
 * Dev:  npm run dev:all   (starts both this server and Vite concurrently)
 * Prod: npm run build && npm start
 *
 * Reads ANTHROPIC_API_KEY from the environment.
 * In development, set it in .env.local — the npm scripts load it automatically.
 */

import express from "express";
import { Readable } from "stream";

const app    = express();
const PORT   = process.env.PORT    ?? 3001;
const KEY    = process.env.ANTHROPIC_API_KEY ?? process.env.VITE_ANTHROPIC_API_KEY;
const TARGET = "https://api.anthropic.com/v1/messages";

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Limits per IP per 24-hour rolling window.
// Trip builds (non-streaming) cost more tokens so get a tighter cap.
const LIMIT_TRIPS = 3;   // buildTrip calls
const LIMIT_PLANS = 10;  // generate/stream calls
const WINDOW_MS   = 24 * 60 * 60 * 1000; // 24 hours

// { ip -> { trips: number, plans: number, resetAt: timestamp } }
const rateLimitStore = new Map();

function getClientIp(req) {
  // Respect X-Forwarded-For set by Vercel / reverse proxies
  const forwarded = req.headers["x-forwarded-for"];
  return (forwarded ? forwarded.split(",")[0] : req.socket.remoteAddress || "unknown").trim();
}

function checkRateLimit(ip, isStream) {
  const now  = Date.now();
  let entry  = rateLimitStore.get(ip);

  // Expired or first visit — fresh entry
  if (!entry || now > entry.resetAt) {
    entry = { trips: 0, plans: 0, resetAt: now + WINDOW_MS };
    rateLimitStore.set(ip, entry);
  }

  if (isStream) {
    if (entry.plans >= LIMIT_PLANS) {
      const mins = Math.ceil((entry.resetAt - now) / 60000);
      return `Plan generation limit reached (${LIMIT_PLANS}/day). Resets in ${mins} min.`;
    }
    entry.plans++;
  } else {
    if (entry.trips >= LIMIT_TRIPS) {
      const mins = Math.ceil((entry.resetAt - now) / 60000);
      return `Trip build limit reached (${LIMIT_TRIPS}/day). Resets in ${mins} min.`;
    }
    entry.trips++;
  }

  return null; // no error
}

// Periodically prune expired entries so the map doesn't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(ip);
  }
}, 60 * 60 * 1000); // every hour

app.use(express.json({ limit: "20mb" }));

// ── Proxy endpoint ────────────────────────────────────────────────────────────

app.post("/api/anthropic", async (req, res) => {
  if (!KEY) {
    res.status(500).json({
      error: "ANTHROPIC_API_KEY not set — add it to .env.local and restart the server",
    });
    return;
  }

  const ip       = getClientIp(req);
  const isStream = !!req.body?.stream;
  const isDev    = ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1";
  const limitErr = isDev ? null : checkRateLimit(ip, isStream);

  if (limitErr) {
    res.status(429).json({ error: limitErr });
    return;
  }

  try {
    const upstream = await fetch(TARGET, {
      method:  "POST",
      headers: {
        "content-type":      "application/json",
        "x-api-key":         KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    res.status(upstream.status);

    // Forward content-type so the browser handles SSE streaming correctly
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("content-type", ct);

    // Pipe the upstream body (works for both JSON and streaming SSE)
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ error: err.message });
  }
});

// ── Serve built frontend in production ────────────────────────────────────────

if (process.env.NODE_ENV === "production") {
  const { join, dirname } = await import("path");
  const { fileURLToPath }  = await import("url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "dist");

  app.use(express.static(root));
  app.get("*", (_req, res) => res.sendFile("index.html", { root }));
}

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[wandr] proxy server → http://localhost:${PORT}`);
  if (!KEY) console.warn("[wandr] ⚠️  ANTHROPIC_API_KEY is not set");
});
