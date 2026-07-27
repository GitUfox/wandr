import { describe, it, expect } from "vitest";
import { scorePlan, namesAPlace, countFiller, paceBand } from "./planQuality.js";
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
