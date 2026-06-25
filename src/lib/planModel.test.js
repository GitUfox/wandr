import { describe, it, expect } from "vitest";
import { parsePlan, serializePlan, activityCount } from "./planModel.js";

// A representative 2-day full itinerary in the exact marker format the
// generation prompt produces (see prompts.js buildPlanPrompt).
const TWO_DAY = `## Day 1 — Wednesday, June 11, 2025

TABLE:
| Time | Activity | Details |
|------|----------|----------|
| 9:00 AM | **Alfama walk** | Historic quarter, 2 hrs, free |
| 12:30 PM | **Castelo de São Jorge** | Hilltop fortress, €15, 1.5 hrs |
ENDTABLE

FOOD:
| Meal | Name | Order | Price |
|------|------|-------|-------|
| Breakfast | **Manteigaria** | pastel de nata | €1.20 |
| Lunch | **Time Out Market** | varied stalls | €€ |
| Dinner | **Ramiro** | garlic prawns | €€€ |
ENDFOOD

TIPS: Buy the Lisboa Card | Trams fill up by 10am

## Day 2 — Thursday, June 12, 2025

TABLE:
| Time | Activity | Details |
|------|----------|----------|
| 10:00 AM | **Belém Tower** | UNESCO site, €8 |
ENDTABLE

FOOD:
| Meal | Name | Order | Price |
|------|------|-------|-------|
| Lunch | **Pastéis de Belém** | the original | € |
ENDFOOD

TIPS: Take tram 15 west | Go early to beat queues
`;

/** Strip volatile ids so two models can be compared structurally. */
function stripIds(model) {
  return {
    ...model,
    days: model.days.map(d => ({
      ...d,
      activities: d.activities.map(({ id, ...rest }) => rest),
    })),
  };
}

describe("parsePlan", () => {
  it("parses every day, activity, food row, and tip", () => {
    const m = parsePlan(TWO_DAY);
    expect(m.days).toHaveLength(2);

    const d1 = m.days[0];
    expect(d1.label).toBe("Day 1 — Wednesday, June 11, 2025");
    expect(d1.activities).toHaveLength(2);
    expect(d1.activities[0]).toMatchObject({
      time: "9:00 AM",
      title: "**Alfama walk**",
      details: "Historic quarter, 2 hrs, free",
    });
    expect(d1.food).toHaveLength(3);
    expect(d1.food[2]).toMatchObject({ meal: "Dinner", name: "**Ramiro**", order: "garlic prawns", price: "€€€" });
    expect(d1.tips).toEqual(["Buy the Lisboa Card", "Trams fill up by 10am"]);

    expect(m.days[1].activities).toHaveLength(1);
    expect(m.days[1].food).toHaveLength(1);
  });

  it("assigns a unique id to every activity", () => {
    const m = parsePlan(TWO_DAY);
    const ids = m.days.flatMap(d => d.activities.map(a => a.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(Boolean)).toBe(true);
  });

  it("counts activities across all days", () => {
    expect(activityCount(parsePlan(TWO_DAY))).toBe(3);
  });

  it("returns an empty model for empty/blank input", () => {
    expect(parsePlan("")).toEqual({ intro: "", days: [] });
    expect(parsePlan("   \n  ")).toEqual({ intro: "", days: [] });
  });
});

describe("round-trip stability (the core invariant)", () => {
  it("parse → serialize → parse yields an identical model", () => {
    const once = parsePlan(TWO_DAY);
    const twice = parsePlan(serializePlan(once));
    expect(stripIds(twice)).toEqual(stripIds(once));
  });

  it("serialized output re-parses to the same day/activity counts", () => {
    const m = parsePlan(TWO_DAY);
    const round = parsePlan(serializePlan(m));
    expect(round.days).toHaveLength(m.days.length);
    expect(activityCount(round)).toBe(activityCount(m));
  });

  it("survives a mutation: moving an activity between days round-trips cleanly", () => {
    const m = parsePlan(TWO_DAY);
    // Move Day 1's second activity to Day 2 (the headline edit Kraig wants).
    const moved = m.days[0].activities.pop();
    m.days[1].activities.push(moved);

    const round = parsePlan(serializePlan(m));
    expect(round.days[0].activities).toHaveLength(1);
    expect(round.days[1].activities).toHaveLength(2);
    expect(round.days[1].activities[1].title).toBe("**Castelo de São Jorge**");
  });

  it("survives a mutation: deleting an activity round-trips cleanly", () => {
    const m = parsePlan(TWO_DAY);
    m.days[0].activities.splice(0, 1);
    const round = parsePlan(serializePlan(m));
    expect(round.days[0].activities).toHaveLength(1);
    expect(round.days[0].activities[0].title).toBe("**Castelo de São Jorge**");
  });

  it("survives a mutation: editing a time round-trips cleanly", () => {
    const m = parsePlan(TWO_DAY);
    m.days[0].activities[0].time = "8:15 AM";
    const round = parsePlan(serializePlan(m));
    expect(round.days[0].activities[0].time).toBe("8:15 AM");
  });
});

describe("fidelity edge cases", () => {
  it("preserves intro text before the first day header", () => {
    const withIntro = `Three days in Lisbon, built around slow mornings.\n\n${TWO_DAY}`;
    const m = parsePlan(withIntro);
    expect(m.intro).toBe("Three days in Lisbon, built around slow mornings.");
    expect(parsePlan(serializePlan(m)).intro).toBe(m.intro);
  });

  it("handles a day with no food or tips", () => {
    const bare = `## Day 1 — Monday\n\nTABLE:\n| Time | Activity | Details |\n|------|----------|----------|\n| 9:00 | **Park** | walk |\nENDTABLE\n`;
    const m = parsePlan(bare);
    expect(m.days[0].food).toEqual([]);
    expect(m.days[0].tips).toEqual([]);
    expect(parsePlan(serializePlan(m)).days[0].activities).toHaveLength(1);
  });

  it("preserves unrecognised content inside a day via extras", () => {
    const withExtra = `## Day 1 — Monday\n\n### A note about transit\n\nTABLE:\n| Time | Activity | Details |\n|------|----------|----------|\n| 9:00 | **Park** | walk |\nENDTABLE\n`;
    const m = parsePlan(withExtra);
    expect(m.days[0].extras).toContain("### A note about transit");
    expect(parsePlan(serializePlan(m)).days[0].extras).toEqual(m.days[0].extras);
  });

  it("collapses an overflowing Details column instead of dropping cells", () => {
    const overflow = `## Day 1 — Monday\n\nTABLE:\n| Time | Activity | Details |\n|------|----------|----------|\n| 9:00 | **Market** | open-air | extra stalls |\nENDTABLE\n`;
    const m = parsePlan(overflow);
    expect(m.days[0].activities[0].details).toBe("open-air extra stalls");
  });
});
