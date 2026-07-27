/**
 * Trip storage — the localStorage contract (PHASE2_PLANNING phase 1).
 *
 * Wandr used to persist exactly ONE trip (`wandr_trip`) and ONE plan
 * (`wandr_plan`). Planning a second trip silently destroyed the first — an
 * active data-loss bug with multiple trips queued. This module owns the
 * multi-trip shape:
 *
 *   wandr_trips        → { v: 2, trips: [{ id, savedAt, ...trip }], activeId }
 *   wandr_plan_<id>    → { planText, planMode }   (one per trip)
 *
 * Two contracts that must not be broken:
 *
 * 1. LEGACY MIRRORING. `wandr_trip` and `wandr_plan` are never deleted — the
 *    active trip and its plan are mirrored back to them on every save. That
 *    makes this commit revertible with live data: older code reads the legacy
 *    keys and resumes the current active trip exactly as before.
 * 2. PLANS ARE OWNED. A plan is keyed by its trip's id. Reading a plan without
 *    its trip id is what would render trip A's itinerary under trip B — silent,
 *    surfacing days later, indistinguishable from an AI error.
 */

const TRIPS_KEY        = "wandr_trips";
const LEGACY_TRIP_KEY  = "wandr_trip";
const LEGACY_PLAN_KEY  = "wandr_plan";
const STORE_VERSION    = 2;

// Bounded so localStorage can't grow without limit. Evicting also deletes the
// evicted trip's plan key — otherwise orphaned plans accumulate forever.
export const MAX_TRIPS = 10;

export const planKeyFor = (id) => `wandr_plan_${id}`;

export function newTripId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const emptyStore = () => ({ v: STORE_VERSION, trips: [], activeId: null });

// ── Pure store operations (unit-tested) ──────────────────────────────────────

/**
 * Insert or replace a trip. `replaceId` updates that trip in place (a rebuild
 * of the same trip), preserving its id and position; otherwise the trip is
 * added as new and becomes active.
 *
 * Returns { store, evictedIds } — callers must delete the evicted plan keys.
 */
export function upsertTrip(store, trip, { replaceId = null } = {}, now = Date.now()) {
  const base = store?.trips ? store : emptyStore();
  const savedAt = new Date(now).toISOString();

  if (replaceId) {
    const idx = base.trips.findIndex(t => t.id === replaceId);
    if (idx !== -1) {
      const trips = [...base.trips];
      trips[idx] = { ...trip, id: replaceId, savedAt };
      return { store: { ...base, trips, activeId: replaceId }, evictedIds: [] };
    }
    // replaceId pointed at a trip that's gone — fall through and add as new
    // rather than silently dropping the rebuild.
  }

  const id = newTripId();
  let trips = [...base.trips, { ...trip, id, savedAt }];

  // Evict oldest-first, never the trip we just made active.
  const evictedIds = [];
  while (trips.length > MAX_TRIPS) {
    const victim = trips
      .filter(t => t.id !== id)
      .sort((a, b) => (a.savedAt || "") > (b.savedAt || "") ? 1 : -1)[0];
    if (!victim) break;
    evictedIds.push(victim.id);
    trips = trips.filter(t => t.id !== victim.id);
  }

  return { store: { ...base, trips, activeId: id }, evictedIds };
}

/** Remove a trip. Returns the new store (activeId falls back to the newest). */
export function removeTrip(store, id) {
  const base = store?.trips ? store : emptyStore();
  const trips = base.trips.filter(t => t.id !== id);
  const activeId = base.activeId === id
    ? (trips.length ? trips[trips.length - 1].id : null)
    : base.activeId;
  return { ...base, trips, activeId };
}

/** The active trip, or the newest one if activeId is missing or stale, or null. */
export function getActiveTrip(store) {
  const trips = store?.trips || [];
  if (!trips.length) return null;
  return trips.find(t => t.id === store.activeId) || trips[trips.length - 1];
}

/** Newest-first, for a trip list UI (phase 2). */
export function listTrips(store) {
  return [...(store?.trips || [])].sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
}

