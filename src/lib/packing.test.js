import { describe, it, expect } from "vitest";
import { INTERESTS_GROUPS } from "./constants.js";
import {
  STARTER_SHELVES, PACKING_RULES, ruleQty, applyNights, packingTotals, tripSeason, tripAdds,
  latestPackingSource, seedPacking, toggleItem, toggleLast, setQty, removeItem, restoreItem,
  parseAddText, addItem, addShelf, unpackAll, packingNudge, findItem, NUDGE_WINDOW_DAYS,
} from "./packing.js";

// Packing list (design picks 1C+2C+3C, 2026-10-17). Everything here is pure.

const trip = (o = {}) => ({
  id: "t-lisbon", destination: "Lisbon", tripStyle: "itinerary", nights: 4,
  answers: { dates: { start: "2026-10-24", end: "2026-10-28" }, interests: { chips: ["Beach", "Museums"], text: "" } },
  ...o,
});
const names = (p) => p.shelves.flatMap(s => s.items.map(i => i.name));
const byName = (p, n) => p.shelves.flatMap(s => s.items).find(i => i.name === n);

describe("starter list", () => {
  it("has six shelves and no duplicate names", () => {
    expect(STARTER_SHELVES.map(s => s.name)).toEqual(["Papers & money", "Carry-on", "Tech", "Clothing", "Toiletries", "Leaving the house"]);
    const all = STARTER_SHELVES.flatMap(s => s.items.map(i => i.name.toLowerCase()));
    expect(new Set(all).size).toBe(all.length);
  });
  it("marks the morning-of things as Last call", () => {
    const last = STARTER_SHELVES.flatMap(s => s.items).filter(i => i.last).map(i => i.name);
    expect(last).toContain("Phone charger");
    expect(last).toContain("Toothbrush & paste");
    expect(last).toContain("Boarding pass on phone");
  });
});

describe("nights rule", () => {
  it("nights+1 and nights follow the trip; fixed counts stay", () => {
    expect(ruleQty({ rule: "nights+1", qty: 1 }, 4)).toBe(5);
    expect(ruleQty({ rule: "nights", qty: 1 }, 4)).toBe(4);
    expect(ruleQty({ rule: null, qty: 2 }, 4)).toBe(2);
  });
  it("bucket trips (nights null) keep whatever count is stored, never below 1", () => {
    expect(ruleQty({ rule: "nights+1", qty: 5 }, null)).toBe(5);
    expect(ruleQty({ rule: "nights", qty: 0 }, undefined)).toBe(1);
  });
  it("caps at 99 and floors at 1", () => {
    expect(ruleQty({ rule: "nights+1", qty: 1 }, 200)).toBe(99);
    expect(ruleQty({ rule: "nights", qty: 1 }, 0)).toBe(1);
  });
  it("applyNights refits every ruled item and leaves pinned ones alone", () => {
    const p = seedPacking(trip(), null);
    const refit = applyNights(p, 7);
    expect(byName(refit, "Underwear").qty).toBe(8);
    expect(byName(refit, "T-shirts").qty).toBe(7);
    expect(byName(refit, "Trousers or shorts").qty).toBe(2);
  });
});

describe("trip-aware adds (2C)", () => {
  it("every interest chip named in a rule still exists in the taxonomy", () => {
    const chips = new Set(INTERESTS_GROUPS.flatMap(g => g.opts));
    const seasons = new Set(["winter", "spring", "summer", "autumn"]);
    for (const r of PACKING_RULES) for (const w of r.when) {
      expect(seasons.has(w) || chips.has(w), `rule word "${w}" is not a season or a taxonomy chip`).toBe(true);
    }
  });
  it("every rule targets a starter shelf", () => {
    const shelves = new Set(STARTER_SHELVES.map(s => s.name));
    for (const r of PACKING_RULES) expect(shelves.has(r.shelf), r.shelf).toBe(true);
  });
  it("derives the season from the departure date", () => {
    expect(tripSeason(trip())).toBe("autumn");
    expect(tripSeason(trip({ answers: { dates: { start: "2026-01-10" } } }))).toBe("winter");
    expect(tripSeason(trip({ answers: { dates: { start: "2026-07-04" } } }))).toBe("summer");
    expect(tripSeason(trip({ answers: { dates: { bucket: true } } }))).toBeNull();
  });
  it("adds labeled items for the season and the interests, deduped against the list", () => {
    const adds = tripAdds(trip(), ["Swimsuit"]);
    const n = adds.map(a => a.name);
    expect(n).toContain("Light rain layer");
    expect(n).toContain("Quick-dry towel");
    expect(n).not.toContain("Swimsuit"); // already on the list
    expect(adds.find(a => a.name === "Light rain layer").why).toBe("autumn");
    expect(adds.find(a => a.name === "Quick-dry towel").why).toBe("Beach");
    expect(new Set(n).size).toBe(n.length);
  });
  it("adds nothing for a bucket trip with no chips", () => {
    expect(tripAdds(trip({ answers: { dates: { bucket: true, now: "now" }, interests: { chips: [] } } }))).toEqual([]);
  });
  it("reads interests stored as a bare array too (older trips)", () => {
    const adds = tripAdds(trip({ answers: { dates: {}, interests: ["Hiking"] } }));
    expect(adds.map(a => a.name)).toContain("Day pack");
  });
});

