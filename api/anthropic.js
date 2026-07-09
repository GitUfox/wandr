/**
 * Vercel serverless proxy — keeps ANTHROPIC_API_KEY off the browser.
 *
 * Security controls:
 *  1. CORS allowlist — only the deployed origin + localhost can call this.
 *     Set ALLOWED_ORIGIN in the Vercel dashboard after first deploy.
 *  2. Method guard — POST and OPTIONS only.
 *  3. Input validation + rate limiting — handled inside handleAnthropicProxy (shared.js).
 *
 * Env vars (set in Vercel dashboard):
 *   ANTHROPIC_API_KEY   — required
 *   ALLOWED_ORIGIN      — your production URL, e.g. https://wandr-mauve.vercel.app
 */

// Disable the 4MB response size cap so streaming SSE can flow through.
export const config = {
  api: {
    responseLimit: false,
  },
};

import {
  isAllowedOrigin,
  setCorsHeaders,
  handleAnthropicProxy,
} from "./shared.js";

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

  // This handler only runs on Vercel (production/preview), never local dev —
  // local dev goes through server.js, which sets its own isDev from the socket
  // address. So rate limiting must always apply here. Deriving isDev from the
  // Origin header would be a bypass: Origin is client-controlled, so a spoofed
  // "Origin: http://localhost:5173" could skip the limiter entirely.
  await handleAnthropicProxy(req, res, { key: KEY, isDev: false });
}
