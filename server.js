/**
 * Wandr proxy server — local dev
 *
 * Sits between the browser and the Anthropic API so the API key never
 * appears in the browser bundle.
 *
 * Dev:  npm run dev:all   (starts both this server and Vite concurrently)
 * Prod: npm run build && npm start
 *
 * Reads ANTHROPIC_API_KEY from .env.local.
 * SECURITY: never use VITE_ANTHROPIC_API_KEY — VITE_ prefix bundles it into the browser.
 */

import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, ".env.local") });

import express from "express";
import { handleAnthropicProxy, rateLimitStore, WINDOW_MS } from "./api/shared.js";

const app  = express();
const PORT = process.env.PORT ?? 3001;
const KEY  = process.env.ANTHROPIC_API_KEY;

app.use(express.json({ limit: "20mb" }));

// Prune expired rate-limit entries hourly — only meaningful in a long-running process.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(ip);
  }
}, 60 * 60 * 1000);

// ── Proxy endpoint ────────────────────────────────────────────────────────────

app.post("/api/anthropic", async (req, res) => {
  if (!KEY) {
    res.status(500).json({
      error: "Service unavailable — the app is not configured correctly. Please contact the owner.",
    });
    return;
  }

  // Vite's proxy (changeOrigin: true) rewrites Host, so origin is not a reliable
  // signal here. Use the socket address to detect local dev instead.
  const ip    = req.socket?.remoteAddress || "";
  const isDev = ["::1", "127.0.0.1", "::ffff:127.0.0.1"].includes(ip);

  await handleAnthropicProxy(req, res, { key: KEY, isDev });
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
