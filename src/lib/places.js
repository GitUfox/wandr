/**
 * Venue grounding — client side (PHASE2_PLANNING §12, phase 1).
 *
 * After a trip builds, venues in GROUNDING.categories are verified against
 * /api/places (Google Places behind our proxy). Verified venues gain
 * additive fields; nothing existing is ever modified:
 *
 *   { verified: true, canonicalName, address, mapUrl, placeId, location }
 *   { verified: false }              — checked, no confident match (or closed)
 *   (no fields)                      — never checked (other categories, old trips)
 *
 * `name` is deliberately NOT overwritten with canonicalName in phase 1: a
 * false-positive fuzzy match that renamed a correct venue would *introduce*
 * the exact hallucination class this feature exists to kill. Renaming waits
 * for phase 3, once the measured match quality justifies it.
 *
 * Every path here fails open — grounding can only ever add data, never break
 * or delay-fail a build (mirrors events.js's silent-absence contract).
 */

import { FEATURES, GROUNDING } from "./constants.js";

const API_URL   = "/api/places";
const CACHE_KEY = "wandr_places_cache";
const CACHE_TTL_MS  = 30 * 24 * 60 * 60 * 1000; // venues move slowly; 30 days
const CACHE_MAX     = 300;                       // bound localStorage growth
const CACHE_VERSION = 1;

// Once the server says grounding is unavailable (no key yet), stop asking for
// the rest of the session — one probe per session, not one per build.
let sessionUnavailable = false;

// ── Activation status (read by SettingsSheet) ────────────────────────────────
// Remembered the first time the server answers available:true, so Settings can
// truthfully say "Active" instead of the pre-key "Waiting on activation".
const ACTIVE_KEY = "wandr_places_active";

function markPlacesActive() {
  try { localStorage.setItem(ACTIVE_KEY, "1"); } catch { /* optional */ }
}

/** Has this device ever seen the places proxy answer available:true?
 *  A non-empty grounding cache counts too — it can only fill from a
 *  successful key-backed response, so it's valid retroactive evidence. */
export function placesActivated() {
  try {
    if (localStorage.getItem(ACTIVE_KEY) === "1") return true;
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return !!raw?.entries && Object.keys(raw.entries).length > 0;
  } catch { return false; }
}

// ── Cache (pure helpers exported for tests; storage I/O isolated below) ──────

