import { describe, it, expect } from "vitest";
import { arr, parseISODate, calcNights, recoverJSON, parseTime, formatTime, resequenceTimes, bucketOf, sortDayByTime, retimeIntoBucket, formatShortDate, ticketDate, seasonShort, timeAgo, extractActivityTitles, splitDetails, classifyFact, matchTipToActivity, pruneOrphanTips, findGroundedVenue, countIdeas, bucketPickKey, carryBucketPicks, bucketShelves, tripDayIndex } from "./utils.js";

// ── arr ───────────────────────────────────────────────────────────────────────

describe("arr", () => {
  it("returns empty string for falsy values", () => {
    expect(arr(null)).toBe("");
    expect(arr(undefined)).toBe("");
    expect(arr("")).toBe("");
    expect(arr(0)).toBe("");    // 0 is falsy — treated as "no value"
  });

  it("joins arrays with comma-space", () => {
    expect(arr(["a", "b", "c"])).toBe("a, b, c");
    expect(arr(["Solo"])).toBe("Solo");
    expect(arr([])).toBe("");
  });

  it("handles chips+text objects with both parts", () => {
    expect(arr({ chips: ["Hiking & nature", "Coffee culture"], text: "love craft beer" }))
      .toBe("Hiking & nature, Coffee culture — also: love craft beer");
  });

  it("handles chips+text objects with only chips", () => {
    expect(arr({ chips: ["Fine dining"], text: "" })).toBe("Fine dining");
    expect(arr({ chips: ["Fine dining"], text: "   " })).toBe("Fine dining");
  });

  it("handles chips+text objects with only text", () => {
    expect(arr({ chips: [], text: "photography walks" })).toBe("photography walks");
  });

  it("returns empty string for empty chips+text object", () => {
    expect(arr({ chips: [], text: "" })).toBe("");
  });

  it("stringifies primitives", () => {
    expect(arr("Tokyo")).toBe("Tokyo");
    expect(arr(42)).toBe("42");
    expect(arr(true)).toBe("true");
  });
});

// ── parseISODate ──────────────────────────────────────────────────────────────

describe("parseISODate", () => {
  it("parses a valid ISO date string", () => {
    const d = parseISODate("2024-06-15");
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(5); // 0-indexed
    expect(d.getDate()).toBe(15);
  });

  it("returns null for null/undefined/empty", () => {
    expect(parseISODate(null)).toBeNull();
    expect(parseISODate(undefined)).toBeNull();
    expect(parseISODate("")).toBeNull();
  });

  it("returns null for non-string values", () => {
    expect(parseISODate(20240615)).toBeNull();
    expect(parseISODate({})).toBeNull();
  });

  it("returns null for invalid date strings", () => {
    expect(parseISODate("not-a-date")).toBeNull();
    expect(parseISODate("2024-13-01")).toBeNull(); // month 13 doesn't exist
    expect(parseISODate("2024-00-01")).toBeNull(); // month 0 doesn't exist
  });
});

// ── calcNights ────────────────────────────────────────────────────────────────

describe("calcNights", () => {
  it("calculates nights correctly", () => {
    expect(calcNights("2024-06-01", "2024-06-07")).toBe(6);
    expect(calcNights("2024-12-28", "2025-01-02")).toBe(5); // crosses year
  });

  it("returns at least 1 night for same-day or reversed dates", () => {
    expect(calcNights("2024-06-01", "2024-06-01")).toBe(1);
    expect(calcNights("2024-06-07", "2024-06-01")).toBe(1); // end before start
  });

  it("uses defaultNights when dates are missing or invalid", () => {
    expect(calcNights("", "", 5)).toBe(5);
    expect(calcNights(null, null)).toBe(5);
    expect(calcNights("bad", "dates", 7)).toBe(7);
  });

  it("uses 5 as the built-in default", () => {
    expect(calcNights(null, null)).toBe(5);
  });
});

// ── recoverJSON ───────────────────────────────────────────────────────────────

