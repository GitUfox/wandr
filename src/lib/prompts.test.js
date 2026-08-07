import { describe, it, expect } from "vitest";
import {
  buildTripCategoriesPrompt,
  buildPlanPrompt,
  buildEditDayPrompt,
  buildTweakActivityPrompt,
  buildEventsBlock,
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

// ── buildTripCategoriesPrompt (THE trip-build call) ───────────────────────────

describe("buildTripCategoriesPrompt", () => {
  it("returns expected shape", () => {
    const result = buildTripCategoriesPrompt(BASE_ANSWERS, []);
    expect(result).toHaveProperty("messageContent");
    expect(result).toHaveProperty("n");
    expect(result).toHaveProperty("safeStart");
    expect(result).toHaveProperty("safeEnd");
  });

  it("calculates nights correctly", () => {
    const { n } = buildTripCategoriesPrompt(BASE_ANSWERS, []);
    expect(n).toBe(6);
  });

  it("messageContent is a string when no files uploaded", () => {
    const { messageContent } = buildTripCategoriesPrompt(BASE_ANSWERS, []);
    expect(typeof messageContent).toBe("string");
  });

  it("messageContent is an array when images are uploaded", () => {
    const files = [{ isImage: true, type: "image/jpeg", content: "base64data" }];
    const { messageContent } = buildTripCategoriesPrompt(BASE_ANSWERS, files);
    expect(Array.isArray(messageContent)).toBe(true);
    expect(messageContent[0].type).toBe("image");
    expect(messageContent[messageContent.length - 1].type).toBe("text");
  });

  it("includes destination in prompt", () => {
    const { messageContent } = buildTripCategoriesPrompt(BASE_ANSWERS, []);
    expect(messageContent).toContain("Tokyo, Japan");
  });

  it("uses budget line for paid stay", () => {
    const { messageContent } = buildTripCategoriesPrompt(BASE_ANSWERS, []);
    expect(messageContent).toContain("120");
  });

  it("uses hosted line when budget is 0", () => {
    const hostedAnswers = { ...BASE_ANSWERS, budget: 0 };
    const { messageContent } = buildTripCategoriesPrompt(hostedAnswers, []);
    expect(messageContent).toContain("family/friends");
    expect(messageContent).not.toContain("USD 0/day");
  });

  it("includes stay and transport info", () => {
    const { messageContent } = buildTripCategoriesPrompt(BASE_ANSWERS, []);
    expect(messageContent).toContain("Hotel in Shinjuku");
    expect(messageContent).toContain("Public transit");
  });

  it("includes notes in prompt", () => {
    const { messageContent } = buildTripCategoriesPrompt(BASE_ANSWERS, []);
    expect(messageContent).toContain("baseball game");
  });

  it("includes uploaded text file context", () => {
    const files = [{ isImage: false, name: "bookings.txt", content: "Flight: JL412" }];
    const { messageContent } = buildTripCategoriesPrompt(BASE_ANSWERS, files);
    expect(messageContent).toContain("Flight: JL412");
    expect(messageContent).toContain("bookings.txt");
  });

  it("includes avoidChips from interests", () => {
    const answers = { ...BASE_ANSWERS, interests: { ...BASE_ANSWERS.interests, avoidChips: ["Skip museums"] } };
    const { messageContent } = buildTripCategoriesPrompt(answers, []);
    expect(messageContent).toContain("Skip museums");
  });

  it("uses fallback nights when dates are missing", () => {
    const noDateAnswers = { ...BASE_ANSWERS, dates: {} };
    const { n } = buildTripCategoriesPrompt(noDateAnswers, []);
    expect(n).toBe(5); // calcNights default
  });
});

// ── Trip-build schema (slim, single call — 2026-08-05 speed pass) ─────────────

describe("trip build schema", () => {
  it("asks for categories but none of the old meta sections", () => {
    const { messageContent } = buildTripCategoriesPrompt(BASE_ANSWERS, []);
    expect(messageContent).toContain('"categories"');
    expect(messageContent).toContain('"nature"');
    expect(messageContent).not.toContain('"photoSpots"');
    expect(messageContent).not.toContain('"practical"');
    // the meta half is dead — its fields must never creep back into the ask
    expect(messageContent).not.toContain('"tagline"');
    expect(messageContent).not.toContain('"highlights"');
    expect(messageContent).not.toContain('"season"');
  });

  it("never asks for food categories", () => {
    const { messageContent } = buildTripCategoriesPrompt(BASE_ANSWERS, []);
    expect(messageContent).not.toContain('"breakfast"');
    expect(messageContent).not.toContain('"lunch"');
    expect(messageContent).not.toContain('"dinner"');
  });

  it("asks only for the fields the prompts and grounding actually read", () => {
    const { messageContent } = buildTripCategoriesPrompt(BASE_ANSWERS, []);
    for (const kept of ['"name"', '"description"', '"proTip"', '"priority"']) {
      expect(messageContent).toContain(kept);
    }
    // Paid-for output nothing consumed — cut in the speed pass. If one of
    // these gains a real consumer, add it back WITH the consumer.
    for (const cut of ['"duration"', '"difficulty"', '"admission"', '"bestTime"', '"price"', '"bookAhead"', '"vibe"']) {
      expect(messageContent).not.toContain(cut);
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
    const { messageContent } = buildTripCategoriesPrompt(answers, []);
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
    const { messageContent } = buildTripCategoriesPrompt(answers, []);
    expect(messageContent).toContain("Skip museums");
    expect(messageContent).toContain("seafood");
  });

  it("falls back to 'nothing' when no avoid is set", () => {
    const { messageContent } = buildTripCategoriesPrompt(BASE_ANSWERS, []); // no avoid, empty avoidChips
    expect(messageContent).toContain("related to: nothing");
  });

  it("ignores empty/whitespace avoid text", () => {
    const answers = { ...BASE_ANSWERS, avoid: "   " };
    const result = buildPlanPrompt("full", { ...BASE_TRIP, answers });
    expect(result).toContain("Avoid: nothing");
  });
});

// ── Rhythm wiring (early riser / night owl) ─────────────────────────────────────
describe("rhythm wiring", () => {
  const earlyAnswers = { ...BASE_ANSWERS, logistics: { ...BASE_ANSWERS.logistics, rhythm: "Early riser" } };

  it("early riser reaches the trip build prompt", () => {
    const { messageContent } = buildTripCategoriesPrompt(earlyAnswers, []);
    expect(messageContent).toContain("RHYTHM:");
    expect(messageContent).toContain("early riser");
  });

  it("early riser reaches both plan and edit-day prompts", () => {
    const trip = { ...BASE_TRIP, answers: earlyAnswers };
    expect(buildPlanPrompt("full", trip)).toContain("early riser");
    expect(buildEditDayPrompt("Mon", "## Mon\nx", "tweak", trip)).toContain("early riser");
  });

  it("night owl produces its own distinct instruction", () => {
    const owl = { ...BASE_TRIP, answers: { ...BASE_ANSWERS, logistics: { ...BASE_ANSWERS.logistics, rhythm: "Night owl" } } };
    expect(buildPlanPrompt("full", owl)).toContain("night owl");
  });

  it("Flexible injects no behavioural rhythm instruction", () => {
    const flex = { ...BASE_TRIP, answers: { ...BASE_ANSWERS, logistics: { ...BASE_ANSWERS.logistics, rhythm: "Flexible" } } };
    // Shows in the traveler summary as context ("- Rhythm: Flexible") but the
    // uppercase RHYTHM: instruction label is only emitted for a real instruction.
    expect(buildPlanPrompt("full", flex)).not.toContain("RHYTHM:");
  });

  it("absent rhythm leaks nothing (backward compatible with older trips)", () => {
    const { messageContent } = buildTripCategoriesPrompt(BASE_ANSWERS, []); // no rhythm field
    expect(messageContent).not.toContain("RHYTHM:");
    expect(messageContent).not.toContain("- Rhythm:");
  });
});

// ── Priority interests (star-to-prioritize / conflict resolution) ───────────────
describe("priority interests", () => {
  const prioAnswers = {
    ...BASE_ANSWERS,
    interests: { ...BASE_ANSWERS.interests, priorityChips: ["Architecture"] },
  };

  it("surfaces a PRIORITY INTERESTS line with the starred value in the trip build", () => {
    const { messageContent } = buildTripCategoriesPrompt(prioAnswers, []);
    expect(messageContent).toContain("PRIORITY INTERESTS");
    expect(messageContent).toMatch(/PRIORITY INTERESTS.*Architecture/);
  });

  it("includes the CONFLICTS tie-break instruction", () => {
    const { messageContent } = buildTripCategoriesPrompt(prioAnswers, []);
    expect(messageContent).toContain("CONFLICTS:");
    expect(messageContent).toContain("prefer whichever matches a PRIORITY INTEREST");
  });

  it("reflects priority in the plan and edit-day traveler lines", () => {
    const trip = { ...BASE_TRIP, answers: prioAnswers };
    expect(buildPlanPrompt("full", trip)).toContain("priority: Architecture");
    expect(buildEditDayPrompt("Mon", "## Mon\nx", "tweak", trip)).toContain("priority: Architecture");
  });

  it("no priorityChips → placeholder text + fallback to order, no leakage (backward compatible)", () => {
    // BASE_ANSWERS has no priorityChips
    const { messageContent } = buildTripCategoriesPrompt(BASE_ANSWERS, []);
    expect(messageContent).toContain("none specified");
    expect(buildPlanPrompt("full", BASE_TRIP)).not.toContain("priority:");
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

// ── Traveler-context single source of truth ───────────────────────────────────
//
// These lock the invariant the travelerContext() dedup exists to guarantee:
// one answers object renders the SAME traveler values in every prompt. Before
// the dedup, four builders each did their own extraction and defaulting, and
// stay/transport had already drifted apart. If someone re-inlines an
// extraction, these fail.

describe("traveler context is consistent across every prompt builder", () => {
  // Renders every builder from one answers object. Returns [label, text] pairs.
  const renderAll = (answers) => {
    const trip = { destination: answers.destination, answers, nights: 3, season: "mild", categories: {} };
    return [
      ["tripCategories",   buildTripCategoriesPrompt(answers).messageContent],
      ["planFull",         buildPlanPrompt("full", trip)],
      ["planDay",          buildPlanPrompt("day", trip)],
      ["editDay",          buildEditDayPrompt("Monday, July 1, 2024", "## old", "swap it", trip)],
      ["tweakActivity",    buildTweakActivityPrompt(trip, "Day 1", { time: "9am", title: "T", details: "d" }, "cheaper")],
    ];
  };

  it("an empty transport selection reads 'not specified' everywhere, never blank", () => {
    // [] is truthy, so arr() yields "" — this used to print "TRANSPORT: " blank
    // in the trip-build prompts while the plan prompts said "not specified".
    const answers = { ...BASE_ANSWERS, logistics: { ...BASE_ANSWERS.logistics, transport: [] } };
    for (const [label, text] of renderAll(answers)) {
      expect(text, label).not.toMatch(/TRANSPORT: *\n/);
      expect(text, label).not.toMatch(/- Transport: *\n/);
      expect(text, label).not.toContain("reachable by the traveler's transport: .");
    }
  });

  it("a missing logistics object degrades to 'not specified', not empty output", () => {
    const answers = { ...BASE_ANSWERS, logistics: undefined };
    for (const [label, text] of renderAll(answers)) {
      expect(text, label).not.toMatch(/TRANSPORT: *\n/);
      expect(text, label).not.toMatch(/- Staying: *\n/);
    }
  });

  it("every builder that prints a traveler value agrees on it", () => {
    const answers = {
      ...BASE_ANSWERS,
      party: { chips: ["Family"], text: "", kids: "Teens" },
      avoid: "crowds",
      interests: { chips: ["Museums", "Baseball"], text: "", priorityChips: ["Baseball"] },
    };
    const rendered = renderAll(answers);

    // Kids, priority interests, and the avoid list are the three fields most
    // recently added — exactly the ones a 4×-touch change tends to miss.
    for (const [label, text] of rendered) {
      if (text.includes("Kids:")) expect(text, label).toContain("Kids: Teens");
      if (text.includes("priority:")) expect(text, label).toContain("priority: Baseball");
      if (text.includes("Avoid:")) expect(text, label).toContain("Avoid: crowds");
    }

    // Not merely "each is self-consistent" — the field must actually reach the
    // builders that are supposed to carry it, or the loop above passes vacuously.
    const carriers = rendered.filter(([, t]) => t.includes("priority: Baseball"));
    expect(carriers.map(([l]) => l).sort())
      .toEqual(["editDay", "planDay", "planFull", "tweakActivity"]);
  });

  it("budget phrasing stays split by surface: verbose for trip build, compact for traveler blocks", () => {
    const tripText = renderAll(BASE_ANSWERS).find(([l]) => l === "tripCategories")[1];
    const planText = renderAll(BASE_ANSWERS).find(([l]) => l === "planFull")[1];
    expect(tripText).toContain("approx. USD 120/day per person");
    expect(planText).toContain("~120 USD/day");
  });

  it("budget 0 reads as staying with family/friends in both phrasings", () => {
    const answers = { ...BASE_ANSWERS, budget: 0 };
    const tripText = renderAll(answers).find(([l]) => l === "tripCategories")[1];
    const planText = renderAll(answers).find(([l]) => l === "planFull")[1];
    expect(tripText).toContain("Staying with family/friends — no accommodation cost");
    expect(planText).toContain("staying with family/friends");
  });
});

// ── Nightlife is interest-gated (§8) ─────────────────────────────────────────
//
// The generic "omit categories with no match" instruction was too soft: a
// Scottsdale traveler who picked Golf/Hiking/ATV/Museums still got a wine bar
// scheduled twice. Asking for the category at all is enough to get it filled,
// so the gate has to keep the key out of the requested schema.

describe("nightlife category gating", () => {
  const base = {
    destination: "Scottsdale, Arizona",
    dates: { start: "2026-10-12", end: "2026-10-15" },
    budget: 150,
    party: { chips: ["Couple"] },
    logistics: { pace: "Balanced" },
  };

  it("omits the nightlife category when no nightlife tag is selected", () => {
    const a = { ...base, interests: { chips: ["Golf", "Hiking", "Museums"], text: "" } };
    const out = buildTripCategoriesPrompt(a).messageContent;
    expect(out).not.toContain('"nightlife"');
    // The other categories are untouched.
    expect(out).toContain('"culture"');
    expect(out).toContain('"nature"');
    expect(out).toContain('"exploration"');
    expect(out).toContain('"experiences"');
  });

  it("includes it as soon as any nightlife tag is selected", () => {
    for (const tag of ["Bars", "Breweries", "Wineries", "Cocktails", "Clubs"]) {
      const a = { ...base, interests: { chips: ["Golf", tag], text: "" } };
      expect(buildTripCategoriesPrompt(a).messageContent, tag).toContain('"nightlife"');
    }
  });

  it("degrades safely for a trip with no interests object at all", () => {
    expect(() => buildTripCategoriesPrompt({ ...base })).not.toThrow();
    expect(buildTripCategoriesPrompt({ ...base }).messageContent).not.toContain('"nightlife"');
  });

  it("keeps the JSON schema well-formed in both states", () => {
    for (const chips of [["Golf"], ["Golf", "Bars"]]) {
      const out = buildTripCategoriesPrompt({ ...base, interests: { chips, text: "" } }).messageContent;
      const schema = out.slice(out.indexOf('{"categories"'));
      expect(() => JSON.parse(schema.replace(/\|/g, ""))).not.toThrow();
    }
  });
});

// ── Verified local events (§15.2 C) ──────────────────────────────────────────
//
// The Baltimore regression: Wandr scheduled an Orioles home game at 15:30 on
// Sunday Aug 16 2026. The live MLB schedule says the Orioles were away at
// Tropicana Field that day; their only home games in range were Aug 18-20 vs
// the Yankees. The app already had that data on the dashboard and never told
// the model. These lock the block that closes it.

const ORIOLES_GAMES = [
  { date: "2026-08-18", home: "Baltimore Orioles", away: "New York Yankees", venue: "Oriole Park at Camden Yards" },
  { date: "2026-08-19", home: "Baltimore Orioles", away: "New York Yankees", venue: "Oriole Park at Camden Yards" },
  { date: "2026-08-20", home: "Baltimore Orioles", away: "New York Yankees", venue: "Oriole Park at Camden Yards" },
];
const RESOLVED = { teams: ["Baltimore Orioles"], games: ORIOLES_GAMES, interested: false, resolved: true };

describe("buildEventsBlock", () => {
  it("returns nothing when there are no events at all", () => {
    expect(buildEventsBlock(null)).toBe("");
    expect(buildEventsBlock(undefined)).toBe("");
    expect(buildEventsBlock({})).toBe("");
  });

  it("returns nothing for a destination with no league team", () => {
    expect(buildEventsBlock({ teams: [], games: [], resolved: true })).toBe("");
  });

  it("stays silent while the fetch is still in flight", () => {
    // The important guard: an empty games array from an UNFINISHED fetch would
    // assert "no home games" — a false negative that is worse than saying
    // nothing, because the model would trust it.
    expect(buildEventsBlock({ ...RESOLVED, games: [], resolved: false })).toBe("");
    expect(buildEventsBlock({ ...RESOLVED, resolved: false })).toBe("");
  });

  it("states the negative explicitly when the team has no home games", () => {
    const out = buildEventsBlock({ teams: ["Baltimore Orioles"], games: [], interested: false, resolved: true });
    expect(out).toContain("NO home games at any point during this trip");
    expect(out).toContain("Baltimore Orioles");
  });

  it("lists every real game with date, opponent and venue", () => {
    const out = buildEventsBlock(RESOLVED);
    expect(out).toContain("Tuesday, August 18");
    expect(out).toContain("Wednesday, August 19");
    expect(out).toContain("Thursday, August 20");
    expect(out).toContain("vs New York Yankees");
    expect(out).toContain("Oriole Park at Camden Yards");
  });

  it("closes the door on every unlisted date — the Baltimore defect", () => {
    const out = buildEventsBlock(RESOLVED);
    // Aug 16 (the invented game) must not appear...
    expect(out).not.toContain("August 16");
    // ...and the prompt must say so, not merely omit it.
    expect(out).toContain("NO home game on ANY other date");
    expect(out).toContain("Never schedule, mention, or hedge about a game on a date not listed");
  });

  it("bans the hedge-that-still-books-a-slot", () => {
    // "Check schedule: Baltimore Orioles" occupied a 15:30 slot in the export.
    expect(buildEventsBlock(RESOLVED)).toContain("check the schedule");
  });

  it("permits scheduling only when the traveler follows the sport", () => {
    expect(buildEventsBlock({ ...RESOLVED, interested: true })).toContain("you MAY schedule a listed game");
    const uninterested = buildEventsBlock({ ...RESOLVED, interested: false });
    expect(uninterested).toContain("do NOT add a game");
    expect(uninterested).toContain("so you cannot invent one");
  });

  it("caps a long list rather than flooding the prompt", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, "0")}`, home: "Baltimore Orioles", away: "Boston Red Sox", venue: "Oriole Park at Camden Yards",
    }));
    const lines = buildEventsBlock({ teams: ["Baltimore Orioles"], games: many, interested: true, resolved: true })
      .split("\n").filter(l => l.trim().startsWith("·"));
    expect(lines).toHaveLength(10);
  });

  it("tolerates a malformed game row without throwing", () => {
    const out = buildEventsBlock({ teams: ["Baltimore Orioles"], games: [{}, { date: "nonsense" }], interested: true, resolved: true });
    expect(typeof out).toBe("string");
    expect(out).toContain("Baltimore Orioles");
  });
});

describe("buildPlanPrompt — events integration", () => {
  // The ACCURACY RULES text names the block ("unless it appears in a VERIFIED
  // LOCAL EVENTS block below"), so presence is asserted on the block's own
  // header line, not on the bare phrase.
  const BLOCK_HEADER = "VERIFIED LOCAL EVENTS — checked against the live league schedule";

  it("carries no events block when none is supplied", () => {
    const out = buildPlanPrompt("full", BASE_TRIP);
    expect(out).not.toContain(BLOCK_HEADER);
  });

  it("embeds the verified block when events are supplied", () => {
    const out = buildPlanPrompt("full", BASE_TRIP, null, null, RESOLVED);
    expect(out).toContain(BLOCK_HEADER);
    expect(out).toContain("Oriole Park at Camden Yards");
    expect(out).toContain("It overrides the LIVE EVENTS rule above");
  });

  it("tells the model to omit, not hedge, when nothing is verified", () => {
    const out = buildPlanPrompt("full", BASE_TRIP);
    expect(out).toContain("OMIT the event entirely");
    expect(out).toContain("a hedge that still occupies a slot");
  });

  it("requires the details to agree with the assigned time", () => {
    // Brewer's Art was scheduled 10:30 with details reading "Opens at 11:30".
    const out = buildPlanPrompt("full", BASE_TRIP);
    expect(out).toContain("SELF-CONSISTENCY");
    expect(out).toContain("never ship a row that argues with itself");
  });

  it("requires a repeated venue to be replaced in the Activity column", () => {
    // The export left "Checkerspot Brewing Company" in Activity and buried the
    // substitute in Details.
    const out = buildPlanPrompt("full", BASE_TRIP);
    expect(out).toContain("REPLACE THE ROW");
    expect(out).toContain("that ships the traveler a duplicate");
  });
});

// ── Details micro-grammar (design pick 4A) ────────────────────────────────────
//
// One grammar, three writers: full plan, day edit, activity tweak. A single
// site missing it means one edit regresses a chip block into a sentence blob.

describe("details micro-grammar reaches every row-writing prompt", () => {
  const builders = () => ({
    planFull: buildPlanPrompt("full", BASE_TRIP),
    editDay:  buildEditDayPrompt("Day 1 — Mon", "## Day 1 — Mon", "refresh", BASE_TRIP),
    tweak:    buildTweakActivityPrompt(BASE_TRIP, "Day 1 — Mon", { time: "09:00", title: "**T**", details: "d" }, "cheaper"),
  });

  it("every builder carries the DETAILS FORMAT rule", () => {
    for (const [label, text] of Object.entries(builders())) {
      expect(text, label).toContain("DETAILS FORMAT:");
      expect(text, label).toContain('separated by " · "');
    }
  });

  it("every builder bans the pipe character inside cells (it is the table delimiter)", () => {
    for (const [label, text] of Object.entries(builders())) {
      expect(text, label).toContain('NEVER use the "|" character inside a cell');
    }
  });

  it("the row templates model the grammar, not the old sentence blob", () => {
    for (const [label, text] of Object.entries(builders())) {
      expect(text, label).toContain("what it is, one factual sentence · ~cost · duration");
      expect(text, label).not.toContain("facts only, duration");
    }
  });

  it("tokens are ordered cost → duration → hours → booking in the rule", () => {
    const rule = buildPlanPrompt("full", BASE_TRIP);
    const idx = s => rule.indexOf(s, rule.indexOf("DETAILS FORMAT:"));
    expect(idx("cost,")).toBeLessThan(idx("duration,"));
    expect(idx("duration,")).toBeLessThan(idx("opening-hours"));
    expect(idx("opening-hours")).toBeLessThan(idx("booking note"));
  });
});
