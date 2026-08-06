import { describe, it, expect } from "vitest";
import { scorePlan, checkPlan, namesAPlace, countFiller, paceBand } from "./planQuality.js";
import { PACE_BANDS } from "./constants.js";

const act = (time, title, details = "d") => ({ id: title, time, title, details });
const day = (label, activities, tips = ["t"]) => ({ label, activities, food: [], tips, extras: [] });

describe("namesAPlace", () => {
  it("accepts titles naming a real venue", () => {
    expect(namesAPlace("Heard Museum")).toBe(true);
    expect(namesAPlace("Visit Camelback Mountain")).toBe(true);
    expect(namesAPlace("Breakfast at Matt's Big Breakfast")).toBe(true);
    expect(namesAPlace("Tram 28")).toBe(true);
  });

  it("rejects generic filler activities", () => {
    // The Poul card principle applied to itineraries: name a place, don't
    // describe an activity.
    expect(namesAPlace("Free time")).toBe(false);
    expect(namesAPlace("Explore the neighbourhood")).toBe(false);
    expect(namesAPlace("Lunch")).toBe(false);
    expect(namesAPlace("Local cafe")).toBe(false);
    expect(namesAPlace("Check-in")).toBe(false);
    expect(namesAPlace("Morning activity options")).toBe(false);
  });

  it("handles junk", () => {
    expect(namesAPlace("")).toBe(false);
    expect(namesAPlace(null)).toBe(false);
    expect(namesAPlace("   ")).toBe(false);
  });
});

describe("countFiller", () => {
  it("counts the banned phrases the prompt already forbids", () => {
    const r = countFiller("Soak in the views and immerse yourself in this vibrant, charming spot.");
    expect(r.total).toBeGreaterThanOrEqual(4);
    expect(r.hits.map(h => h.phrase)).toContain("soak in");
    expect(r.hits.map(h => h.phrase)).toContain("immerse yourself");
  });

  it("is clean on factual copy", () => {
    expect(countFiller("Heard Museum. 2 hours. $25 entry. Closed Mondays.").total).toBe(0);
  });

  it("handles empty input", () => {
    expect(countFiller("").total).toBe(0);
    expect(countFiller(null).total).toBe(0);
  });
});

describe("paceBand is the shared source of truth", () => {
  it("re-exports the constants band, so scorer and prompt cannot disagree", () => {
    expect(paceBand("Slow")).toEqual(PACE_BANDS.Slow);
    expect(paceBand("Fast")).toEqual(PACE_BANDS.Fast);
    expect(paceBand("Balanced")).toEqual(PACE_BANDS.Balanced);
    expect(paceBand(undefined)).toEqual(PACE_BANDS.Balanced);
  });
});