export function cacheKeyFor(name, destination) {
  const norm = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${norm(name)}|${norm(destination)}`;
}

/** Drop expired entries, then oldest-first down to CACHE_MAX. Pure. */
export function pruneCache(entries, now = Date.now()) {
  const live = Object.entries(entries || {})
    .filter(([, e]) => e && typeof e.t === "number" && now - e.t < CACHE_TTL_MS);
  live.sort((a, b) => b[1].t - a[1].t); // newest first
  return Object.fromEntries(live.slice(0, CACHE_MAX));
}

function loadCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    // A cache is regenerable by definition — unknown shape ⇒ discard wholesale.
    if (raw?.v !== CACHE_VERSION || typeof raw.entries !== "object") return {};
    return pruneCache(raw.entries);
  } catch { return {}; }
}

function saveCache(entries) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: CACHE_VERSION, entries: pruneCache(entries) }));
  } catch { /* quota/unavailable — cache is optional */ }
}

// ── Merge (pure — exported for tests) ────────────────────────────────────────

/**
 * Merge verification results into trip categories. Additive only: items in
 * grounded categories gain verification fields; everything else — including
 * categories we didn't check and trips from before grounding existed — passes
 * through untouched. Returns { categories, stats }.
 */
export function mergeVerification(categories, results) {
  const byKey = new Map((results || []).map(r => [`${r.category}|${r.name}`, r]));
  const stats = { checked: 0, verified: 0, misses: [] };
  const merged = {};
  for (const [cat, items] of Object.entries(categories || {})) {
    if (!Array.isArray(items)) { merged[cat] = items; continue; }
    merged[cat] = items.map(it => {
      const r = byKey.get(`${cat}|${it.name}`);
      if (!r) return it;
      stats.checked++;
      if (!r.verified) {
        stats.misses.push({ name: it.name, reason: r.reason || "no-match" });
        return { ...it, verified: false };
      }
      stats.verified++;
      return {
        ...it,
        verified:      true,
        canonicalName: r.canonicalName,
        address:       r.address,
        mapUrl:        r.mapUrl,
        placeId:       r.placeId,
        location:      r.location,
      };
    });
  }
  return { categories: merged, stats };
}

/** The venues we'll ask the server about: grounded categories only, capped at
 *  GROUNDING.maxPerRequest (the server 400s above its mirror limit, which
 *  would lose ALL grounding for the build). When trimming, essentials survive
 *  first — they're the venues a traveler will actually stand in front of. Pure. */
export function collectVenues(categories) {
  const rank = { essential: 0, recommended: 1, optional: 2 };
  const out = [];
  for (const cat of GROUNDING.categories) {
    for (const it of categories?.[cat] || []) {
      if (typeof it?.name === "string" && it.name.trim())
        out.push({ name: it.name, category: cat, _rank: rank[it.priority] ?? 2 });
    }
  }
  return out
    .sort((a, b) => a._rank - b._rank)
    .slice(0, GROUNDING.maxPerRequest)
    .map(({ name, category }) => ({ name, category }));
}

// ── Destination autocomplete (design pick 5A) ────────────────────────────────

let autocompleteUnavailable = false;

/**
 * Suggestions for the welcome screen's "Where to?" field.
 * Returns [{ placeId, main, secondary }] — or [] when the proxy has no key
 * (remembered for the session so we stop probing), on abort, or on any error.
 * Autocomplete is a convenience: it must never block typing a destination.
 */
export async function fetchDestinationSuggestions(input, signal) {
  if (autocompleteUnavailable) return [];
  const q = (input || "").trim();
  if (q.length < 2) return [];
  try {
    const res = await fetch(API_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ autocomplete: q }),
      signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data?.available) {
      autocompleteUnavailable = true; // key not configured — quiet no-op from here on
      return [];
    }
    markPlacesActive();
    return data.suggestions || [];
  } catch {
    return []; // aborted or offline — typing continues either way
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Verify a built trip's venues. Returns { categories, stats } with grounding
 * fields merged in, or null when grounding is off, unavailable, or failed —
 * the caller keeps its original categories in that case. Never throws.
 */
export async function verifyTripVenues(trip) {
  if (!FEATURES.venueGrounding || sessionUnavailable) return null;
  const destination = trip?.destination || trip?.answers?.destination || "";
  const venues = collectVenues(trip?.categories);
  if (!destination || !venues.length) return null;

  try {
    const cache  = loadCache();
    const now    = Date.now();
    const cached = [];
    const toFetch = [];
    for (const v of venues) {
      const hit = cache[cacheKeyFor(v.name, destination)];
      if (hit && now - hit.t < CACHE_TTL_MS) cached.push(hit.r);
      else toFetch.push(v);
    }

    let fetched = [];
    if (toFetch.length) {
      const signal = typeof AbortSignal?.timeout === "function"
        ? AbortSignal.timeout(GROUNDING.timeoutMs) : undefined;
      const res = await fetch(API_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ destination, venues: toFetch }),
        signal,
      });
      if (!res.ok) return null; // rate-limited or erroring — trip proceeds ungrounded
      const data = await res.json();
      if (!data?.available) {
        sessionUnavailable = true; // key not configured — stop probing this session
        return null;
      }
      markPlacesActive();
      fetched = data.results || [];
      for (const r of fetched) cache[cacheKeyFor(r.name, destination)] = { t: now, r };
      saveCache(cache);
    }

    const { categories, stats } = mergeVerification(trip.categories, [...cached, ...fetched]);

    if (import.meta.env.DEV && stats.checked) {
      // eslint-disable-next-line no-console
      console.log(
        `[Wandr] grounding ${GROUNDING.categories.join("+")}: ${stats.verified}/${stats.checked} verified`
        + (stats.misses.length
          ? ` · misses: ${stats.misses.map(m => `${m.name} (${m.reason})`).join(", ")}`
          : "")
      );
    }
    return { categories, stats };
  } catch {
    return null; // timeout / network / parse — grounding is best-effort, always
  }
}
