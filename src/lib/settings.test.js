import { describe, it, expect, beforeEach } from "vitest";
import { loadSettings, saveSettings, getTimeFormat, clearAllWandrData, _resetSettingsCache } from "./settings.js";
import { formatTime, displayTime, resequenceTimes } from "./utils.js";

class MemStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  key(i) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
}

beforeEach(() => {
  globalThis.localStorage = new MemStorage();
  _resetSettingsCache();
});

describe("settings store", () => {
  it("defaults to 24h with no stored settings", () => {
    expect(getTimeFormat()).toBe("24h");
    expect(loadSettings()).toEqual({ v: 1, timeFormat: "24h" });
  });

  it("persists and re-reads a change", () => {
    saveSettings({ timeFormat: "12h" });
    _resetSettingsCache(); // simulate a fresh page load
    expect(getTimeFormat()).toBe("12h");
  });

  it("falls back to defaults on junk or unknown versions", () => {
    localStorage.setItem("wandr_settings", "not json");
    expect(getTimeFormat()).toBe("24h");
    _resetSettingsCache();
    localStorage.setItem("wandr_settings", JSON.stringify({ v: 99, timeFormat: "12h" }));
    expect(getTimeFormat()).toBe("24h");
  });

  it("survives a missing localStorage entirely (node env)", () => {
    delete globalThis.localStorage;
    _resetSettingsCache();
    expect(getTimeFormat()).toBe("24h");
    expect(() => saveSettings({ timeFormat: "12h" })).not.toThrow();
  });
});

describe("formatTime honours the setting", () => {
  it("24h default is unchanged from the pre-setting behaviour", () => {
    expect(formatTime(9 * 60)).toBe("09:00");
    expect(formatTime(17 * 60 + 30)).toBe("17:30");
  });

  it("12h renders noon/midnight correctly", () => {
    saveSettings({ timeFormat: "12h" });
    expect(formatTime(0)).toBe("12:00 AM");
    expect(formatTime(12 * 60)).toBe("12:00 PM");
    expect(formatTime(17 * 60 + 30)).toBe("5:30 PM");
    expect(formatTime(9 * 60 + 5)).toBe("9:05 AM");
  });
});

describe("displayTime — render-time conversion", () => {
  it("re-expresses stored times in the active format, both directions", () => {
    expect(displayTime("5:30 PM")).toBe("17:30");   // legacy AM/PM shown as 24h
    saveSettings({ timeFormat: "12h" });
    expect(displayTime("17:30")).toBe("5:30 PM");   // stored 24h shown as 12h
  });

  it("passes non-clock strings through untouched", () => {
    expect(displayTime("Morning")).toBe("Morning");
    expect(displayTime("")).toBe("");
    expect(displayTime(null)).toBe(null);
  });

  it("resequenceTimes writes the active format but stays parseable either way", () => {
    saveSettings({ timeFormat: "12h" });
    const out = resequenceTimes([
      { id: 1, time: "17:30" }, { id: 2, time: "09:00" },
    ]);
    expect(out.map(a => a.time)).toEqual(["9:00 AM", "5:30 PM"]);
    // Round-trips back to 24h display if the user flips the setting again.
    saveSettings({ timeFormat: "24h" });
    expect(out.map(a => displayTime(a.time))).toEqual(["09:00", "17:30"]);
  });
});

describe("clearAllWandrData", () => {
  it("removes every wandr_* key and nothing else", () => {
    localStorage.setItem("wandr_trips", "{}");
    localStorage.setItem("wandr_plan_abc", "{}");
    localStorage.setItem("wandr_profile", "{}");
    localStorage.setItem("wandr_settings", "{}");
    localStorage.setItem("wandr_trip", "{}");           // legacy mirror
    localStorage.setItem("unrelated_key", "keep me");
    expect(clearAllWandrData()).toBe(5);
    expect(localStorage.getItem("unrelated_key")).toBe("keep me");
    expect(localStorage.getItem("wandr_trips")).toBeNull();
    expect(localStorage.getItem("wandr_plan_abc")).toBeNull();
  });

  it("resets the settings cache so defaults apply immediately after", () => {
    saveSettings({ timeFormat: "12h" });
    clearAllWandrData();
    expect(getTimeFormat()).toBe("24h");
  });

  it("returns 0 when storage is unavailable", () => {
    delete globalThis.localStorage;
    expect(clearAllWandrData()).toBe(0);
  });
});