/**
 * Normalize any persisted value into a valid v2 store, migrating the legacy
 * single-trip shape. Pure so the migration itself is testable.
 *
 * Returns { store, migratedFromLegacy, legacyPlanOwnerId }
 *   legacyPlanOwnerId — when set, the caller should re-key `wandr_plan` to
 *   this trip so a migrated user's existing itinerary stays attached.
 */
export function normalizeStore(rawTrips, rawLegacyTrip, now = Date.now()) {
  if (rawTrips?.v === STORE_VERSION && Array.isArray(rawTrips.trips)) {
    // Drop malformed entries and backfill ids, so one bad record can't break resume.
    const trips = rawTrips.trips
      .filter(t => t && typeof t === "object")
      .map(t => (t.id ? t : { ...t, id: newTripId() }));
    return { store: { ...rawTrips, trips }, migratedFromLegacy: false, legacyPlanOwnerId: null };
  }

  if (rawLegacyTrip && typeof rawLegacyTrip === "object" && rawLegacyTrip.destination) {
    const id = newTripId();
    const store = {
      v: STORE_VERSION,
      trips: [{ ...rawLegacyTrip, id, savedAt: rawLegacyTrip.savedAt || new Date(now).toISOString() }],
      activeId: id,
    };
    return { store, migratedFromLegacy: true, legacyPlanOwnerId: id };
  }

  return { store: emptyStore(), migratedFromLegacy: false, legacyPlanOwnerId: null };
}

// ── localStorage I/O (thin wrappers; every path fails soft) ──────────────────

const read = (k) => {
  try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; }
};

/**
 * Load the store, migrating the legacy single-trip shape on first run.
 * The legacy keys are left in place as the rollback path.
 */
export function loadTripStore() {
  const { store, migratedFromLegacy, legacyPlanOwnerId } =
    normalizeStore(read(TRIPS_KEY), read(LEGACY_TRIP_KEY));

  if (migratedFromLegacy) {
    // Re-key the one legacy plan so the migrated trip keeps its itinerary.
    try {
      const legacyPlan = localStorage.getItem(LEGACY_PLAN_KEY);
      if (legacyPlan && legacyPlanOwnerId) {
        localStorage.setItem(planKeyFor(legacyPlanOwnerId), legacyPlan);
      }
    } catch { /* quota — the trip still migrates, just without its plan */ }
    saveTripStore(store);
  }
  return store;
}

/** Persist the store and mirror the active trip to the legacy key (rollback). */
export function saveTripStore(store) {
  try {
    localStorage.setItem(TRIPS_KEY, JSON.stringify(store));
  } catch { return false; }
  try {
    const active = getActiveTrip(store);
    if (active) localStorage.setItem(LEGACY_TRIP_KEY, JSON.stringify(active));
  } catch { /* mirror is best-effort — never fail a real save for it */ }
  return true;
}

/** Delete a trip's plan. Used on eviction and on rebuild (stale plan). */
export function deletePlan(id) {
  try { localStorage.removeItem(planKeyFor(id)); } catch { /* ignore */ }
}

/**
 * Mirror the active trip's plan to the legacy `wandr_plan` key (rollback path).
 * Only ever the plan on screen, which is by definition the active trip's.
 * Pass null to clear it.
 */
export function mirrorLegacyPlan(payload) {
  try {
    if (payload) localStorage.setItem(LEGACY_PLAN_KEY, payload);
    else localStorage.removeItem(LEGACY_PLAN_KEY);
  } catch { /* best-effort */ }
}

/**
 * Save a built trip. `replaceId` rebuilds that trip in place instead of adding
 * a new one. Returns the updated store.
 */
export function persistTrip(trip, { replaceId = null } = {}) {
  const { store, evictedIds } = upsertTrip(loadTripStore(), trip, { replaceId });
  for (const id of evictedIds) deletePlan(id);
  saveTripStore(store);
  // The trip that just became active has no plan yet — a rebuild's plan was
  // dropped as stale, a new trip never had one. Clearing the legacy plan mirror
  // here keeps the single invariant true: `wandr_plan` always describes the trip
  // in `wandr_trip`. Otherwise a rollback mid-flow would pair a new trip with
  // the previous trip's itinerary.
  mirrorLegacyPlan(null);
  return store;
}
