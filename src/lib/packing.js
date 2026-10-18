/**
 * Packing list — pure logic (design picks 1C+2C+3C, 2026-10-17).
 *
 * DATA CONTRACT — trip.packing (permanent once shipped; tolerate, never assume):
 *   {
 *     v: 1,
 *     seededFrom: "starter" | <tripId>,   // where the list came from
 *     updatedAt: ISO string,
 *     shelves: [{ id, name, items: [{ id, name, qty, rule, packed, last, why }] }]
 *   }
 *   rule  — null | "nights" | "nights+1": qty follows trip.nights (applyNights)
 *   last  — "Last call": packed the morning you leave
 *   why   — null | a reason label for a trip-aware add ("autumn", "Beach")
 *
 * Writes go through App.updatePacking → persistTrip(replaceId) →
 * scheduleSyncPush, the bucketPicks path — the whole trip row syncs, so
 * packing rides Supabase for free. Everything here is pure and returns new
 * objects; nothing mutates its input.
 */
import { parseISODate } from "./utils.js";

export const PACKING_VERSION = 1;
export const QTY_MAX = 99;
export const NUDGE_WINDOW_DAYS = 7;

const it = (name, o = {}) => ({ name, qty: 1, rule: null, packed: false, last: false, why: null, ...o });

/** The starter list — Kraig's draft, not a travel-tested canon. Edit freely. */
export const STARTER_SHELVES = [
  { name: "Papers & money", items: [
    it("Passport or ID"), it("Wallet & cards", { last: true }), it("Boarding pass on phone", { last: true }),
    it("Cash in local currency"), it("Hotel & flight confirmations"), it("Travel insurance card"),
  ] },
  { name: "Carry-on", items: [
    it("Headphones"), it("Power bank, charged", { last: true }), it("Water bottle, empty", { last: true }),
    it("Snacks"), it("Book or Kindle"), it("Pen"),
  ] },
  { name: "Tech", items: [
    it("Phone charger", { last: true }), it("Universal adapter"), it("Laptop & charger"),
    it("Watch charger"), it("Camera & SD cards"), it("Cables pouch"),
  ] },
  { name: "Clothing", items: [
    it("Underwear", { rule: "nights+1" }), it("Socks", { rule: "nights+1" }), it("T-shirts", { rule: "nights" }),
    it("Trousers or shorts", { qty: 2 }), it("Jacket or layer"), it("Walking shoes"), it("Sleepwear"), it("Swimsuit"),
  ] },
  { name: "Toiletries", items: [
    it("Toothbrush & paste", { last: true }), it("Deodorant", { last: true }), it("Razor"), it("Sunscreen"),
    it("Meds & vitamins"), it("Glasses or contacts", { last: true }), it("Small first-aid kit"),
  ] },
  { name: "Leaving the house", items: [
    it("Take out the trash", { last: true }), it("Water the plants", { last: true }),
    it("Thermostat down", { last: true }), it("Windows & doors locked", { last: true }),
  ] },
];

/**
 * Trip-aware adds (2C). Deterministic rules only — no model call, so nothing
 * is invented. `when` matches season names from tripSeason() or interest chips
 * from INTERESTS_GROUPS (constants.js); packing.test.js pins that every chip
 * named here still exists in the taxonomy. `shelf` names a starter shelf.
 */
export const PACKING_RULES = [
  { when: ["winter"],  shelf: "Clothing",  adds: ["Warm layer", "Gloves & hat"] },
  { when: ["autumn", "spring"], shelf: "Clothing", adds: ["Light rain layer"] },
  { when: ["summer"],  shelf: "Clothing",  adds: ["Sunglasses", "Sandals"] },
  { when: ["Beach", "Lake", "Water park", "Tubing", "Kayaking", "Pool club", "Hot springs", "Spa"], shelf: "Clothing", adds: ["Swimsuit", "Quick-dry towel", "Flip-flops"] },
  { when: ["Hiking", "Trails", "Desert", "Camping"], shelf: "Clothing", adds: ["Hiking shoes", "Day pack", "Blister plasters"] },
  { when: ["Camping", "Stargazing"], shelf: "Tech", adds: ["Headlamp"] },
  { when: ["Golf"], shelf: "Clothing", adds: ["Golf glove & shoes"] },
  { when: ["Pickleball", "Tennis", "Volleyball"], shelf: "Clothing", adds: ["Court shoes"] },
  { when: ["Cycling"], shelf: "Clothing", adds: ["Cycling kit"] },
  { when: ["Rock climbing"], shelf: "Clothing", adds: ["Climbing shoes"] },
  { when: ["Bars", "Clubs", "Cocktails", "Casino"], shelf: "Clothing", adds: ["Going-out outfit"] },
  { when: ["Live music", "Festivals", "Theater"], shelf: "Carry-on", adds: ["Earplugs"] },
  { when: ["Yoga", "Meditation"], shelf: "Clothing", adds: ["Yoga clothes"] },
  { when: ["Baseball", "Basketball", "Football", "Hockey", "Soccer", "Spring training", "College sports"], shelf: "Clothing", adds: ["Team cap or jersey"] },
  { when: ["Shopping", "Markets"], shelf: "Carry-on", adds: ["Packable tote"] },
  { when: ["ATV", "Jeep tour", "Horseback"], shelf: "Clothing", adds: ["Closed-toe shoes", "Bandana or buff"] },
  { when: ["Boat tour"], shelf: "Toiletries", adds: ["Motion sickness tabs"] },
];

