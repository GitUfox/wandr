/**
 * Vercel serverless venue-grounding proxy — keeps GOOGLE_PLACES_API_KEY off
 * the browser. Mirrors api/anthropic.js's security posture exactly:
 *
 *  1. CORS allowlist — only the deployed origin + localhost can call this.
 *  2. Method guard — POST and OPTIONS only.
 *  3. Input validation + rate limiting — inside handlePlacesRequest (places-shared.js).
 *
 * Env vars (set in Vercel dashboard):
 *   GOOGLE_PLACES_API_KEY — optional. When ABSENT this endpoint returns
 *   { available: false } and the app behaves exactly as before grounding
 *   existed. Setting the var is the feature switch — no deploy needed.
 */

import { isAllowedOrigin, setCorsHeaders } from "./shared.js";
import { handlePlacesRequest } from "./places-shared.js";

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

  // isDev is hard-false here for the same reason as api/anthropic.js: this
  // handler only runs on Vercel, and Origin is client-controlled — deriving
  // isDev from it would let a spoofed localhost Origin skip the limiter.
  await handlePlacesRequest(req, res, {
    key:   process.env.GOOGLE_PLACES_API_KEY,
    isDev: false,
  });
}