describe("recoverJSON", () => {
  it("parses clean JSON", () => {
    expect(recoverJSON('{"destination":"Tokyo","nights":7}')).toEqual({ destination: "Tokyo", nights: 7 });
  });

  it("strips markdown code fences", () => {
    const fenced = "```json\n{\"destination\":\"Kyoto\"}\n```";
    expect(recoverJSON(fenced)).toEqual({ destination: "Kyoto" });

    const fencedNoLang = "```\n{\"destination\":\"Osaka\"}\n```";
    expect(recoverJSON(fencedNoLang)).toEqual({ destination: "Osaka" });
  });

  it("recovers JSON with unclosed braces", () => {
    // The algorithm closes open brackets and strips the last potentially-incomplete
    // property, so earlier properties are preserved.
    const truncated = '{"destination":"Lisbon","nights":4,"highlights":[]';
    const result = recoverJSON(truncated);
    expect(result).toBeDefined();
    expect(result.destination).toBe("Lisbon");
    expect(result.nights).toBe(4);
  });

  it("extracts outermost JSON object from surrounding text", () => {
    const messy = 'Here is your result: {"destination":"Porto"} Hope that helps!';
    expect(recoverJSON(messy)).toEqual({ destination: "Porto" });
  });

  it("throws when JSON is unrecoverable", () => {
    expect(() => recoverJSON("this is not json at all")).toThrow("Couldn't read the trip data. You can still generate a plan below.");
    expect(() => recoverJSON("")).toThrow();
  });
});

// ── parseTime ─────────────────────────────────────────────────────────────────

describe("parseTime", () => {
  it("parses 12-hour clock times with meridiem", () => {
    expect(parseTime("9:00 AM")).toBe(540);
    expect(parseTime("1:30 PM")).toBe(810);
    expect(parseTime("6:00 PM")).toBe(1080);
    expect(parseTime("9 AM")).toBe(540);      // no minutes
    expect(parseTime("2pm")).toBe(840);        // no space
  });

  it("handles noon and midnight edge cases", () => {
    expect(parseTime("12:00 PM")).toBe(720);   // noon
    expect(parseTime("12:00 AM")).toBe(0);     // midnight
    expect(parseTime("12 PM")).toBe(720);
    expect(parseTime("12 AM")).toBe(0);
  });

  it("parses 24-hour times without meridiem", () => {
    expect(parseTime("14:00")).toBe(840);
    expect(parseTime("9:00")).toBe(540);
  });

  it("strips markdown bold and whitespace", () => {
    expect(parseTime("**10:15 AM**")).toBe(615);
    expect(parseTime("  3:45 PM ")).toBe(945);
  });

  it("returns null for non-clock times", () => {
    expect(parseTime("Morning")).toBeNull();
    expect(parseTime("Evening")).toBeNull();
    expect(parseTime("")).toBeNull();
    expect(parseTime(null)).toBeNull();
    expect(parseTime("25:00")).toBeNull();     // invalid hour
  });
});

// ── formatTime ────────────────────────────────────────────────────────────────

describe("formatTime", () => {
  it("formats minutes to a 24-hour clock string (app-wide format)", () => {
    expect(formatTime(540)).toBe("09:00");
    expect(formatTime(810)).toBe("13:30");
    expect(formatTime(1080)).toBe("18:00");
    expect(formatTime(720)).toBe("12:00");  // noon
    expect(formatTime(0)).toBe("00:00");    // midnight
  });

  it("round-trips with parseTime", () => {
    for (const t of ["09:00", "13:30", "18:00", "12:00", "00:00"]) {
      expect(formatTime(parseTime(t))).toBe(t);
    }
  });

  it("normalizes legacy 12-hour strings from saved plans to 24-hour", () => {
    expect(formatTime(parseTime("9:00 AM"))).toBe("09:00");
    expect(formatTime(parseTime("5:30 PM"))).toBe("17:30");
    expect(formatTime(parseTime("12:00 AM"))).toBe("00:00");
  });
});

// ── resequenceTimes ───────────────────────────────────────────────────────────

