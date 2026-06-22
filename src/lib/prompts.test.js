import { describe, it, expect } from "vitest";
import {
  buildTripPrompt,
  buildTripCategoriesPrompt,
  buildTripMetaPrompt,
  buildPlanPrompt,
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
  interests: { chips: ["Street food & markets", "Photography"], text: "love record shops", avoidChips: [] },
  notes: "Want to catch a baseball game",
};

const BASE_TRIP = {
  destination: "Tokyo, Japan",
  nights: 6,
  season: "Hot and humid — pack light, expect rain",
  categories: {
    breakfast: [{ name: "Ichiran Ramen", description: "Solo booth ramen", mustOrder: "tonkotsu", price: "¥1200" }],
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
    expect(messageContent).toContain('"breakfast"');
    expect(messageContent).not.toContain('"photoSpots"');
    expect(messageContent).not.toContain('"practical"');
  });

  it("meta half asks for meta sections but not the category list", () => {
    const { messageContent } = buildTripMetaPrompt(BASE_ANSWERS, []);
    expect(messageContent).toContain('"practical"');
    expect(messageContent).toContain('"photoSpots"');
    expect(messageContent).toContain('"avoidList"');
    expect(messageContent).not.toContain('"breakfast"');
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
    for (const mode of ["full", "day", "combo", "foodie", "hidden"]) {
      const result = buildPlanPrompt(mode, BASE_TRIP);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(100);
    }
  });

  it("each mode produces different output", () => {
    const outputs = ["full", "day", "combo", "foodie", "hidden"].map(m => buildPlanPrompt(m, BASE_TRIP));
    const unique = new Set(outputs);
    expect(unique.size).toBe(5);
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

  it("includes restaurant ideas from trip.categories", () => {
    const result = buildPlanPrompt("foodie", BASE_TRIP);
    expect(result).toContain("Ichiran Ramen");
  });

  it("falls back gracefully when categories is empty", () => {
    const emptyTrip = { ...BASE_TRIP, categories: {} };
    const result = buildPlanPrompt("full", emptyTrip);
    expect(result).toContain("Use your knowledge of");
  });

  it("includes TABLE/ENDTABLE and FOOD/ENDFOOD markers in format instructions", () => {
    const result = buildPlanPrompt("full", BASE_TRIP);
    expect(result).toContain("TABLE:");
    expect(result).toContain("ENDTABLE");
    expect(result).toContain("FOOD:");
    expect(result).toContain("ENDFOOD");
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