describe("seeding (2C: carry forward, then adds, then nights)", () => {
  it("starter seed: unpacked, counts follow nights, adds land on their shelf with a reason", () => {
    const p = seedPacking(trip(), null, 0);
    expect(p.v).toBe(1);
    expect(p.seededFrom).toBe("starter");
    expect(p.shelves.every(s => s.items.every(i => !i.packed))).toBe(true);
    expect(byName(p, "Socks").qty).toBe(5);
    const rain = byName(p, "Light rain layer");
    expect(rain.why).toBe("autumn");
    expect(p.shelves.find(s => s.name === "Clothing").items).toContain(rain);
    expect(byName(p, "Swimsuit").why).toBeNull(); // starter item, not an add
  });
  it("carry forward: a previous trip's names, counts, rules and Last call tags, all unpacked", () => {
    const porto = trip({ id: "t-porto", destination: "Porto", nights: 3 });
    let prev = seedPacking(porto, null);
    prev = addItem(prev, prev.shelves[2].id, "Camera strap");
    prev = toggleItem(prev, byName(prev, "Camera strap").id);
    prev = toggleLast(prev, byName(prev, "Camera strap").id);
    const p = seedPacking(trip(), { ...porto, packing: prev });
    expect(p.seededFrom).toBe("t-porto");
    const strap = byName(p, "Camera strap");
    expect(strap.packed).toBe(false);
    expect(strap.last).toBe(true);
    expect(byName(p, "Underwear").qty).toBe(5);       // refit from Porto's 4 to Lisbon's 4+1
    expect(byName(p, "Underwear").rule).toBe("nights+1");
  });
  it("carry forward drops the previous trip's own adds' reasons and re-adds for this trip", () => {
    const beach = trip({ id: "t-beach", destination: "Cancún", answers: { dates: { start: "2026-07-01", end: "2026-07-05" }, interests: { chips: ["Beach"] } } });
    const prev = seedPacking(beach, null);
    expect(byName(prev, "Sandals").why).toBe("summer");
    const ski = trip({ answers: { dates: { start: "2026-01-10", end: "2026-01-14" }, interests: { chips: ["Hiking"] } } });
    const p = seedPacking(ski, { ...beach, packing: prev });
    expect(byName(p, "Sandals").why).toBeNull();      // carried as the traveler's own item now
    expect(byName(p, "Warm layer").why).toBe("winter");
    expect(byName(p, "Day pack").why).toBe("Hiking");
  });
  it("latestPackingSource picks the most recently updated OTHER trip with a list", () => {
    const a = { id: "a", packing: { shelves: [{ items: [] }], updatedAt: "2026-09-01T00:00:00Z" } };
    const b = { id: "b", packing: { shelves: [{ items: [] }], updatedAt: "2026-10-01T00:00:00Z" } };
    const c = { id: "c" };
    expect(latestPackingSource([a, b, c], "x").id).toBe("b");
    expect(latestPackingSource([a, b, c], "b").id).toBe("a");
    expect(latestPackingSource([c], "x")).toBeNull();
  });
});

