import { describe, it, expect } from "vitest";
import { cacheKeyFor, pruneCache, mergeVerification, collectVenues } from "./places.js";
import { GROUNDING } from "./constants.js";

describe("cacheKeyFor", () => {
  it("normalizes case and whitespace so equivalent lookups share an entry", () => {
    expect(cacheKeyFor("Heard  Museum", "Phoenix, USA"))
      .toBe(cacheKeyFor("heard museum", "phoenix, usa"));
  });

  it("keeps different destinations distinct", () => {
    expect(cacheKeyFor("MoMA", "New York")).not.toBe(cacheKeyFor("MoMA", "San Francisco"));
  });
});

describe("pruneCache", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = 1_000_000_000_000;

  it("drops expired entries, keeps live ones", () => {
    const pruned = pruneCache({
      fresh: { t: now - DAY,      r: {} },
      stale: { t: now - 31 * DAY, r: {} },
    }, now);
    expect(pruned.fresh).toBeDefined();
    expect(pruned.stale).toBeUndefined();
  });

  it("caps size, evicting oldest first", () => {
    const entries = {};
    for (let i = 0; i < 350; i++) entries[`k${i}`] = { t: now - i, r: {} };
    const pruned = pruneCache(entries, now);
    expect(Object.keys(pruned).length).toBe(300);
    expect(pruned.k0).toBeDefined();    // newest survives
    expect(pruned.k349).toBeUndefined(); // oldest evicted
  });

  it("tolerates malformed entries and empty input", () => {
    expect(pruneCache({ bad: null, worse: { r: {} } }, now)).toEqual({});
    expect(pruneCache(undefined, now)).toEqual({});
  });
});

describe("mergeVerification", () => {
  const categories = {
    culture: [
      { name: "Heard Museum",  description: "d1", priority: "essential" },
      { name: "Futile Coffee", description: "d2", priority: "optional" },
    ],
    nature: [{ name: "Camelback Mountain", description: "d3", priority: "essential" }],
  };

  const results = [
    { name: "Heard Museum", category: "culture", verified: true,
      canonicalName: "Heard Museum", address: "2301 N Central Ave",
      mapUrl: "https://maps.example/x", placeId: "pid", location: { lat: 1, lng: 2 } },
    { name: "Futile Coffee", category: "culture", verified: false, reason: "no-match" },
  ];

  it("verified items gain fields; name is NEVER overwritten", () => {
    const { categories: merged } = mergeVerification(categories, results);
    const heard = merged.culture[0];
    expect(heard.verified).toBe(true);
    expect(heard.address).toBe("2301 N Central Ave");
    expect(heard.name).toBe("Heard Museum");
    expect(heard.description).toBe("d1");   // existing fields untouched
    expect(heard.priority).toBe("essential");
  });

  it("checked misses get verified:false, nothing else", () => {
    const { categories: merged } = mergeVerification(categories, results);
    const futile = merged.culture[1];
    expect(futile.verified).toBe(false);
    expect(futile.address).toBeUndefined();
  });

  it("unchecked categories pass through untouched", () => {
    const { categories: merged } = mergeVerification(categories, results);
    expect(merged.nature[0]).toEqual(categories.nature[0]);
    expect(merged.nature[0].verified).toBeUndefined();
  });

  it("computes measurement stats", () => {
    const { stats } = mergeVerification(categories, results);
    expect(stats).toEqual({
      checked: 2, verified: 1,
      misses: [{ name: "Futile Coffee", reason: "no-match" }],
    });
  });

  it("empty results leave everything untouched (old trips, stub mode)", () => {
    const { categories: merged, stats } = mergeVerification(categories, []);
    expect(merged).toEqual(categories);
    expect(stats.checked).toBe(0);
  });

  it("tolerates malformed category values", () => {
    const { categories: merged } = mergeVerification({ culture: "not-an-array" }, results);
    expect(merged.culture).toBe("not-an-array");
  });
});

describe("collectVenues", () => {
  it("collects all GROUNDING.categories, skipping blank names and non-grounded keys", () => {
    const cats = {
      culture: [{ name: "Heard Museum" }, { name: "  " }, { notName: true }],
      nature:  [{ name: "Camelback Mountain" }],
      notARealCategory: [{ name: "Should Not Appear" }],
    };
    const venues = collectVenues(cats);
    // Phase-2 config (2026-08-13) grounds every category the build can emit —
    // this assertion intentionally couples to GROUNDING so changing coverage
    // forces a conscious test touch.
    expect(GROUNDING.categories).toEqual(["nature", "culture", "nightlife", "exploration", "experiences"]);
    expect(venues).toEqual([
      { name: "Camelback Mountain", category: "nature" },
      { name: "Heard Museum", category: "culture" },
    ]);
  });

  it("caps at maxPerRequest with essentials surviving first", () => {
    const many = n => Array.from({ length: n }, (_, i) => ({ name: `Optional ${i}`, priority: "optional" }));
    const cats = {
      nature: many(GROUNDING.maxPerRequest),
      culture: [{ name: "Must See", priority: "essential" }, { name: "Nice To See", priority: "recommended" }],
    };
    const venues = collectVenues(cats);
    expect(venues.length).toBe(GROUNDING.maxPerRequest);
    expect(venues[0]).toEqual({ name: "Must See", category: "culture" });
    expect(venues[1]).toEqual({ name: "Nice To See", category: "culture" });
    // No internal fields leak into the request payload.
    expect(Object.keys(venues[0])).toEqual(["name", "category"]);
  });

  it("handles missing categories safely", () => {
    expect(collectVenues(undefined)).toEqual([]);
    expect(collectVenues({})).toEqual([]);
  });
});
