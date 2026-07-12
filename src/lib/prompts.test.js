import { describe, it, expect } from "vitest";
import {
  buildTripPrompt,
  buildTripCategoriesPrompt,
  buildTripMetaPrompt,
  buildPlanPrompt,
  buildEditDayPrompt,
  buildTweakActivityPrompt,
} from "./prompts.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_ANSWERS = {
  destination: "Tokyo, Japan",
  dates: { start: "2024-07-01", end: "2024-07-07" },
  party: ["Solo"],
  budget: 120,
  logistics: {
    stay: "Hotel in Shinjuku",
    transport: { chips: ["Public transit"], text: "" },
  },
  interests: { chips: ["Architecture", "Photography"], text: "love record shops", avoidChips: [] },
  notes: "Want to catch a baseball game",
};

const BASE_TRIP = {
  destination: "Tokyo, Japan",
  nights: 6,
  season: "Hot and humid — pack light, expect rain",
  categories: {
    culture: [{ name: "Senso-ji", description: "Ancient Buddhist temple in Asakusa", duration: "1–2 hours", proTip: "Go early" }],
    exploration: [{ name: "Shimokitazawa", description: "Indie neighbourhood for records and vintage", proTip: "Weekday morning is quietest" }],
  },
  answers: BASE_ANSWERS,
};

// ── buildTripPrompt ───────────────────────────────────────────────────────────

describe("buildTripPrompt", () => {
  it("returns expected shape", () => {
    const result = buildTripPrompt(BASE_ANSWERS, []);
    expect(result).toHaveProperty("messageContent");
    expect(result).toHaveProperty("n");
    expect(result).toHaveProperty("safeStart");
    expect(result).toHaveProperty("safeEnd");
  });

  it("calculates nights correctly", () => {
    const { n } = buildTripPrompt(BASE_ANSWERS, []);
    expect(n).toBe(6);
  });

  it("messageContent is a string when no files uploaded", () => {
    const { messageContent } = buildTripPrompt(BASE_ANSWERS, []);
    expect(typeof messageContent).toBe("string");
  });

  it("messageContent is an array when images are uploaded", () => {
    const files = [{ isImage: true, type: "image/jpeg", content: "base64data" }];
    const { messageContent } = buildTripPrompt(BASE_ANSWERS, files);
    expect(Array.isArray(messageContent)).toBe(true);
    expect(messageContent[0].type).toBe("image");
    expect(messageContent[messageContent.length - 1].type).toBe("text");
  });

  it("includes destination in prompt", () => {
    const { messageContent } = buildTripPrompt(BASE_ANSWERS, []);
    expect(messageContent).toContain("Tokyo, Japan");
  });

  it("uses budget line for paid stay", () => {
    const { messageContent } = buildTripPrompt(BASE_ANSWERS, []);
    expect(messageContent).toContain("120");
  });

  it("uses hosted line when budget is 0", () => {
    const hostedAnswers = { ...BASE_ANSWERS, budget: 0 };
    const { messageContent } = buildTripPrompt(hostedAnswers, []);
    expect(messageContent).toContain("family/friends");
    expect(messageContent).not.toContain("USD 0/day");
  });

  it("includes stay and transport info", () => {
    const { messageContent } = buildTripPrompt(BASE_ANSWERS, []);
    expect(messageContent).toContain("Hotel in Shinjuku");
    expect(messageContent).toContain("Public transit");
  });

  it("includes notes in prompt", () => {
    const { messageContent } = buildTripPrompt(BASE_ANSWERS, []);
    expect(messageContent).toContain("baseball game");
  });

  it("includes uploaded text file context", () => {
    const files = [{ isImage: false, name: "bookings.txt", content: "Flight: JL412" }];
    const { messageContent } = buildTripPrompt(BASE_ANSWERS, files);
    expect(messageContent).toContain("Flight: JL412");
    expect(messageContent).toContain("bookings.txt");
  });

  it("includes avoidChips from interests", () => {
    const answers = { ...BASE_ANSWERS, interests: { ...BASE_ANSWERS.interests, avoidChips: ["Skip museums"] } };
    const { messageContent } = buildTripPrompt(answers, []);
    expect(messageContent).toContain("Skip museums");
  });

  it("uses fallback nights when dates are missing", () => {
    const noDateAnswers = { ...BASE_ANSWERS, dates: {} };
    const { n } = buildTripPrompt(noDateAnswers, []);
    expect(n).toBe(5); // calcNights default
  });
});