describe("scorePlan", () => {
  const cleanModel = {
    days: [
      day("Day 1", [act("9am", "Heard Museum"), act("1pm", "Desert Botanical Garden"), act("6pm", "FnB Restaurant")]),
      day("Day 2", [act("8am", "Camelback Mountain"), act("2pm", "Taliesin West"), act("7pm", "Kazimierz Wine Bar")]),
    ],
  };
  const balanced = { logistics: { pace: "Balanced" } };

  it("gives a clean plan a perfect score", () => {
    const r = scorePlan(cleanModel, "Factual text only.", balanced);
    expect(r.score).toBe(100);
    expect(r.issues).toEqual([]);
    expect(r.stats.activities).toBe(6);
  });

  it("flags a venue scheduled on two different days", () => {
    // The exact Phoenix defect the baseline measurement caught.
    const dupe = {
      days: [
        day("Day 1", [act("9am", "SMoCA"), act("1pm", "Old Town"), act("6pm", "Kazimierz Wine Bar")]),
        day("Day 2", [act("9am", "SMoCA"), act("1pm", "Taliesin West"), act("7pm", "Postino")]),
      ],
    };
    const r = scorePlan(dupe, "x", balanced);
    const issue = r.issues.find(i => i.code === "duplicate-venue");
    expect(issue).toBeTruthy();
    expect(issue.detail).toMatch(/smoca/i);
    expect(r.score).toBeLessThan(100);
  });

  it("flags days outside the requested pace band", () => {
    // The exact Lisbon defect: Slow requested, four activities delivered.
    const busy = {
      days: [day("Day 1", [act("9am", "A Place"), act("11am", "B Place"), act("2pm", "C Place"), act("6pm", "D Place")])],
    };
    const r = scorePlan(busy, "x", { logistics: { pace: "Slow" } });
    const issue = r.issues.find(i => i.code === "off-pace");
    expect(issue).toBeTruthy();
    expect(issue.detail).toContain("2-3/day");
  });

  it("the same plan passes at a pace that actually allows it", () => {
    const busy = {
      days: [day("Day 1", [act("9am", "A Place"), act("11am", "B Place"), act("2pm", "C Place"), act("6pm", "D Place")])],
    };
    expect(scorePlan(busy, "x", { logistics: { pace: "Fast" } }).issues.find(i => i.code === "off-pace")).toBeUndefined();
  });

  it("flags an early riser whose days start late", () => {
    const late = { days: [day("Day 1", [act("11am", "Late Place"), act("2pm", "B Place"), act("6pm", "C Place")])] };
    const r = scorePlan(late, "x", { logistics: { pace: "Balanced", rhythm: "Early riser" } });
    expect(r.issues.find(i => i.code === "off-rhythm")).toBeTruthy();
  });

  it("does not flag a night owl for the same late start", () => {
    const late = { days: [day("Day 1", [act("11am", "Late Place"), act("2pm", "B Place"), act("6pm", "C Place")])] };
    const r = scorePlan(late, "x", { logistics: { pace: "Balanced", rhythm: "Night owl" } });
    expect(r.issues.find(i => i.code === "off-rhythm")).toBeUndefined();
  });

  it("flags times running backwards within a day", () => {
    const jumbled = { days: [day("Day 1", [act("6pm", "A Place"), act("9am", "B Place"), act("2pm", "C Place")])] };
    expect(scorePlan(jumbled, "x", balanced).issues.find(i => i.code === "times-out-of-order")).toBeTruthy();
  });

  it("flags missing TIPS lines", () => {
    const noTips = { days: [day("Day 1", [act("9am", "A Place"), act("1pm", "B Place"), act("6pm", "C Place")], [])] };
    expect(scorePlan(noTips, "x", balanced).issues.find(i => i.code === "missing-tips")).toBeTruthy();
  });

  it("never returns a negative score", () => {
    const awful = {
      days: Array.from({ length: 6 }, (_, i) =>
        day(`Day ${i}`, [act("6pm", "Free time"), act("9am", "Free time"), act("10am", "Lunch")], [])),
    };
    const r = scorePlan(awful, "soak in the vibrant bustling charming hidden gem picturesque", { logistics: { pace: "Slow" } });
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it("handles an empty plan without throwing", () => {
    const r = scorePlan({ days: [] }, "", {});
    expect(r.stats.days).toBe(0);
    expect(typeof r.score).toBe("number");
  });
});

// ── checkPlan — the traveler-facing half (§15 #13/#14) ──────────────────────
//
// Fixtures mirror the Baltimore export that motivated this: a 7-night trip that
// shipped 6 days, with Checkerspot Brewing Company scheduled on both Day 1 and
// Day 5 (the model left the repeated name in the Activity column and buried
// "already visited Day 1 — substitute: ..." in the details).

const codesOf = r => r.problems.map(p => p.code);
const msgOf = (r, code) => r.problems.find(p => p.code === code)?.message || "";

const CLEAN = {
  days: [
    day("Day 1 — Thursday, August 13, 2026", [act("08:00", "Patapsco Valley State Park"), act("14:30", "Station North Street Art Walk")]),
    day("Day 2 — Friday, August 14, 2026",   [act("09:00", "Peabody Library"), act("16:30", "Federal Hill Park")]),
  ],
};

describe("checkPlan", () => {
  it("says nothing about a clean plan", () => {
    expect(checkPlan(CLEAN, 2).problems).toEqual([]);
  });

  it("handles an empty or missing model without throwing", () => {
    expect(checkPlan(null).problems).toEqual([]);
    expect(checkPlan({}).problems).toEqual([]);
    expect(checkPlan({ days: [] }, 7).problems).toEqual([]);
  });

  describe("short plans (#14 — the defect that shipped silently)", () => {
    it("reports a plan shorter than the trip", () => {
      const r = checkPlan(CLEAN, 7);
      expect(codesOf(r)).toContain("incomplete");
      expect(msgOf(r, "incomplete")).toBe("This plan covers 2 days, but your trip is 7 days long. The last 5 days are missing.");
    });

    it("uses singular wording when exactly one day is missing", () => {
      expect(msgOf(checkPlan(CLEAN, 3), "incomplete")).toContain("The last day is missing.");
    });

    it("stays quiet when the plan is complete or longer", () => {
      expect(codesOf(checkPlan(CLEAN, 2))).not.toContain("incomplete");
      expect(codesOf(checkPlan(CLEAN, 1))).not.toContain("incomplete");
    });

    it("skips the day count when the trip length is unknown", () => {
      // day/combo/hidden modes aren't day-counted, and a restored plan may not
      // know its trip length — never guess a defect from missing input.
      for (const n of [null, undefined, 0, -1, "7", NaN]) {
        expect(codesOf(checkPlan(CLEAN, n)), `expectedDays=${String(n)}`).not.toContain("incomplete");
      }
    });
  });

  describe("repeated venues (#13 — the Checkerspot defect)", () => {
    it("names the venue scheduled twice", () => {
      const dupe = { days: [
        day("Day 1 — Thursday", [act("19:00", "Checkerspot Brewing Company")]),
        day("Day 5 — Monday",   [act("19:00", "Checkerspot Brewing Company")]),
      ]};
      const r = checkPlan(dupe, 5);
      expect(codesOf(r)).toContain("duplicate-venue");
      expect(msgOf(r, "duplicate-venue")).toBe("Checkerspot Brewing Company is scheduled twice.");
    });

    it("counts three or more", () => {
      const thrice = { days: [1, 2, 3].map(n => day(`Day ${n}`, [act("19:00", "Artifact Coffee")])) };
      expect(msgOf(checkPlan(thrice, 3), "duplicate-venue")).toBe("Artifact Coffee is scheduled 3 times.");
    });

    it("matches case-insensitively and ignores bold markers, but reports the readable name", () => {
      const dupe = { days: [
        day("Day 1", [act("19:00", "**Heavy Seas Alehouse**")]),
        day("Day 2", [act("19:00", "heavy seas alehouse")]),
      ]};
      expect(msgOf(checkPlan(dupe, 2), "duplicate-venue")).toBe("Heavy Seas Alehouse is scheduled twice.");
    });

    it("does not flag distinct venues or blank titles", () => {
      const ok = { days: [day("Day 1", [act("09:00", "Fort McHenry"), act("12:00", "Lexington Market"), act("15:00", "")])] };
      expect(codesOf(checkPlan(ok, 1))).not.toContain("duplicate-venue");
    });
  });

  describe("day integrity", () => {
    it("flags a day header with nothing under it", () => {
      const hollow = { days: [day("Day 1 — Thursday", []), day("Day 2 — Friday", [act("09:00", "Peabody Library")])] };
      const r = checkPlan(hollow, 2);
      expect(codesOf(r)).toContain("empty-day");
      expect(msgOf(r, "empty-day")).toBe("Day 1 has no activities yet.");
    });

    it("flags times running backwards, naming the day", () => {
      const jumbled = { days: [day("Day 3 — Saturday, August 15, 2026", [act("14:00", "Historic Ships"), act("11:00", "Fells Point")])] };
      const r = checkPlan(jumbled, 1);
      expect(codesOf(r)).toContain("times-out-of-order");
      expect(msgOf(r, "times-out-of-order")).toBe("Day 3 has activities listed out of order.");
    });

    it("falls back to position when the label has no day number", () => {
      const odd = { days: [day("The Ideal Day", [act("14:00", "A"), act("11:00", "B")])] };
      expect(msgOf(checkPlan(odd, 1), "times-out-of-order")).toBe("Day 1 has activities listed out of order.");
    });

    it("ignores unparseable times rather than inventing disorder", () => {
      const partial = { days: [day("Day 1", [act("09:00", "A"), act("", "B"), act("11:00", "C")])] };
      expect(codesOf(checkPlan(partial, 1))).not.toContain("times-out-of-order");
    });
  });

  it("stays out of taste — no filler, pace or rhythm complaints reach the traveler", () => {
    // scorePlan grades these; checkPlan deliberately does not. A warning the
    // user learns to ignore devalues the ones that matter.
    const fillerish = { days: [day("Day 1", [
      act("09:00", "lunch", "soak in the vibrant atmosphere of this hidden gem"),
      act("10:00", "free time"), act("11:00", "explore"), act("12:00", "wander"),
      act("13:00", "downtown"), act("14:00", "relax"),
    ], [])] };
    expect(checkPlan(fillerish, 1).problems).toEqual([]);
  });

  it("reports every distinct problem at once", () => {
    const bad = { days: [
      day("Day 1 — Thursday", [act("19:00", "Checkerspot Brewing Company")]),
      day("Day 2 — Friday", []),
      day("Day 3 — Saturday", [act("14:00", "Historic Ships"), act("11:00", "Checkerspot Brewing Company")]),
    ]};
    const codes = codesOf(checkPlan(bad, 7));
    expect(codes).toContain("incomplete");
    expect(codes).toContain("empty-day");
    expect(codes).toContain("duplicate-venue");
    expect(codes).toContain("times-out-of-order");
  });
});
