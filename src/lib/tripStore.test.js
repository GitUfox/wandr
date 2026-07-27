import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeStore,
  upsertTrip,
  removeTrip,
  getActiveTrip,
  listTrips,
  planKeyFor,
  newTripId,
  loadTripStore,
  saveTripStore,
  persistTrip,
  MAX_TRIPS,
  setActiveTripId,
  activateTripId,
  deleteTrip,
} from "./tripStore.js";

// Minimal localStorage stand-in — the suite runs in the `node` environment.
class MemStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

beforeEach(() => { globalThis.localStorage = new MemStorage(); });

const tripFor = (destination) => ({
  destination, tagline: "t", nights: 3, highlights: [], categories: { culture: [] }, answers: {},
});

describe("normalizeStore — migration from the legacy single-trip shape", () => {
  it("migrates a v1 trip into the array and flags its plan for re-keying", () => {
    const legacy = { ...tripFor("Lisbon, Portugal"), season: "warm" };
    const { store, migratedFromLegacy, legacyPlanOwnerId } = normalizeStore(null, legacy);

    expect(migratedFromLegacy).toBe(true);
    expect(store.v).toBe(2);
    expect(store.trips).toHaveLength(1);
    expect(store.trips[0].destination).toBe("Lisbon, Portugal");
    expect(store.trips[0].season).toBe("warm");        // whole trip preserved
    expect(store.trips[0].id).toBeTruthy();
    expect(store.activeId).toBe(store.trips[0].id);
    expect(legacyPlanOwnerId).toBe(store.trips[0].id); // plan follows its trip
  });

  it("prefers an existing v2 store and does not re-migrate", () => {
    const v2 = { v: 2, trips: [{ ...tripFor("Oslo"), id: "abc", savedAt: "2026-01-01T00:00:00Z" }], activeId: "abc" };
    const { store, migratedFromLegacy } = normalizeStore(v2, tripFor("STALE LEGACY"));
    expect(migratedFromLegacy).toBe(false);
    expect(store.trips).toHaveLength(1);
    expect(store.trips[0].destination).toBe("Oslo");
  });

  it("returns an empty store for a first-ever visit", () => {
    const { store, migratedFromLegacy } = normalizeStore(null, null);
    expect(store).toEqual({ v: 2, trips: [], activeId: null });
    expect(migratedFromLegacy).toBe(false);
  });

  it("ignores junk rather than throwing", () => {
    expect(normalizeStore("nonsense", null).store.trips).toEqual([]);
    expect(normalizeStore({ v: 99 }, null).store.trips).toEqual([]);
    expect(normalizeStore(null, { noDestination: true }).store.trips).toEqual([]);
  });

  it("backfills a missing id so one bad record can't break resume", () => {
    const v2 = { v: 2, trips: [tripFor("Paris"), null], activeId: null };
    const { store } = normalizeStore(v2, null);
    expect(store.trips).toHaveLength(1);
    expect(store.trips[0].id).toBeTruthy();
  });
});

describe("upsertTrip", () => {
  it("adds a new trip and makes it active without touching the first", () => {
    let { store } = upsertTrip(null, tripFor("France"));
    const franceId = store.activeId;
    ({ store } = upsertTrip(store, tripFor("Norway")));

    expect(store.trips).toHaveLength(2);
    expect(store.activeId).not.toBe(franceId);
    // The whole point of phase 1: planning Norway must not destroy France.
    expect(store.trips.map(t => t.destination)).toEqual(["France", "Norway"]);
  });

  it("replaceId rebuilds in place — same id, no duplicate", () => {
    let { store } = upsertTrip(null, tripFor("Turkey"));
    const id = store.activeId;
    ({ store } = upsertTrip(store, { ...tripFor("Turkey"), tagline: "rebuilt" }, { replaceId: id }));

    expect(store.trips).toHaveLength(1);
    expect(store.trips[0].id).toBe(id);
    expect(store.trips[0].tagline).toBe("rebuilt");
    expect(store.activeId).toBe(id);
  });

  it("a replaceId for a trip that no longer exists adds it instead of dropping it", () => {
    const { store } = upsertTrip(null, tripFor("Ghost"), { replaceId: "gone" });
    expect(store.trips).toHaveLength(1);
    expect(store.activeId).toBe(store.trips[0].id);
  });

  it("evicts oldest-first past MAX_TRIPS and reports what to clean up", () => {
    let store = null, evictedIds = [];
    for (let i = 0; i < MAX_TRIPS; i++) {
      ({ store } = upsertTrip(store, tripFor(`City${i}`), {}, Date.UTC(2026, 0, i + 1)));
    }
    expect(store.trips).toHaveLength(MAX_TRIPS);

    ({ store, evictedIds } = upsertTrip(store, tripFor("Newest"), {}, Date.UTC(2026, 1, 1)));
    expect(store.trips).toHaveLength(MAX_TRIPS);
    expect(evictedIds).toHaveLength(1);          // caller deletes its plan key
    expect(store.trips.map(t => t.destination)).not.toContain("City0"); // oldest gone
    expect(store.trips.map(t => t.destination)).toContain("Newest");
  });

  it("never evicts the trip it just made active", () => {
    let store = null;
    for (let i = 0; i < MAX_TRIPS + 3; i++) {
      ({ store } = upsertTrip(store, tripFor(`C${i}`), {}, Date.UTC(2026, 0, 1)));
      expect(getActiveTrip(store)).toBeTruthy();
      expect(store.trips.some(t => t.id === store.activeId)).toBe(true);
    }
  });
});