// ── Split build (parallel halves) ───────────────────────────────────────────────

describe("split trip build", () => {
  it("categories half asks for categories but not the meta sections", () => {
    const { messageContent } = buildTripCategoriesPrompt(BASE_ANSWERS, []);
    expect(messageContent).toContain('"categories"');
    expect(messageContent).toContain('"nature"');
    expect(messageContent).not.toContain('"photoSpots"');
    expect(messageContent).not.toContain('"practical"');
  });

  it("categories half never asks for food categories", () => {
    const { messageContent } = buildTripCategoriesPrompt(BASE_ANSWERS, []);
    expect(messageContent).not.toContain('"breakfast"');
    expect(messageContent).not.toContain('"lunch"');
    expect(messageContent).not.toContain('"dinner"');
  });

  it("meta half asks for the header sections but not the category list", () => {
    const { messageContent } = buildTripMetaPrompt(BASE_ANSWERS, []);
    expect(messageContent).toContain('"destination"');
    expect(messageContent).toContain('"highlights"');
    expect(messageContent).not.toContain('"breakfast"');
    // practical/photoSpots/avoidList were dropped when Activities + Tips were removed
    expect(messageContent).not.toContain('"photoSpots"');
    expect(messageContent).not.toContain('"practical"');
  });

  it("both halves carry the same shared trip context", () => {
    const cats = buildTripCategoriesPrompt(BASE_ANSWERS, []).messageContent;
    const meta = buildTripMetaPrompt(BASE_ANSWERS, []).messageContent;
    for (const part of [cats, meta]) {
      expect(part).toContain("Tokyo, Japan");
      expect(part).toContain("Hotel in Shinjuku");
    }
  });

  it("both halves preserve image blocks when files are uploaded", () => {
    const files = [{ isImage: true, type: "image/jpeg", content: "base64data" }];
    for (const build of [buildTripCategoriesPrompt, buildTripMetaPrompt]) {
      const { messageContent } = build(BASE_ANSWERS, files);
      expect(Array.isArray(messageContent)).toBe(true);
      expect(messageContent[0].type).toBe("image");
    }
  });
});

// ── buildPlanPrompt ───────────────────────────────────────────────────────────

describe("buildPlanPrompt", () => {
  it("returns a non-empty string for every mode", () => {
    for (const mode of ["full", "day", "combo", "hidden"]) {
      const result = buildPlanPrompt(mode, BASE_TRIP);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(100);
    }
  });

  it("each mode produces different output", () => {
    const outputs = ["full", "day", "combo", "hidden"].map(m => buildPlanPrompt(m, BASE_TRIP));
    const unique = new Set(outputs);
    expect(unique.size).toBe(4);
  });

  it("includes destination and season", () => {
    const result = buildPlanPrompt("full", BASE_TRIP);
    expect(result).toContain("Tokyo, Japan");
    expect(result).toContain("Hot and humid");
  });

  it("full mode references trip.nights in instructions", () => {
    const result = buildPlanPrompt("full", BASE_TRIP);
    expect(result).toContain("6-night");
  });

  it("includes activity items from trip.categories", () => {
    const result = buildPlanPrompt("day", BASE_TRIP);
    expect(result).toContain("Senso-ji");
    expect(result).toContain("Shimokitazawa");
  });

  it("falls back gracefully when categories is empty", () => {
    const emptyTrip = { ...BASE_TRIP, categories: {} };
    const result = buildPlanPrompt("full", emptyTrip);
    expect(result).toContain("Use your knowledge of");
  });

  it("includes TABLE/ENDTABLE markers but never emits food markers", () => {
    const result = buildPlanPrompt("full", BASE_TRIP);
    expect(result).toContain("TABLE:");
    expect(result).toContain("ENDTABLE");
    expect(result).not.toContain("FOOD:");
    expect(result).not.toContain("ENDFOOD");
    expect(result).not.toMatch(/restaurant/i);
  });

  it("includes traveler logistics", () => {
    const result = buildPlanPrompt("full", BASE_TRIP);
    expect(result).toContain("Hotel in Shinjuku");
    expect(result).toContain("Public transit");
  });

  it("shows hosted label when budget is 0", () => {
    const hostedTrip = { ...BASE_TRIP, answers: { ...BASE_ANSWERS, budget: 0 } };
    const result = buildPlanPrompt("full", hostedTrip);
    expect(result).toContain("family/friends");
  });

  it("includes avoidChips from interests in the Avoid line", () => {
    const avoidAnswers = {
      ...BASE_ANSWERS,
      interests: { ...BASE_ANSWERS.interests, avoidChips: ["Skip museums", "Skip nightlife"] },
    };
    const avoidTrip = { ...BASE_TRIP, answers: avoidAnswers };
    const result = buildPlanPrompt("full", avoidTrip);
    expect(result).toContain("Skip museums");
    expect(result).toContain("Skip nightlife");
    expect(result).not.toContain("Avoid: nothing");
  });

  it("shows 'nothing' when no avoidChips set", () => {
    const result = buildPlanPrompt("full", BASE_TRIP); // BASE_ANSWERS has avoidChips: []
    expect(result).toContain("Avoid: nothing");
  });

  it("hidden mode does not include full itinerary structure", () => {
    const full = buildPlanPrompt("full", BASE_TRIP);
    const hidden = buildPlanPrompt("hidden", BASE_TRIP);
    expect(hidden).not.toContain("night itinerary");
    expect(full).toContain("night itinerary");
  });
});

