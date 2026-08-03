/**
 * App settings — localStorage-backed, one small object.
 *
 *   wandr_settings → { v: 1, timeFormat: "24h" | "12h" }
 *
 * This is the local-first skeleton of the future account/settings page: when a
 * backend lands, these values sync like everything else. Until then they're
 * device-bound like the rest of the app.
 *
 * Module-level cache keeps reads cheap (formatTime consults this on every
 * call). The cache is process-wide, which is fine: settings change only via
 * saveSettings below, and the settings sheet lives on the welcome screen — no
 * surface that *renders* times can be open at the same moment.
 */

const KEY = "wandr_settings";
const DEFAULTS = { v: 1, timeFormat: "24h" };

let cache = null;

export function loadSettings() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    // Unknown versions fall back to defaults — settings are regenerable.
    cache = raw && raw.v === 1 ? { ...DEFAULTS, ...raw } : { ...DEFAULTS };
  } catch {
    // No localStorage (node/tests) or corrupt JSON — defaults, in-memory only.
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch, v: 1 };
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota — keep in-memory */ }
  return next;
}

/** The active time display format. Anything but "12h" reads as "24h". */
export function getTimeFormat() {
  return loadSettings().timeFormat === "12h" ? "12h" : "24h";
}

/**
 * Wipe every wandr_* key — trips, per-trip plans, profile, places cache,
 * legacy mirrors, and settings itself. Prefix-scan rather than a fixed list so
 * future keys can't be silently left behind. Returns how many keys were removed.
 */
export function clearAllWandrData() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("wandr_")) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
    cache = null;
    return keys.length;
  } catch {
    return 0;
  }
}

/** Test hook — drop the module cache so a fresh storage state is re-read. */
export function _resetSettingsCache() {
  cache = null;
}