describe("resequenceTimes", () => {
  it("re-sorts times ascending after a within-day drag", () => {
    // Drag a 9 AM activity to the end: [12 PM, 3 PM, 9 AM] → times ascend again
    const dragged = [
      { id: "b", time: "12:00 PM", title: "B", details: "" },
      { id: "c", time: "3:00 PM",  title: "C", details: "" },
      { id: "a", time: "9:00 AM",  title: "A", details: "" },
    ];
    const out = resequenceTimes(dragged);
    expect(out.map(x => x.time)).toEqual(["09:00", "12:00", "15:00"]);
    // positions/identities preserved — only the time field changes
    expect(out.map(x => x.id)).toEqual(["b", "c", "a"]);
    expect(out[2].title).toBe("A");
  });

  it("gives a moved-in activity the day's latest slot when appended last", () => {
    // A 9 AM activity appended to a [10 AM, 1 PM, 6 PM] day
    const target = [
      { id: "x", time: "10:00 AM", title: "X", details: "" },
      { id: "y", time: "1:00 PM",  title: "Y", details: "" },
      { id: "z", time: "6:00 PM",  title: "Z", details: "" },
      { id: "m", time: "9:00 AM",  title: "Moved", details: "" },
    ];
    const out = resequenceTimes(target);
    expect(out.map(x => x.time)).toEqual(["09:00", "10:00", "13:00", "18:00"]);
    expect(out[3].id).toBe("m");     // moved item stays last, gets the 6 PM slot
  });

  it("leaves non-clock times ('Morning') in place and untouched", () => {
    const acts = [
      { id: "a", time: "3:00 PM",  title: "A", details: "" },
      { id: "b", time: "Morning",  title: "B", details: "" },
      { id: "c", time: "9:00 AM",  title: "C", details: "" },
    ];
    const out = resequenceTimes(acts);
    // clock slots [9,15] fill positions 0 and 2; "Morning" holds position 1
    expect(out.map(x => x.time)).toEqual(["09:00", "Morning", "15:00"]);
  });

  it("returns input unchanged when not an array", () => {
    expect(resequenceTimes(null)).toBeNull();
    expect(resequenceTimes(undefined)).toBeUndefined();
  });

  it("keeps order for an already-ascending day (times normalize to 24h)", () => {
    const acts = [
      { id: "a", time: "9:00 AM",  title: "A", details: "" },
      { id: "b", time: "12:00 PM", title: "B", details: "" },
    ];
    expect(resequenceTimes(acts).map(x => x.time)).toEqual(["09:00", "12:00"]);
  });
});

// ── bucketOf ──────────────────────────────────────────────────────────────────

describe("bucketOf", () => {
  it("buckets clock times by boundary (Morning <12pm, Afternoon 12–5pm, Evening ≥5pm)", () => {
    expect(bucketOf("9:00 AM")).toBe("Morning");
    expect(bucketOf("11:59 AM")).toBe("Morning");
    expect(bucketOf("12:00 PM")).toBe("Afternoon");
    expect(bucketOf("4:59 PM")).toBe("Afternoon");
    expect(bucketOf("5:00 PM")).toBe("Evening");
    expect(bucketOf("9:00 PM")).toBe("Evening");
  });

  it("routes non-clock times by keyword", () => {
    expect(bucketOf("Morning")).toBe("Morning");
    expect(bucketOf("Lunch")).toBe("Afternoon");
    expect(bucketOf("Dinner")).toBe("Evening");
    expect(bucketOf("Evening stroll")).toBe("Evening");
  });

  it("defaults unrecognized text to Morning", () => {
    expect(bucketOf("Anytime")).toBe("Morning");
    expect(bucketOf("")).toBe("Morning");
  });
});

// ── sortDayByTime ─────────────────────────────────────────────────────────────