// ── Activity priority ranking ───────────────────────────────────────────────────

describe("buildPlanPrompt — activity priority", () => {
  const PRIORITY_TRIP = {
    ...BASE_TRIP,
    categories: {
      culture: [
        { name: "Optional Gallery", description: "Minor gallery", priority: "optional" },
        { name: "Senso-ji", description: "Ancient temple", priority: "essential" },
        { name: "Mid Museum", description: "Decent museum", priority: "recommended" },
      ],
    },
  };

  it("tags each activity with its priority tier", () => {
    const result = buildPlanPrompt("full", PRIORITY_TRIP);
    expect(result).toContain("· ESSENTIAL]");
    expect(result).toContain("· RECOMMENDED]");
    expect(result).toContain("· OPTIONAL]");
  });

  it("lists activities essentials-first regardless of source order", () => {
    const result = buildPlanPrompt("full", PRIORITY_TRIP);
    const essIdx = result.indexOf("Senso-ji");
    const recIdx = result.indexOf("Mid Museum");
    const optIdx = result.indexOf("Optional Gallery");
    expect(essIdx).toBeLessThan(recIdx);
    expect(recIdx).toBeLessThan(optIdx);
  });

  it("includes the PRIORITY scheduling instruction", () => {
    const result = buildPlanPrompt("full", PRIORITY_TRIP);
    expect(result).toContain("PRIORITY:");
    expect(result).toContain("Never drop an essential");
  });

  it("excludes legacy breakfast/lunch/dinner categories from a resumed old trip", () => {
    const legacyTrip = {
      ...BASE_TRIP,
      categories: {
        ...BASE_TRIP.categories,
        breakfast: [{ name: "Ichiran Ramen", description: "Solo booth ramen", priority: "essential" }],
      },
    };
    const result = buildPlanPrompt("full", legacyTrip);
    expect(result).not.toContain("Ichiran Ramen");
    expect(result).not.toContain("[BREAKFAST");
  });

  it("defaults missing priority to RECOMMENDED (legacy trips)", () => {
    // BASE_TRIP categories carry no priority field
    const result = buildPlanPrompt("full", BASE_TRIP);
    expect(result).toContain("· RECOMMENDED]");
    expect(result).not.toContain("· ESSENTIAL]");
  });

  it("edit-day prompt also surfaces priority tags and rule", () => {
    const result = buildEditDayPrompt(
      "Monday, July 1, 2024",
      "## Monday\nsome content",
      "make it more relaxed",
      PRIORITY_TRIP,
    );
    expect(result).toContain("· ESSENTIAL]");
    expect(result).toContain("PRIORITY:");
  });
});