/* ── helpers ── */
let seq = 0;
export function newId(prefix) {
  seq = (seq + 1) % 1000;
  return `${prefix}-${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}
const norm = (s) => String(s || "").trim().toLowerCase();
const nowIso = (now) => new Date(now ?? Date.now()).toISOString();
const clamp = (n) => Math.min(QTY_MAX, Math.max(1, n));

/** Qty an item should show for `nights` (bucket trips pass null → fixed). */
export function ruleQty(item, nights) {
  const n = Number(nights);
  const has = nights !== null && nights !== undefined && nights !== "" && Number.isFinite(n) && n >= 0;
  if (item.rule === "nights+1" && has) return clamp(n + 1);
  if (item.rule === "nights" && has) return clamp(n);
  return clamp(Number(item.qty) || 1);
}

/** Re-fit every ruled count to `nights`. Pure. */
export function applyNights(packing, nights) {
  if (!packing?.shelves) return packing;
  return {
    ...packing,
    shelves: packing.shelves.map(s => ({ ...s, items: s.items.map(i => ({ ...i, qty: ruleQty(i, nights) })) })),
  };
}

export function packingTotals(packing) {
  let total = 0, packed = 0, last = 0, lastPacked = 0;
  for (const s of packing?.shelves || []) for (const i of s.items) {
    total++; if (i.packed) packed++;
    if (i.last) { last++; if (i.packed) lastPacked++; }
  }
  return { total, packed, togo: total - packed, last, lastTogo: last - lastPacked, pct: total ? Math.round(packed / total * 100) : 0 };
}

/** Meteorological season of the departure date (northern hemisphere). */
export function tripSeason(trip) {
  const d = parseISODate(trip?.answers?.dates?.start);
  if (!d) return null;
  const m = d.getMonth();
  return m <= 1 || m === 11 ? "winter" : m <= 4 ? "spring" : m <= 7 ? "summer" : "autumn";
}

function tripChips(trip) {
  const i = trip?.answers?.interests;
  const chips = Array.isArray(i) ? i : Array.isArray(i?.chips) ? i.chips : [];
  return chips.map(String);
}

/**
 * What the trip adds on top of a seed: [{ name, shelf, why }], deduped against
 * `existingNames` and against each other. `why` is the human reason shown on
 * the item ("Added · autumn", "Added · Beach") — the honesty rule.
 */
export function tripAdds(trip, existingNames = []) {
  const seen = new Set(existingNames.map(norm));
  const season = tripSeason(trip);
  const chips = new Set(tripChips(trip).map(norm));
  const out = [];
  for (const rule of PACKING_RULES) {
    const hit = rule.when.find(w => (season && w === season) || chips.has(norm(w)));
    if (!hit) continue;
    for (const name of rule.adds) {
      if (seen.has(norm(name))) continue;
      seen.add(norm(name));
      out.push({ name, shelf: rule.shelf, why: hit });
    }
  }
  return out;
}

/** Most recent OTHER trip that has a packing list — the carry-forward source. */
export function latestPackingSource(trips, excludeId) {
  return (trips || [])
    .filter(t => t && t.id !== excludeId && t.packing?.shelves?.length)
    .sort((a, b) => ((b.packing.updatedAt || b.savedAt || "") > (a.packing.updatedAt || a.savedAt || "") ? 1 : -1))[0] || null;
}

/**
 * Build a trip's list (2C). `source` = a previous trip (its list carries
 * forward: names, counts, rules, Last call tags, all unpacked) or null for the
 * starter. Then the trip's own adds, then counts refit to its nights.
 */
export function seedPacking(trip, source = null, now) {
  const base = source?.packing?.shelves?.length ? source.packing.shelves : STARTER_SHELVES;
  const shelves = base.map(s => ({
    id: newId("s"), name: s.name,
    items: s.items.map(i => ({ id: newId("i"), name: i.name, qty: i.qty || 1, rule: i.rule || null, packed: false, last: !!i.last, why: null })),
  }));
  const names = shelves.flatMap(s => s.items.map(i => i.name));
  for (const add of tripAdds(trip, names)) {
    let shelf = shelves.find(s => norm(s.name) === norm(add.shelf));
    if (!shelf) { shelf = { id: newId("s"), name: add.shelf, items: [] }; shelves.push(shelf); }
    shelf.items.push({ id: newId("i"), name: add.name, qty: 1, rule: null, packed: false, last: false, why: add.why });
  }
  return applyNights({ v: PACKING_VERSION, seededFrom: source?.id || "starter", updatedAt: nowIso(now), shelves }, trip?.nights);
}

/* ── mutations: every write the screen makes, pure ── */
function touch(packing, shelves, now) { return { ...packing, v: PACKING_VERSION, updatedAt: nowIso(now), shelves }; }
function mapItem(packing, id, fn) {
  return packing.shelves.map(s => ({ ...s, items: s.items.map(i => (i.id === id ? fn(i) : i)) }));
}

export function findItem(packing, id) {
  for (const s of packing?.shelves || []) {
    const idx = s.items.findIndex(i => i.id === id);
    if (idx !== -1) return { shelf: s, item: s.items[idx], index: idx };
  }
  return null;
}
export function toggleItem(packing, id, now) { return touch(packing, mapItem(packing, id, i => ({ ...i, packed: !i.packed })), now); }
export function toggleLast(packing, id, now) { return touch(packing, mapItem(packing, id, i => ({ ...i, last: !i.last })), now); }
/** A manual count pins the item (rule → null) — the hint on the action bar says so. */
export function setQty(packing, id, qty, now) {
  const q = Number(qty);
  if (!Number.isFinite(q) || q < 1 || q > QTY_MAX) return packing;
  return touch(packing, mapItem(packing, id, i => ({ ...i, qty: q, rule: null })), now);
}
export function removeItem(packing, id, now) {
  return touch(packing, packing.shelves.map(s => ({ ...s, items: s.items.filter(i => i.id !== id) })), now);
}
/** Undo for removeItem: put it back where it was. */
export function restoreItem(packing, shelfId, item, index, now) {
  return touch(packing, packing.shelves.map(s => {
    if (s.id !== shelfId) return s;
    const items = [...s.items]; items.splice(Math.min(index, items.length), 0, item); return { ...s, items };
  }), now);
}
/** "Shirts x3" → { name: "Shirts", qty: 3 }; null for blank input. */
export function parseAddText(raw) {
  let name = String(raw || "").trim(), qty = 1;
  const m = /^(.*?)\s*[x×](\d{1,2})$/i.exec(name);
  if (m && m[1].trim()) { name = m[1].trim(); qty = clamp(parseInt(m[2], 10)); }
  return name ? { name, qty } : null;
}
export function addItem(packing, shelfId, raw, now) {
  const p = parseAddText(raw);
  if (!p) return packing;
  const item = { id: newId("i"), name: p.name, qty: p.qty, rule: null, packed: false, last: false, why: null };
  return touch(packing, packing.shelves.map(s => (s.id === shelfId ? { ...s, items: [...s.items, item] } : s)), now);
}
export function addShelf(packing, name, now) {
  const n = String(name || "").trim();
  if (!n) return packing;
  return touch(packing, [...packing.shelves, { id: newId("s"), name: n, items: [] }], now);
}
export function unpackAll(packing, now) {
  return touch(packing, packing.shelves.map(s => ({ ...s, items: s.items.map(i => (i.packed ? { ...i, packed: false } : i)) })), now);
}

/* ── the nudge (3C): ONE function, two surfaces ── */
function daysUntil(iso, now) {
  const d = parseISODate(iso);
  if (!d) return null;
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d - t) / 86400000);
}

/**
 * The one line both the welcome shelf stub and the dashboard row render.
 * null = say nothing (bucket trips, no dates, more than 7 days out, departed).
 *   { kind: "pack" | "lastcall" | "closed" | "start", days, togo, lastTogo,
 *     short: "25 to pack" | "Last call · 6" | "Bags closed" | "Time to pack",
 *     long:  "Pack for Lisbon · 25 to go" | "Last call · 6 things before you leave" | … }
 */
export function packingNudge(trip, now = new Date()) {
  if (!trip || trip.tripStyle === "bucket" || trip._building || trip._error) return null;
  const days = daysUntil(trip.answers?.dates?.start, now);
  if (days === null || days < 0 || days > NUDGE_WINDOW_DAYS) return null;
  const dest = trip.destination || "your trip";
  if (!trip.packing?.shelves?.length) {
    return { kind: "start", days, togo: null, lastTogo: null, short: "Time to pack", long: `Pack for ${dest} · ${days === 0 ? "departs today" : days === 1 ? "departs tomorrow" : `departs in ${days} days`}` };
  }
  const t = packingTotals(trip.packing);
  if (t.total > 0 && t.togo === 0) return { kind: "closed", days, togo: 0, lastTogo: 0, short: "Bags closed", long: "Bags closed · everything packed" };
  if (days === 0 && t.lastTogo > 0 && t.togo === t.lastTogo) {
    return { kind: "lastcall", days, togo: t.togo, lastTogo: t.lastTogo, short: `Last call · ${t.lastTogo}`, long: `Last call · ${t.lastTogo} ${t.lastTogo === 1 ? "thing" : "things"} before you leave` };
  }
  return { kind: "pack", days, togo: t.togo, lastTogo: t.lastTogo, short: `${t.togo} to pack`, long: `Pack for ${dest} · ${t.togo} to go` };
}
