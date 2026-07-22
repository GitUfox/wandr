/**
 * Venue grounding — shared places-proxy logic (PHASE2_PLANNING §12, phase 1).
 * Imported by both server.js (Express dev) and api/places.js (Vercel serverless),
 * same pattern as shared.js — any change here applies to both environments.
 *
 * Verifies venue names the model generated against Google Places (New) Text
 * Search, so "Futile Coffee"-style hallucinations become detectable instead of
 * shipping to the itinerary. Vendor-agnostic: the Google call is one adapter
 * function; swapping vendors means swapping that function, nothing else.
 *
 * STUB BEHAVIOR: when GOOGLE_PLACES_API_KEY is unset, responds
 * { available: false } with HTTP 200. The client treats that as a clean no-op,
 * so this whole feature self-activates the moment the key lands in the
 * environment — no deploy needed.
 */

import { checkPlacesRateLimit, getClientIp } from "./shared.js";

const GOOGLE_URL = "https://places.googleapis.com/v1/places:searchText";

// ⚠️ BILLING CONTRACT — Google prices Places (New) by which fields you request,
// not by volume. This exact mask keeps every call in the Text Search **Pro**
// SKU (5,000 free/month). Adding rating, currentOpeningHours, or similar
// silently moves EVERY call to the Enterprise SKU. Do not extend this list
// without re-checking the SKU table and the cost math in PHASE2_PLANNING §12.2.
const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus";

// Per-request bound — caps the Google quota one request can spend.
export const MAX_VENUES_PER_REQUEST = 40;

// Similarity threshold for accepting Google's candidate as "the same place".
// Tuned so "Futuro" vs "Futile" fails and "Café Boulud" vs "Cafe Boulud"
// passes — see the test suite for the contract cases.
export const MATCH_THRESHOLD = 0.6;

// ── Name matching (pure — the genuinely fiddly part, so fully unit-tested) ────

/**
 * Normalize a venue name for comparison: lowercase, strip accents and
 * punctuation, drop a leading English article, collapse whitespace.
 * "The Café Boulud" → "cafe boulud".
 */
export function normalizeVenueName(name) {
  if (typeof name !== "string") return "";
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip diacritics: e-acute -> e
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

/**
 * Similarity between two venue names, 0..1. Token-set Jaccard, plus a
 * containment boost: when every token of the shorter name appears in the
 * longer, treat it as a strong match — Google often returns the fuller
 * official name ("Camelback Mountain Echo Canyon Trailhead" for "Camelback
 * Mountain"), which plain Jaccard would under-score.
 */
export function venueMatchScore(a, b) {
  const ta = normalizeVenueName(a).split(" ").filter(Boolean);
  const tb = normalizeVenueName(b).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  const sa = new Set(ta), sb = new Set(tb);
  const inter = [...sa].filter(t => sb.has(t)).length;
  const jaccard = inter / (sa.size + sb.size - inter);
  const [small, big] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  const contained = [...small].every(t => big.has(t));
  return contained ? Math.max(jaccard, 0.85) : jaccard;
}

/**
 * Pick the best-scoring candidate above MATCH_THRESHOLD, or null.
 * Candidates: [{ name, address, placeId, location, businessStatus }]
 */
export function pickBestMatch(queryName, candidates) {
  let best = null, bestScore = 0;
  for (const c of candidates || []) {
    const s = venueMatchScore(queryName, c.name);
    if (s > bestScore) { best = c; bestScore = s; }
  }
  return bestScore >= MATCH_THRESHOLD ? { ...best, score: bestScore } : null;
}

// ── Request validation (pure) ─────────────────────────────────────────────────

/**
 * Validate a POST /api/places body. Returns null when valid, or an error
 * string (generic on purpose — no internals leaked, matching shared.js).
 */
export function validatePlacesRequest(body) {
  const { destination, venues } = body ?? {};
  if (typeof destination !== "string" || !destination.trim() || destination.length > 120)
    return "Invalid request.";
  if (!Array.isArray(venues) || venues.length === 0 || venues.length > MAX_VENUES_PER_REQUEST)
    return "Invalid request.";
  for (const v of venues) {
    if (typeof v?.name !== "string" || !v.name.trim() || v.name.length > 160)
      return "Invalid request.";
    if (typeof v?.category !== "string" || v.category.length > 40)
      return "Invalid request.";
  }
  return null;
}

// ── Google adapter (the one vendor-specific function) ─────────────────────────

/**
 * Look one venue up via Google Places (New) Text Search. Returns normalized
 * candidates [{ name, address, placeId, location, businessStatus }] — the
 * vendor-neutral shape everything downstream consumes. Empty array on any
 * failure (grounding is best-effort; a lookup error must never fail a trip).
 */
async function googleTextSearch(query, key) {
  try {
    const res = await fetch(GOOGLE_URL, {
      method: "POST",
      headers: {
        "content-type":     "application/json",
        "x-goog-api-key":   key,
        "x-goog-fieldmask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, pageSize: 3 }),
    });
    if (!res.ok) {
      console.error("[wandr places] Google responded", res.status);
      return [];
    }
    const data = await res.json();
    return (data.places || []).map(p => ({
      name:           p.displayName?.text || "",
      address:        p.formattedAddress || "",
      placeId:        p.id || "",
      location:       p.location
        ? { lat: p.location.latitude, lng: p.location.longitude }
        : null,
      businessStatus: p.businessStatus || "",
    }));
  } catch (err) {
    console.error("[wandr places] lookup failed:", err.message);
    return [];
  }
}

/** Shape one venue's verification result from its best candidate (or lack of one). */
export function shapeResult(venue, match) {
  if (!match) return { name: venue.name, category: venue.category, verified: false, reason: "no-match" };
  if (match.businessStatus && match.businessStatus !== "OPERATIONAL") {
    // Found it, but Google says it's closed — worse than unverified for a
    // traveler, so it is NOT marked verified. Reason kept for measurement.
    return { name: venue.name, category: venue.category, verified: false, reason: "closed" };
  }
  return {
    name:          venue.name,
    category:      venue.category,
    verified:      true,
    canonicalName: match.name,
    address:       match.address,
    placeId:       match.placeId,
    location:      match.location,
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${
      encodeURIComponent(match.name)}&query_place_id=${encodeURIComponent(match.placeId)}`,
  };
}

// ── Core handler ──────────────────────────────────────────────────────────────

/**
 * Validate, rate-limit, and ground a batch of venues. Called by both
 * server.js and api/places.js after their environment-specific setup.
 *
 * @param {{ key: string|undefined, isDev: boolean }} opts
 *   key   — GOOGLE_PLACES_API_KEY; undefined ⇒ stub mode ({available:false})
 *   isDev — if true, rate limiting is skipped (matches the Anthropic proxy)
 */
export async function handlePlacesRequest(req, res, { key, isDev }) {
  const invalid = validatePlacesRequest(req.body);
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }

  // Stub mode — key not configured yet. 200 on purpose: the client reads
  // available:false as "grounding is off", not as a failure.
  if (!key) {
    res.status(200).json({ available: false, results: [] });
    return;
  }

  if (!isDev) {
    const limitErr = await checkPlacesRateLimit(getClientIp(req));
    if (limitErr) {
      res.status(429).json({ error: limitErr });
      return;
    }
  }

  const { destination, venues } = req.body;
  const results = await Promise.all(
    venues.map(async v => {
      const candidates = await googleTextSearch(`${v.name}, ${destination}`, key);
      return shapeResult(v, pickBestMatch(v.name, candidates));
    })
  );

  res.status(200).json({ available: true, results });
}
