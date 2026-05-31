import { describe, it, expect } from "vitest";
import { arr, parseISODate, calcNights, recoverJSON } from "./utils.js";

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
    expect(() => recoverJSON("this is not json at all")).toThrow("JSON unrecoverable");
    expect(() => recoverJSON("")).toThrow();
  });
});
