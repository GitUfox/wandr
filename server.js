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

app.use(express.json({ limit: "20mb" }));

// ── Proxy endpoint ────────────────────────────────────────────────────────────

app.post("/api/anthropic", async (req, res) => {
  if (!KEY) {
    res.status(500).json({
      error: "ANTHROPIC_API_KEY not set — add it to .env.local and restart the server",
    });
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
