/**
 * Wandr service worker — offline shell only.
 *
 * The premise: a trip already survives offline. It lives in localStorage
 * (`wandr_trips` + `wandr_plan_<id>`), which the network can't touch. What was
 * missing is the app shell that renders it — so abroad, in airplane mode, or on
 * roaming the user has their itinerary on the device and the app still won't
 * open. This fixes exactly that, and nothing more.
 *
 * ── Cache policy (the part that matters) ──────────────────────────────────
 *
 *   /api/*            NEVER cached. Network-only, no fallback.
 *   navigations       Network-first, cache fallback. A deploy is picked up the
 *                     next time the user is online — no stale-shell-forever.
 *   /assets/*         Cache-first. Vite content-hashes these, so a given URL's
 *                     bytes are immutable; a new build means new URLs.
 *   icons/manifest    Cache-first (small, rarely change, needed for install).
 *   Google Fonts      Stale-while-revalidate, so Manrope survives offline
 *                     instead of falling back to a system font.
 *   everything else   Passthrough, uncached.
 *
 * Why /api/* is never cached — three separate reasons, any one sufficient:
 *   1. Responses are built from the traveler's own trip details. Caching them
 *      would copy personal travel data into Cache Storage, which outlives the
 *      localStorage the user thinks holds their trip and isn't cleared by the
 *      app's own reset paths.
 *   2. A cached 200 would let a device replay someone else's response on shared
 *      hardware, and would mask the per-IP rate limiting the proxy enforces.
 *   3. Trip generation is not idempotent — a replayed response is silently
 *      wrong rather than obviously broken.
 *
 * Bump CACHE_VERSION to evict every old cache on activate.
 */

const CACHE_VERSION = "v1";
const SHELL_CACHE   = `wandr-shell-${CACHE_VERSION}`;
const ASSET_CACHE   = `wandr-assets-${CACHE_VERSION}`;
const FONT_CACHE    = `wandr-fonts-${CACHE_VERSION}`;
const OURS = [SHELL_CACHE, ASSET_CACHE, FONT_CACHE];

// Minimum needed to boot offline. Hashed bundles are cached on demand instead
// of precached, because their names change every build.
const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon-32.png",
];

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll fails the whole install if any single URL 404s — add
      // individually so one missing asset can't block offline support.
      await Promise.allSettled(SHELL_URLS.map((u) => cache.add(u)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("wandr-") && !OURS.includes(n))
             .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

/** Network-first: fresh when online, cached copy when not. */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    // Navigation with nothing cached for this exact URL — fall back to the
    // shell so any in-app route still boots (SPA: routing is client-side).
    if (request.mode === "navigate") {
      const shell = await cache.match("/");
      if (shell) return shell;
    }
    throw new Error("offline and uncached");
  }
}

// Every deploy mints new content-hashed filenames, so the previous build's
// chunks stay cached forever under the same CACHE_VERSION. Left alone that
// grows without bound on a phone. cache.keys() is insertion-ordered, so
// trimming the oldest entries keeps the working set and drops dead builds.
const MAX_ASSET_ENTRIES = 24;

async function trimCache(cache, max) {
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

/** Cache-first: for immutable, content-hashed or rarely-changing assets. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  // Cache opaque cross-origin responses too (fonts) — servable, just opaque.
  if (res && (res.ok || res.type === "opaque")) {
    await cache.put(request, res.clone());
    if (cacheName === ASSET_CACHE) await trimCache(cache, MAX_ASSET_ENTRIES);
  }
  return res;
}

/** Serve cached immediately, refresh in the background. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const update = fetch(request)
    .then((res) => {
      if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await update) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET is cacheable; POSTs (all our API traffic) fall through untouched.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Hard exclusion, stated first so no later rule can accidentally catch it.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // Leave other cross-origin traffic alone (e.g. statsapi.mlb.com for local
  // events — live schedule data should never be served stale).
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  if (/\.(png|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
});

// Let the page trigger an immediate takeover after an update is found.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