describe("getActiveTrip / removeTrip / listTrips", () => {
  it("falls back to the newest trip when activeId is stale", () => {
    let { store } = upsertTrip(null, tripFor("A"));
    ({ store } = upsertTrip(store, tripFor("B")));
    const withStale = { ...store, activeId: "does-not-exist" };
    expect(getActiveTrip(withStale).destination).toBe("B");
  });

  it("returns null when there are no trips", () => {
    expect(getActiveTrip({ v: 2, trips: [], activeId: null })).toBeNull();
    expect(getActiveTrip(null)).toBeNull();
  });

  it("removing the active trip promotes another", () => {
    let { store } = upsertTrip(null, tripFor("A"));
    ({ store } = upsertTrip(store, tripFor("B")));
    const next = removeTrip(store, store.activeId);
    expect(next.trips).toHaveLength(1);
    expect(next.activeId).toBe(next.trips[0].id);
    expect(getActiveTrip(next).destination).toBe("A");
  });

  it("lists newest-first", () => {
    let { store } = upsertTrip(null, tripFor("Older"), {}, Date.UTC(2026, 0, 1));
    ({ store } = upsertTrip(store, tripFor("Newer"), {}, Date.UTC(2026, 5, 1)));
    expect(listTrips(store).map(t => t.destination)).toEqual(["Newer", "Older"]);
  });
});

describe("localStorage round trip + the rollback contract", () => {
  it("migrates legacy keys on load and re-keys the legacy plan to its trip", () => {
    localStorage.setItem("wandr_trip", JSON.stringify(tripFor("Lisbon")));
    localStorage.setItem("wandr_plan", JSON.stringify({ planText: "## Day 1", planMode: "full" }));

    const store = loadTripStore();
    const id = store.activeId;

    expect(store.trips).toHaveLength(1);
    // The itinerary survived migration and now belongs to that trip.
    expect(JSON.parse(localStorage.getItem(planKeyFor(id))).planText).toBe("## Day 1");
    // Legacy keys are NOT deleted — that is the rollback path.
    expect(localStorage.getItem("wandr_trip")).toBeTruthy();
  });

  it("is idempotent — a second load does not duplicate the migrated trip", () => {
    localStorage.setItem("wandr_trip", JSON.stringify(tripFor("Lisbon")));
    const first = loadTripStore();
    const second = loadTripStore();
    expect(second.trips).toHaveLength(1);
    expect(second.activeId).toBe(first.activeId);
  });

  it("mirrors the active trip to the legacy key so a revert still resumes", () => {
    saveTripStore(upsertTrip(null, tripFor("Norway")).store);
    expect(JSON.parse(localStorage.getItem("wandr_trip")).destination).toBe("Norway");
  });

  it("persistTrip clears the legacy plan mirror — a new trip never inherits the old itinerary", () => {
    localStorage.setItem("wandr_plan", JSON.stringify({ planText: "OLD TRIP PLAN" }));
    persistTrip(tripFor("Fresh"));
    // Legacy trip and legacy plan must describe the same trip, or a rollback
    // would show the previous trip's itinerary under the new one.
    expect(localStorage.getItem("wandr_plan")).toBeNull();
    expect(JSON.parse(localStorage.getItem("wandr_trip")).destination).toBe("Fresh");
  });

  it("persistTrip deletes the plan of an evicted trip (no orphans)", () => {
    let store = null;
    for (let i = 0; i < MAX_TRIPS; i++) store = persistTrip(tripFor(`C${i}`));
    const oldestId = listTrips(store)[listTrips(store).length - 1].id;
    localStorage.setItem(planKeyFor(oldestId), JSON.stringify({ planText: "doomed" }));

    persistTrip(tripFor("Overflow"));
    expect(localStorage.getItem(planKeyFor(oldestId))).toBeNull();
  });

  it("survives localStorage throwing without losing the in-memory store", () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(() => loadTripStore()).not.toThrow();
    expect(loadTripStore().trips).toEqual([]);
    expect(() => persistTrip(tripFor("X"))).not.toThrow();
  });
});