describe("mutations are pure and complete", () => {
  const p0 = seedPacking(trip(), null);
  const id = byName(p0, "Socks").id;
  it("toggle / last / qty", () => {
    const p1 = toggleItem(p0, id);
    expect(byName(p1, "Socks").packed).toBe(true);
    expect(byName(p0, "Socks").packed).toBe(false);   // input untouched
    expect(byName(toggleLast(p0, id), "Socks").last).toBe(true);
    const pinned = byName(setQty(p0, id, 7), "Socks");
    expect(pinned.qty).toBe(7);
    expect(pinned.rule).toBeNull();                   // a manual count pins the item
    expect(setQty(p0, id, 0)).toBe(p0);
    expect(setQty(p0, id, 100)).toBe(p0);
  });
  it("remove then restore puts it back in place", () => {
    const f = findItem(p0, id);
    const p1 = removeItem(p0, id);
    expect(byName(p1, "Socks")).toBeUndefined();
    const p2 = restoreItem(p1, f.shelf.id, f.item, f.index);
    expect(p2.shelves.find(s => s.id === f.shelf.id).items[f.index].name).toBe("Socks");
  });
  it("add parses the x3 shorthand and ignores blanks", () => {
    expect(parseAddText("Shirts x3")).toEqual({ name: "Shirts", qty: 3 });
    expect(parseAddText("Shirts ×12")).toEqual({ name: "Shirts", qty: 12 });
    expect(parseAddText("x3")).toEqual({ name: "x3", qty: 1 });
    expect(parseAddText("   ")).toBeNull();
    const shelf = p0.shelves[0].id;
    const p1 = addItem(p0, shelf, "Hat x2");
    expect(byName(p1, "Hat").qty).toBe(2);
    expect(addItem(p0, shelf, "")).toBe(p0);
  });
  it("addShelf and unpackAll", () => {
    expect(addShelf(p0, "Beach").shelves.at(-1).name).toBe("Beach");
    expect(addShelf(p0, " ")).toBe(p0);
    const all = { ...p0, shelves: p0.shelves.map(s => ({ ...s, items: s.items.map(i => ({ ...i, packed: true })) })) };
    expect(packingTotals(all).togo).toBe(0);
    expect(packingTotals(unpackAll(all)).packed).toBe(0);
  });
  it("totals", () => {
    const t = packingTotals(toggleItem(p0, id));
    expect(t.packed).toBe(1);
    expect(t.togo).toBe(t.total - 1);
    expect(t.pct).toBe(Math.round(100 / t.total));
    expect(packingTotals(null)).toEqual({ total: 0, packed: 0, togo: 0, last: 0, lastTogo: 0, pct: 0 });
  });
});

describe("packingNudge — one line, two surfaces (3C)", () => {
  const at = (iso) => new Date(iso + "T09:00:00");
  it("is silent outside the 7-day window, after departure, for bucket trips, and while building", () => {
    expect(NUDGE_WINDOW_DAYS).toBe(7);
    expect(packingNudge(trip(), at("2026-10-16"))).toBeNull();           // 8 days out
    expect(packingNudge(trip(), at("2026-10-25"))).toBeNull();           // departed
    expect(packingNudge(trip({ tripStyle: "bucket" }), at("2026-10-20"))).toBeNull();
    expect(packingNudge(trip({ _building: true }), at("2026-10-20"))).toBeNull();
    expect(packingNudge(null, at("2026-10-20"))).toBeNull();
  });
  it("before the list exists it says it is time to pack", () => {
    const n = packingNudge(trip(), at("2026-10-17"));
    expect(n.kind).toBe("start");
    expect(n.short).toBe("Time to pack");
    expect(n.long).toBe("Pack for Lisbon · departs in 7 days");
    expect(packingNudge(trip(), at("2026-10-24")).long).toBe("Pack for Lisbon · departs today");
  });
  it("counts what is left once the list exists", () => {
    const p = seedPacking(trip(), null);
    const n = packingNudge(trip({ packing: p }), at("2026-10-20"));
    const t = packingTotals(p);
    expect(n.kind).toBe("pack");
    expect(n.short).toBe(`${t.total} to pack`);
    expect(n.long).toBe(`Pack for Lisbon · ${t.total} to go`);
  });
  it("on departure day with only Last call items left it says last call", () => {
    let p = seedPacking(trip(), null);
    for (const s of p.shelves) for (const i of s.items) if (!i.last) p = toggleItem(p, i.id);
    const t = packingTotals(p);
    const n = packingNudge(trip({ packing: p }), at("2026-10-24"));
    expect(n.kind).toBe("lastcall");
    expect(n.short).toBe(`Last call · ${t.lastTogo}`);
    expect(n.long).toBe(`Last call · ${t.lastTogo} things before you leave`);
    // the day before, the same list is still a plain count
    expect(packingNudge(trip({ packing: p }), at("2026-10-23")).kind).toBe("pack");
  });
  it("says bags closed when everything is packed", () => {
    let p = seedPacking(trip(), null);
    for (const s of p.shelves) for (const i of s.items) p = toggleItem(p, i.id);
    const n = packingNudge(trip({ packing: p }), at("2026-10-23"));
    expect(n.kind).toBe("closed");
    expect(n.short).toBe("Bags closed");
  });
});
