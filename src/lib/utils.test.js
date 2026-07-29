import { describe, it, expect } from "vitest";
import { arr, parseISODate, calcNights, recoverJSON, parseTime, formatTime, resequenceTimes, bucketOf, sortDayByTime, retimeIntoBucket, formatShortDate, ticketDate, seasonShort, timeAgo, extractActivityTitles } from "./utils.js";

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
  it("formats minutes to a 12-hour clock string", () => {
    expect(formatTime(540)).toBe("9:00 AM");
    expect(formatTime(810)).toBe("1:30 PM");
    expect(formatTime(1080)).toBe("6:00 PM");
    expect(formatTime(720)).toBe("12:00 PM");  // noon
    expect(formatTime(0)).toBe("12:00 AM");    // midnight
  });

  it("round-trips with parseTime", () => {
    for (const t of ["9:00 AM", "1:30 PM", "6:00 PM", "12:00 PM", "12:00 AM"]) {
      expect(formatTime(parseTime(t))).toBe(t);
    }
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
    expect(out.map(x => x.time)).toEqual(["9:00 AM", "12:00 PM", "3:00 PM"]);
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
    expect(out.map(x => x.time)).toEqual(["9:00 AM", "10:00 AM", "1:00 PM", "6:00 PM"]);
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
    expect(out.map(x => x.time)).toEqual(["9:00 AM", "Morning", "3:00 PM"]);
  });

  it("returns input unchanged when not an array", () => {
    expect(resequenceTimes(null)).toBeNull();
    expect(resequenceTimes(undefined)).toBeUndefined();
  });

  it("is a no-op for an already-ascending day", () => {
    const acts = [
      { id: "a", time: "9:00 AM",  title: "A", details: "" },
      { id: "b", time: "12:00 PM", title: "B", details: "" },
    ];
    expect(resequenceTimes(acts).map(x => x.time)).toEqual(["9:00 AM", "12:00 PM"]);
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
    expect(retimeIntoBucket("Morning", [])).toBe("9:00 AM");
    expect(retimeIntoBucket("Afternoon", [])).toBe("1:00 PM");
    expect(retimeIntoBucket("Evening", [])).toBe("6:00 PM");
  });

  it("lands 60min after the bucket's latest activity when occupied", () => {
    expect(retimeIntoBucket("Evening", [{ time: "6:00 PM" }, { time: "7:30 PM" }])).toBe("8:30 PM");
  });

  it("keeps the anchor when existing times are earlier than it", () => {
    // anchor 1pm beats a stray 12:15pm + 60 = 1:15pm? no — max(780, 795)=795 → 1:15 PM
    expect(retimeIntoBucket("Afternoon", [{ time: "12:15 PM" }])).toBe("1:15 PM");
    // existing well before anchor → anchor wins
    expect(retimeIntoBucket("Evening", [{ time: "1:00 PM" }])).toBe("6:00 PM");
  });

  it("caps at 11:59 PM", () => {
    expect(retimeIntoBucket("Evening", [{ time: "11:30 PM" }])).toBe("11:59 PM");
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