describe("newTripId", () => {
  it("produces unique ids", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newTripId()));
    expect(ids.size).toBe(500);
  });
});

// ── Phase 2: switching and deleting ──────────────────────────────────────────

describe("setActiveTripId", () => {
  it("points activeId at an existing trip", () => {
    let { store } = upsertTrip(null, tripFor("A"));
    const aId = store.activeId;
    ({ store } = upsertTrip(store, tripFor("B")));
    expect(store.activeId).not.toBe(aId);

    const switched = setActiveTripId(store, aId);
    expect(switched.activeId).toBe(aId);
    expect(getActiveTrip(switched).destination).toBe("A");
  });

  it("ignores an unknown id rather than storing a dangling pointer", () => {
    const { store } = upsertTrip(null, tripFor("A"));
    const same = setActiveTripId(store, "nope");
    expect(same.activeId).toBe(store.activeId);
    expect(getActiveTrip(same)).toBeTruthy();
  });

  it("tolerates an empty store", () => {
    expect(setActiveTripId(null, "x").trips).toEqual([]);
  });
});

describe("activateTripId / deleteTrip (persisted)", () => {
  it("activateTripId persists the choice so a reload resumes the switched-to trip", () => {
    persistTrip(tripFor("France"));
    const store = persistTrip(tripFor("Norway"));
    const franceId = store.trips.find(t => t.destination === "France").id;

    activateTripId(franceId);
    // Re-read from storage — this is what a reload would do.
    expect(getActiveTrip(loadTripStore()).destination).toBe("France");
    // ...and the legacy mirror follows the active trip, for rollback.
    expect(JSON.parse(localStorage.getItem("wandr_trip")).destination).toBe("France");
  });

  it("deleteTrip removes the trip and its plan, promoting another", () => {
    persistTrip(tripFor("France"));
    const store = persistTrip(tripFor("Norway"));
    const norwayId = store.activeId;
    localStorage.setItem(planKeyFor(norwayId), JSON.stringify({ planText: "norway plan" }));

    const next = deleteTrip(norwayId);
    expect(next.trips.map(t => t.destination)).toEqual(["France"]);
    expect(localStorage.getItem(planKeyFor(norwayId))).toBeNull(); // no orphan
    expect(getActiveTrip(next).destination).toBe("France");
  });

  it("deleting the last trip leaves an empty store, not a dangling activeId", () => {
    const store = persistTrip(tripFor("Only"));
    const next = deleteTrip(store.activeId);
    expect(next.trips).toEqual([]);
    expect(next.activeId).toBeNull();
    expect(getActiveTrip(next)).toBeNull();
  });

  it("deleting a non-active trip leaves the active one alone", () => {
    persistTrip(tripFor("Keep"));
    const store = persistTrip(tripFor("Active"));
    const keepId = store.trips.find(t => t.destination === "Keep").id;
    const next = deleteTrip(keepId);
    expect(next.activeId).toBe(store.activeId);
    expect(getActiveTrip(next).destination).toBe("Active");
  });

  it("switching does not clobber either trip's plan", () => {
    const s1 = persistTrip(tripFor("France"));
    const franceId = s1.activeId;
    localStorage.setItem(planKeyFor(franceId), JSON.stringify({ planText: "FRANCE PLAN" }));
    const s2 = persistTrip(tripFor("Norway"));
    const norwayId = s2.activeId;
    localStorage.setItem(planKeyFor(norwayId), JSON.stringify({ planText: "NORWAY PLAN" }));

    activateTripId(franceId);
    activateTripId(norwayId);
    activateTripId(franceId);

    expect(JSON.parse(localStorage.getItem(planKeyFor(franceId))).planText).toBe("FRANCE PLAN");
    expect(JSON.parse(localStorage.getItem(planKeyFor(norwayId))).planText).toBe("NORWAY PLAN");
  });
});