describe("sortDayByTime", () => {
  it("sorts activities ascending by time", () => {
    const acts = [
      { id: "c", time: "6:00 PM" },
      { id: "a", time: "9:00 AM" },
      { id: "b", time: "1:00 PM" },
    ];
    expect(sortDayByTime(acts).map(x => x.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts non-clock times into their bucket region via anchor", () => {
    // "Dinner" (Evening, anchor 6pm) should sort after a 1pm clock time
    const acts = [
      { id: "dinner", time: "Dinner" },
      { id: "one", time: "1:00 PM" },
      { id: "morning", time: "Morning" },
    ];
    expect(sortDayByTime(acts).map(x => x.id)).toEqual(["morning", "one", "dinner"]);
  });

  it("returns input unchanged when not an array", () => {
    expect(sortDayByTime(null)).toBeNull();
  });
});

// ── retimeIntoBucket ──────────────────────────────────────────────────────────

describe("retimeIntoBucket", () => {
  it("uses the bucket anchor when the bucket is empty", () => {
    expect(retimeIntoBucket("Morning", [])).toBe("09:00");
    expect(retimeIntoBucket("Afternoon", [])).toBe("13:00");
    expect(retimeIntoBucket("Evening", [])).toBe("18:00");
  });

  it("lands 60min after the bucket's latest activity when occupied", () => {
    expect(retimeIntoBucket("Evening", [{ time: "18:00" }, { time: "19:30" }])).toBe("20:30");
  });

  it("keeps the anchor when existing times are earlier than it", () => {
    // anchor 1pm beats a stray 12:15pm + 60 = 1:15pm? no — max(780, 795)=795 → 1:15 PM
    expect(retimeIntoBucket("Afternoon", [{ time: "12:15 PM" }])).toBe("13:15");
    // existing well before anchor → anchor wins
    expect(retimeIntoBucket("Evening", [{ time: "1:00 PM" }])).toBe("18:00");
  });

  it("caps at 23:59", () => {
    expect(retimeIntoBucket("Evening", [{ time: "23:30" }])).toBe("23:59");
  });
});

// ── formatShortDate ───────────────────────────────────────────────────────────

describe("formatShortDate", () => {
  it("formats an ISO date as 'Ddd, Mon D'", () => {
    expect(formatShortDate("2026-08-02")).toBe("Sun, Aug 2");
    expect(formatShortDate("2026-01-01")).toBe("Thu, Jan 1");
    expect(formatShortDate("2026-12-25")).toBe("Fri, Dec 25");
  });

  it("returns the raw input when it isn't a valid date", () => {
    expect(formatShortDate("not-a-date")).toBe("not-a-date");
    expect(formatShortDate("")).toBe("");
    expect(formatShortDate(null)).toBe("");
  });
});

// ── ticketDate / seasonShort (boarding-pass hero) ─────────────────────────────

describe("ticketDate", () => {
  it("formats an ISO date as a boarding-pass stub", () => {
    expect(ticketDate("2026-06-30")).toBe("JUN 30");
    expect(ticketDate("2026-07-01")).toBe("JUL 1");
    expect(ticketDate("2026-12-25")).toBe("DEC 25");
  });

  it("returns '' for invalid input so the ticket hides the row", () => {
    expect(ticketDate("nope")).toBe("");
    expect(ticketDate(null)).toBe("");
  });
});

describe("seasonShort", () => {
  it("labels early / mid / late month from the start date", () => {
    expect(seasonShort("2026-06-05")).toBe("Early June");
    expect(seasonShort("2026-06-15")).toBe("Mid June");
    expect(seasonShort("2026-06-30")).toBe("Late June");
    expect(seasonShort("2026-01-21")).toBe("Late January");
  });

  it("returns '' for invalid input so the Season column drops out", () => {
    expect(seasonShort("")).toBe("");
    expect(seasonShort(undefined)).toBe("");
  });
});

// ── timeAgo / extractActivityTitles (Remix status row) ────────────────────────

describe("timeAgo", () => {
  const now = new Date("2026-07-28T12:00:00").getTime();

  it("scales from 'just now' through minutes and hours to a date", () => {
    expect(timeAgo(now - 30 * 1000, now)).toBe("just now");
    expect(timeAgo(now - 12 * 60 * 1000, now)).toBe("12 min ago");
    expect(timeAgo(now - 3 * 3600 * 1000, now)).toBe("3 hr ago");
    expect(timeAgo(new Date("2026-07-20T09:00:00").getTime(), now)).toBe("Jul 20");
  });

  it("returns '' for missing or bad input so the row hides the timestamp", () => {
    expect(timeAgo(null, now)).toBe("");
    expect(timeAgo(undefined, now)).toBe("");
    expect(timeAgo("yesterday", now)).toBe("");
  });
});

describe("extractActivityTitles", () => {
  const plan = [
    "## Day 1 — Tuesday, June 30, 2026",
    "TABLE:",
    "| Time | Activity | Details |",
    "|------|----------|---------|",
    "| 9:00 AM | **Group Kayak Tour** | On the water. |",
    "| 1:00 PM | **Slalom Creek Brewing** | Beer. |",
    "ENDTABLE",
    "## Day 2 — Wednesday, July 1, 2026",
    "| 10:00 AM | **Group Kayak Tour** | Again. |",
  ].join("\n");

  it("collects unique bold titles, skipping headers and separators", () => {
    expect(extractActivityTitles(plan)).toEqual(["Group Kayak Tour", "Slalom Creek Brewing"]);
  });

  it("returns [] for empty input", () => {
    expect(extractActivityTitles("")).toEqual([]);
    expect(extractActivityTitles(null)).toEqual([]);
  });
});

// ── splitDetails (4A grammar + 4C legacy bridge) ──────────────────────────────
//
// RENDER-TIME ONLY contract: splitDetails never mutates the stored string —
// these tests treat the input as opaque and only assert on the split view.

describe("splitDetails — 4A grammar plans", () => {
  const CELL = "Moorish hilltop citadel with the best panorama over Alfama. · ~€15 · 2h · opens 09:00 · book ahead";

  it("splits description from fact tokens on the middle-dot separator", () => {
    const { desc, facts } = splitDetails(CELL);
    expect(desc).toBe("Moorish hilltop citadel with the best panorama over Alfama.");
    expect(facts.map(f => f.text)).toEqual(["~€15", "2h", "opens 09:00", "book ahead"]);
  });

  it("classifies each token into its chip family", () => {
    const { facts } = splitDetails(CELL);
    expect(facts.map(f => f.kind)).toEqual(["cost", "duration", "hours", "booking"]);
  });

  it("unknown tokens fall back to the generic note chip", () => {
    const { facts } = splitDetails("A market hall. · cash only");
    expect(facts).toEqual([{ kind: "note", text: "cash only" }]);
  });

  it("strips bold markers and tolerates missing tokens", () => {
    const { desc, facts } = splitDetails("**Free viewpoint over the river.** · free");
    expect(desc).toBe("Free viewpoint over the river.");
    expect(facts).toEqual([{ kind: "cost", text: "free" }]);
  });

  it("caps the chip row at five facts", () => {
    const { facts } = splitDetails("d. · a · b · c · d · e · f · g");
    expect(facts).toHaveLength(5);
  });

  it("handles empty and nullish input", () => {
    expect(splitDetails("")).toEqual({ desc: "", facts: [] });
    expect(splitDetails(null)).toEqual({ desc: "", facts: [] });
  });
});

describe("splitDetails — 4C bridge for legacy sentence blobs", () => {
  const LEGACY = "Moorish hilltop citadel over Alfama. Entry ~€15, allow 2 hours; opens 09:00 — buy tickets online to skip the queue.";

  it("derives cost, duration, hours and booking chips from the prose", () => {
    const kinds = splitDetails(LEGACY).facts.map(f => f.kind);
    expect(kinds).toContain("cost");
    expect(kinds).toContain("duration");
    expect(kinds).toContain("hours");
    expect(kinds).toContain("booking");
  });

  it("drops a trailing fact-dump sentence once its facts are chipped", () => {
    // The whole second sentence restates the four chips — duplication on
    // screen (re-reported 2026-08-08), so the rendered desc trims to the
    // first sentence. The stored string is untouched (render-time only).
    expect(splitDetails(LEGACY).desc).toBe("Moorish hilltop citadel over Alfama.");
  });

  it("drops a short single-fact restatement (the Chase Field case)", () => {
    const { desc, facts } = splitDetails("Catch a Diamondbacks game under the retractable roof. Upper deck seats typically $10–$25.");
    expect(desc).toBe("Catch a Diamondbacks game under the retractable roof.");
    expect(facts.map(f => f.text)).toContain("$10–$25");
  });

  it("never drops the first sentence, even when it carries the fact", () => {
    const { desc } = splitDetails("Entry ~€15 for the rooftop terrace.");
    expect(desc).toBe("Entry ~€15 for the rooftop terrace.");
  });

  it("keeps a long sentence that mentions a fact but carries real prose", () => {
    const KEEP = "Historic market hall in the old town. Entry €5 includes a guided tasting of six regional cheeses and a glass of vinho verde.";
    expect(splitDetails(KEEP).desc).toBe(KEEP);
  });

  it("keeps a sentence whose facts no chip carries (a regex miss loses nothing)", () => {
    const { desc, facts } = splitDetails("Quiet cloister garden. Donations welcome at the gate.");
    expect(facts).toEqual([]);
    expect(desc).toBe("Quiet cloister garden. Donations welcome at the gate.");
  });

  it("derives nothing from a fact-free sentence", () => {
    const { desc, facts } = splitDetails("Wander the old town at your own pace.");
    expect(facts).toEqual([]);
    expect(desc).toBe("Wander the old town at your own pace.");
  });

  it("never misreads a bare time range as a cost", () => {
    const { facts } = splitDetails("Sunset spot, best 18:00–19:30.");
    expect(facts.filter(f => f.kind === "cost")).toEqual([]);
  });

  it("chips a full price range and 'free admission' (widened 2026-08-10)", () => {
    expect(splitDetails("Ballpark tour. Seats $10–$25.").facts.map(f => f.text)).toContain("$10–$25");
    const free = splitDetails("City museum of ceramics. Free admission.");
    expect(free.facts).toEqual([{ kind: "cost", text: "Free admission" }]);
    expect(free.desc).toBe("City museum of ceramics.");
  });
});

describe("classifyFact", () => {
  it("recognises currencies beyond the euro", () => {
    expect(classifyFact("$25")).toBe("cost");
    expect(classifyFact("¥1200")).toBe("cost");
    expect(classifyFact("₺150")).toBe("cost");
  });
  it("recognises minute durations", () => {
    expect(classifyFact("45 min")).toBe("duration");
    expect(classifyFact("1.5h")).toBe("duration");
  });
});

describe("classifyFact — negated tokens stay quiet", () => {
  it("a padded negative never renders as a hot booking chip", () => {
    expect(classifyFact("no booking needed")).toBe("note");
    expect(classifyFact("No reservations required")).toBe("note");
    expect(classifyFact("book ahead")).toBe("booking");
  });
});

// ── matchTipToActivity (§15.6, export redesign pick 2B) ─────────────────────
//
// Fixtures are verbatim TIPS lines and titles from the Baltimore export. Chip
// extraction is NOT here — the export reuses splitDetails(), the same engine
// as the on-screen blocks, so the two surfaces cannot drift.

describe("matchTipToActivity", () => {
  const DAY1 = ["Patapsco Valley State Park – Cascade Falls Trail", "Cylburn Arboretum", "Station North Arts District Street Art Walk", "Checkerspot Brewing Company"];

  it("matches a tip to the venue it names", () => {
    expect(matchTipToActivity("Arrive at Patapsco before 09:00 — the Ilchester lot fills fast", DAY1)).toBe(0);
    expect(matchTipToActivity("Checkerspot’s bar seats are the best solo option", DAY1)).toBe(3);
  });

  it("tolerates word-form differences (kayak ↔ Kayaking)", () => {
    const day3 = ["Kayaking the Inner Harbor / Middle Branch", "Fells Point Historic Waterfront", "Heavy Seas Alehouse"];
    expect(matchTipToActivity("Weekend kayak slots fill quickly — book online", day3)).toBe(0);
  });

  it("survives possessives on the title side", () => {
    const day6 = ["Fort McHenry National Monument & Historic Shrine", "Lexington Market", "13.5% Wine Bar"];
    expect(matchTipToActivity("Fort McHenry’s star-shaped layout is best photographed from the ramparts", day6)).toBe(0);
    expect(matchTipToActivity("Lexington Market’s rebuilt interior is clean and air-conditioned", day6)).toBe(1);
  });

  it("refuses to match on generic words alone", () => {
    // "museum"/"park"/"trail" are stopworded — a generic tip attaches nowhere
    // and falls back to the day-level block instead of guessing.
    expect(matchTipToActivity("The museum is quieter on weekday mornings", ["Baltimore Museum of Art", "Federal Hill Park"])).toBe(-1);
    expect(matchTipToActivity("a tip about nothing in particular", ["Peabody Library", "Federal Hill Park"])).toBe(-1);
  });

  it("handles empty inputs", () => {
    expect(matchTipToActivity("", ["Peabody Library"])).toBe(-1);
    expect(matchTipToActivity("Peabody is lovely", [])).toBe(-1);
    expect(matchTipToActivity("Peabody is lovely", null)).toBe(-1);
  });

  it("picks the stronger match when two titles share a word", () => {
    const day4 = ["North Point State Park & Beach", "Orioles Game at Camden Yards"];
    expect(matchTipToActivity("North Point is genuinely uncrowded — arrive by 08:00 for the beach", day4)).toBe(0);
    expect(matchTipToActivity("Camden Yards allows cameras with lenses up to a certain length", day4)).toBe(1);
  });
});

// ── pruneOrphanTips (tips follow their card, 2026-08-11 Flagstaff report) ────
//
// An AI tweak replaced Buffalo Park but its tip survived, stranded in
// "Before you go". Pruning fires inside the edit commits (tweak / remove /
// rename); these fixtures mirror that report.

describe("pruneOrphanTips", () => {
  const TIPS = [
    "Buffalo Park gets hot and exposed by 09:00 in mid-August — bring water",
    "Flagstaff sits at 2,100m — expect cool evenings year-round",
  ];

  it("drops the tip pinned to the replaced venue", () => {
    const out = pruneOrphanTips(TIPS, "**Buffalo Park Loop**", ["**Humphreys Peak Trail**", "**Lowell Observatory**"]);
    expect(out).toEqual([TIPS[1]]);
  });

  it("keeps venue-free day tips untouched", () => {
    const out = pruneOrphanTips(TIPS, "**Lowell Observatory**", ["**Humphreys Peak Trail**"]);
    expect(out).toEqual(TIPS);
  });

  it("keeps a tip that still matches a current title (typo-fix rename)", () => {
    const out = pruneOrphanTips(TIPS, "**Bufalo Park Loop**", ["**Buffalo Park Loop**"]);
    expect(out).toEqual(TIPS);
  });

  it("handles empty and missing tips", () => {
    expect(pruneOrphanTips([], "**X**", ["**Y**"])).toEqual([]);
    expect(pruneOrphanTips(undefined, "**X**", ["**Y**"])).toEqual([]);
  });
});

// ── findGroundedVenue (map chip, pick A) ─────────────────────────────────────

describe("findGroundedVenue", () => {
  const MAPS = "https://www.google.com/maps/search/?api=1&query=x&query_place_id=y";
  const cats = {
    culture: [
      { name: "Museu do Fado", verified: true, canonicalName: "Fado Museum", address: "Largo do Chafariz de Dentro 1", mapUrl: MAPS },
      { name: "Igreja de São Francisco", verified: false },
    ],
    nature: [
      { name: "Jardins do Palácio de Cristal", verified: true, address: "R. de D Manuel II", mapUrl: MAPS },
    ],
    experiences: "not-an-array",
  };

  it("matches an exact title", () => {
    expect(findGroundedVenue("Museu do Fado", cats)?.address).toBe("Largo do Chafariz de Dentro 1");
  });

  it("matches a title that wraps the venue in activity framing", () => {
    expect(findGroundedVenue("Sunset picnic at the Jardins do Palácio de Cristal", cats)).toBeTruthy();
  });

  it("matches via Google's canonicalName and survives diacritic drift", () => {
    expect(findGroundedVenue("Fado Museum visit", cats)).toBeTruthy();
    expect(findGroundedVenue("Jardins do Palacio de Cristal", cats)).toBeTruthy();
  });

  it("one shared word is not that venue", () => {
    expect(findGroundedVenue("Fado dinner show", cats)).toBeNull();
    expect(findGroundedVenue("Cristal rooftop bar", cats)).toBeNull();
  });

  it("unverified venues never link", () => {
    expect(findGroundedVenue("Igreja de São Francisco", cats)).toBeNull();
  });

  it("rejects a tampered mapUrl (localStorage is user-editable)", () => {
    const bad = { culture: [{ name: "Museu do Fado", verified: true, mapUrl: "javascript:alert(1)" }] };
    expect(findGroundedVenue("Museu do Fado", bad)).toBeNull();
  });

  it("handles missing/malformed categories safely", () => {
    expect(findGroundedVenue("Museu do Fado", undefined)).toBeNull();
    expect(findGroundedVenue("", cats)).toBeNull();
    expect(findGroundedVenue("Anything", { x: "not-an-array" })).toBeNull();
  });
});

// ── countIdeas / bucketPickKey (Bucket List mode, 2026-08-15) ─────────────────

describe("countIdeas", () => {
  it("returns 0 for empty or missing categories", () => {
    expect(countIdeas(undefined)).toBe(0);
    expect(countIdeas(null)).toBe(0);
    expect(countIdeas({})).toBe(0);
  });

  it("sums items across categories, ignoring non-array values", () => {
    expect(countIdeas({
      culture: [{ name: "A" }, { name: "B" }],
      nature: [{ name: "C" }],
      junk: "not an array",
      alsoJunk: null,
    })).toBe(3);
  });
});

describe("bucketPickKey", () => {
  it("is category-scoped and name-based", () => {
    expect(bucketPickKey("culture", { name: "Livraria Lello" })).toBe("culture:Livraria Lello");
  });

  it("never throws on a malformed item", () => {
    expect(bucketPickKey("nature", null)).toBe("nature:");
    expect(bucketPickKey("nature", {})).toBe("nature:");
  });

  it("keeps same-named venues in different categories distinct", () => {
    expect(bucketPickKey("culture", { name: "X" })).not.toBe(bucketPickKey("nature", { name: "X" }));
  });
});

describe("carryBucketPicks", () => {
  const categories = {
    culture: [{ name: "Lello" }, { name: "Serralves" }],
    nature: [{ name: "Crystal Palace Gardens" }],
  };

  it("keeps picks whose venues survived the rebuild", () => {
    expect(carryBucketPicks({ "culture:Lello": true }, categories))
      .toEqual({ "culture:Lello": true });
  });

  it("drops picks for venues the recuration removed (no phantom PICKED count)", () => {
    expect(carryBucketPicks({ "culture:Gone Venue": true, "nature:Crystal Palace Gardens": true }, categories))
      .toEqual({ "nature:Crystal Palace Gardens": true });
  });

  it("survives empty and malformed inputs", () => {
    expect(carryBucketPicks(undefined, categories)).toEqual({});
    expect(carryBucketPicks({ "culture:Lello": true }, undefined)).toEqual({});
    expect(carryBucketPicks({ "culture:Lello": true }, { culture: "junk" })).toEqual({});
  });
});

describe("bucketShelves", () => {
  it("orders canonical categories first, then prettified extras, dropping empties", () => {
    const shelves = bucketShelves({
      live_music: [{ name: "A" }],
      nature: [{ name: "B" }],
      culture: [{ name: "C" }],
      exploration: [],
      junk: "not an array",
    });
    expect(shelves.map(([, label]) => label)).toEqual(["Culture", "Nature", "Live music"]);
  });

  it("returns [] for empty input", () => {
    expect(bucketShelves(undefined)).toEqual([]);
    expect(bucketShelves({})).toEqual([]);
  });
});

// ── tripDayIndex (Right Now mode trigger, pick 1A) ───────────────────────────

describe("tripDayIndex", () => {
  const dates = { start: "2026-09-01", end: "2026-09-05" };
  const at = (iso) => new Date(iso + "T14:30:00");

  it("returns the 1-based day number inside the range", () => {
    expect(tripDayIndex(dates, at("2026-09-01"))).toEqual({ dayNum: 1, totalDays: 5 });
    expect(tripDayIndex(dates, at("2026-09-03"))).toEqual({ dayNum: 3, totalDays: 5 });
    expect(tripDayIndex(dates, at("2026-09-05"))).toEqual({ dayNum: 5, totalDays: 5 });
  });

  it("returns null outside the range", () => {
    expect(tripDayIndex(dates, at("2026-08-31"))).toBe(null);
    expect(tripDayIndex(dates, at("2026-09-06"))).toBe(null);
  });

  it("returns null for missing or bucket-shaped dates", () => {
    expect(tripDayIndex(undefined, at("2026-09-03"))).toBe(null);
    expect(tripDayIndex({}, at("2026-09-03"))).toBe(null);
    expect(tripDayIndex({ bucket: true, now: false, whenText: "next spring" }, at("2026-09-03"))).toBe(null);
  });

  it("handles a single-day trip", () => {
    expect(tripDayIndex({ start: "2026-09-01", end: "2026-09-01" }, at("2026-09-01"))).toEqual({ dayNum: 1, totalDays: 1 });
  });
});
