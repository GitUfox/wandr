import { describe, it, expect } from "vitest";
import { mergeTrips, pickProfile } from "./sync.js";

// The merge core is where sync can destroy data — every rule gets a test.
// Shapes mirror production: local trips carry savedAt (ISO, "Z"), remote rows
// carry saved_at (Postgres timestamptz, often "+00:00" — NOT lexically
// comparable to "Z" strings, which is why the merge parses dates).

const lt = (id, savedAt, extra = {}) => ({ id, savedAt, destination: id, ...extra });
const rr = (id, saved_at, data = {}, plan = null) =>
  ({ id, saved_at, data: { id, savedAt: saved_at, destination: id, ...data }, plan });

describe("mergeTrips — last-write-wins per trip", () => {
  it("keeps local when newer, pushes it", () => {
    const { merged, pushIds } = mergeTrips(
      [lt("a", "2026-08-02T10:00:00Z", { tagline: "local-edit" })],
      [rr("a", "2026-08-01T10:00:00+00:00")],
      []);
    expect(merged).toHaveLength(1);
    expect(merged[0].tagline).toBe("local-edit");
    expect(pushIds).toEqual(["a"]);
  });

  it("adopts remote when newer, does not push", () => {
    const { merged, pushIds } = mergeTrips(
      [lt("a", "2026-08-01T10:00:00Z")],
      [rr("a", "2026-08-02T10:00:00+00:00", { tagline: "other-device" })],
      []);
    expect(merged[0].tagline).toBe("other-device");
    expect(pushIds).toEqual([]);
  });

  it("compares across timestamp formats correctly (Z vs +00:00)", () => {
    // Same instant in both formats — lexical comparison would call these
    // different; the merge must treat them as equal (keep local, no push).
    const { merged, pushIds } = mergeTrips(
      [lt("a", "2026-08-02T10:00:00Z", { tagline: "keep-me" })],
      [rr("a", "2026-08-02T10:00:00+00:00")],
      []);
    expect(merged[0].tagline).toBe("keep-me");
    expect(pushIds).toEqual([]);
  });

  it("uploads local-only trips and downloads remote-only trips", () => {
    const { merged, pushIds } = mergeTrips(
      [lt("localonly", "2026-08-02T10:00:00Z")],
      [rr("remoteonly", "2026-08-01T10:00:00Z", {}, { planText: "## Day 1" })],
      []);
    expect(merged.map(t => t.id).sort()).toEqual(["localonly", "remoteonly"]);
    expect(pushIds).toEqual(["localonly"]);
    // The downloaded trip carries its plan for the caller to write locally.
    expect(merged.find(t => t.id === "remoteonly")._plan).toEqual({ planText: "## Day 1" });
  });

  it("returns the store oldest-first (the shape tripStore persists)", () => {
    const { merged } = mergeTrips(
      [lt("new", "2026-08-03T00:00:00Z")],
      [rr("old", "2026-08-01T00:00:00Z")],
      []);
    expect(merged.map(t => t.id)).toEqual(["old", "new"]);
  });
});

describe("mergeTrips — tombstones (offline deletes must not resurrect)", () => {
  it("a tombstone kills the remote copy and schedules its server delete", () => {
    const { merged, deleteRemote, clearTombs } = mergeTrips(
      [],
      [rr("dead", "2026-08-01T10:00:00Z")],
      [{ id: "dead", at: "2026-08-02T10:00:00Z" }]);
    expect(merged).toEqual([]);              // the delete does NOT resurrect
    expect(deleteRemote).toEqual(["dead"]);
    expect(clearTombs).toEqual([]);          // cleared only after the server delete succeeds
  });

  it("a remote copy saved AFTER the deletion wins — genuine re-save elsewhere", () => {
    const { merged, deleteRemote, clearTombs } = mergeTrips(
      [],
      [rr("back", "2026-08-03T10:00:00Z", { tagline: "resaved" })],
      [{ id: "back", at: "2026-08-02T10:00:00Z" }]);
    expect(merged.map(t => t.id)).toEqual(["back"]);
    expect(merged[0].tagline).toBe("resaved");
    expect(deleteRemote).toEqual([]);
    expect(clearTombs).toEqual(["back"]);    // tombstone spent
  });

  it("a tombstone with nothing left to delete is retired", () => {
    const { deleteRemote, clearTombs } = mergeTrips([], [],
      [{ id: "gone", at: "2026-08-02T10:00:00Z" }]);
    expect(deleteRemote).toEqual([]);
    expect(clearTombs).toEqual(["gone"]);
  });

  it("a tombstone also drops any stale local copy (delete recorded on another tab)", () => {
    const { merged } = mergeTrips(
      [lt("dead", "2026-08-01T09:00:00Z")],
      [],
      [{ id: "dead", at: "2026-08-02T10:00:00Z" }]);
    expect(merged).toEqual([]);
  });
});

describe("mergeTrips — hostile inputs", () => {
  it("handles empty and missing inputs", () => {
    expect(mergeTrips([], [], []).merged).toEqual([]);
    expect(mergeTrips(null, null, null).merged).toEqual([]);
  });

  it("treats unparseable dates as epoch rather than throwing", () => {
    const { merged, pushIds } = mergeTrips(
      [lt("a", "not a date")],
      [rr("a", "2026-08-02T10:00:00Z", { tagline: "remote-wins" })],
      []);
    expect(merged[0].tagline).toBe("remote-wins");
    expect(pushIds).toEqual([]);
  });
});

describe("pickProfile", () => {
  const p = (savedAt, tag) => ({ version: 1, savedAt, tag });

  it("first sign-in on a fresh device adopts the remote profile", () => {
    const r = pickProfile(null, p("2026-08-01T00:00:00Z", "remote"));
    expect(r.winner.tag).toBe("remote");
    expect(r.push).toBe(false);
  });

  it("first sync of a local-only profile uploads it", () => {
    const r = pickProfile(p("2026-08-01T00:00:00Z", "local"), null);
    expect(r.winner.tag).toBe("local");
    expect(r.push).toBe(true);
  });

  it("newer side wins in both directions; equal timestamps don't push", () => {
    expect(pickProfile(p("2026-08-02T00:00:00Z", "L"), p("2026-08-01T00:00:00Z", "R"))).toMatchObject({ winner: { tag: "L" }, push: true });
    expect(pickProfile(p("2026-08-01T00:00:00Z", "L"), p("2026-08-02T00:00:00Z", "R"))).toMatchObject({ winner: { tag: "R" }, push: false });
    expect(pickProfile(p("2026-08-01T00:00:00Z", "L"), p("2026-08-01T00:00:00+00:00", "R"))).toMatchObject({ winner: { tag: "L" }, push: false });
  });

  it("no profile anywhere → nothing to do", () => {
    expect(pickProfile(null, null)).toEqual({ winner: null, push: false });
  });
});
