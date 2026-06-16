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

import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, ".env.local") });

import express from "express";
import { Readable } from "stream";

const app    = express();
const PORT   = process.env.PORT    ?? 3001;
// SECURITY: use ANTHROPIC_API_KEY only — never VITE_ANTHROPIC_API_KEY.
// VITE_ prefixed vars are bundled into the browser bundle by Vite.
// If you're migrating from the old non-proxy setup, rename the key in .env.local.
const KEY    = process.env.ANTHROPIC_API_KEY;
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

  function humanTime(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.ceil((ms % 3600000) / 60000);
    if (h >= 1) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    return `${m} minute${m !== 1 ? "s" : ""}`;
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

  return null; // no error
}

// Periodically prune expired entries so the map doesn't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(ip);
  }
}, 60 * 60 * 1000); // every hour

// TODO [wandr-audit 2026-06-04]: No CORS restriction — any origin can call this proxy in production.
// Add cors middleware with an allowlist of the deployed domain before going fully public.
// TODO [wandr-audit 2026-06-04]: Body limit (20mb) vs per-file client limit (10mb × 5 files) are misaligned.
// 5 × 10MB images base64-encoded ≈ 70MB — exceeds the server limit. Either reduce MAX_MB
// in useFileUpload.js to ~3MB (keeping 20MB server) or raise server limit accordingly.
app.use(express.json({ limit: "20mb" }));

// ── Proxy endpoint ────────────────────────────────────────────────────────────

app.post("/api/anthropic", async (req, res) => {
  if (!KEY) {
    res.status(500).json({
      error: "Service unavailable — the app is not configured correctly. Please contact the owner.",
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
    if (!res.headersSent) res.status(502).json({ error: "Couldn't reach the AI service. Please try again." });
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