// ── Avoid wiring ────────────────────────────────────────────────────────────────

describe("avoid wiring", () => {
  it("free-text avoid populates the AVOID line in the trip build", () => {
    const answers = { ...BASE_ANSWERS, avoid: "seafood, crowds" };
    const { messageContent } = buildTripPrompt(answers, []);
    expect(messageContent).toContain("seafood, crowds");
    expect(messageContent).not.toContain("related to: nothing");
  });

  it("free-text avoid reaches both plan and edit-day prompts", () => {
    const trip = { ...BASE_TRIP, answers: { ...BASE_ANSWERS, avoid: "long hikes" } };
    const plan = buildPlanPrompt("full", trip);
    const day  = buildEditDayPrompt("Mon", "## Mon\nx", "tweak", trip);
    expect(plan).toContain("long hikes");
    expect(day).toContain("long hikes");
  });

  it("combines free-text avoid with legacy avoidChips", () => {
    const answers = {
      ...BASE_ANSWERS,
      avoid: "seafood",
      interests: { ...BASE_ANSWERS.interests, avoidChips: ["Skip museums"] },
    };
    const { messageContent } = buildTripPrompt(answers, []);
    expect(messageContent).toContain("Skip museums");
    expect(messageContent).toContain("seafood");
  });

  it("falls back to 'nothing' when no avoid is set", () => {
    const { messageContent } = buildTripPrompt(BASE_ANSWERS, []); // no avoid, empty avoidChips
    expect(messageContent).toContain("related to: nothing");
  });

  it("ignores empty/whitespace avoid text", () => {
    const answers = { ...BASE_ANSWERS, avoid: "   " };
    const result = buildPlanPrompt("full", { ...BASE_TRIP, answers });
    expect(result).toContain("Avoid: nothing");
  });
});

describe("buildTweakActivityPrompt", () => {
  const activity = { time: "1:00 PM", title: "**Sao Jorge Castle**", details: "Hilltop fortress, steep climb" };

  it("includes the change request, the current activity, and a single TABLE block", () => {
    const p = buildTweakActivityPrompt(BASE_TRIP, "Day 1 — Mon", activity, "make it more relaxed");
    expect(p).toContain("make it more relaxed");
    expect(p).toContain("Sao Jorge Castle");
    expect(p).toContain("1:00 PM");
    expect(p).toContain("TABLE:");
    expect(p).toContain("ENDTABLE");
  });

  it("carries traveler context (budget + avoid) into the scoped edit", () => {
    const trip = { ...BASE_TRIP, answers: { ...BASE_ANSWERS, avoid: "long queues" } };
    const p = buildTweakActivityPrompt(trip, "Day 1 — Mon", activity, "cheaper option");
    expect(p).toContain("long queues");
    expect(p).toContain("120");
  });
});

// ── No food, full stop ──────────────────────────────────────────────────────────
describe("food removed from the pipeline", () => {
  it("buildPlanPrompt never emits food markers or restaurant language, in any mode", () => {
    for (const mode of ["full", "day", "combo", "hidden"]) {
      const p = buildPlanPrompt(mode, BASE_TRIP);
      expect(p).not.toContain("FOOD:");
      expect(p).not.toContain("ENDFOOD");
      expect(p).not.toMatch(/restaurant/i);
      expect(p).not.toMatch(/\bdining\b/i);
    }
  });

  it("buildEditDayPrompt never emits food markers or restaurant language", () => {
    const p = buildEditDayPrompt("Day 1 — Mon", "## Day 1 — Mon", "refresh", BASE_TRIP);
    expect(p).not.toContain("FOOD:");
    expect(p).not.toContain("ENDFOOD");
    expect(p).not.toMatch(/restaurant/i);
    expect(p).toContain("TABLE:"); // activities still present
  });

  it("buildTripCategoriesPrompt never asks for meal categories", () => {
    const { messageContent } = buildTripCategoriesPrompt(BASE_ANSWERS, []);
    for (const bin of ["breakfast", "lunch", "dinner"]) {
      expect(messageContent).not.toContain(`"${bin}"`);
    }
  });
});
