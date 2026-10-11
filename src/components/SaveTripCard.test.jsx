import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SaveTripCard from "./SaveTripCard.jsx";
import { showSaveTripCard } from "../lib/utils.js";

// Save-this-trip card (spec P0-2). Copy pinned as literals on purpose.

const acct = (o = {}) => ({ configured: true, email: null, ...o });
const trip = { id: "t1", destination: "Lisbon" };

describe("showSaveTripCard — when the ask is honest", () => {
  it("shows once: a built trip, signed out, not dismissed", () => {
    expect(showSaveTripCard({ trip, account: acct(), dismissed: false })).toBe(true);
  });
  it("never after a dismiss", () => {
    expect(showSaveTripCard({ trip, account: acct(), dismissed: true })).toBe(false);
  });
  it("never when signed in", () => {
    expect(showSaveTripCard({ trip, account: acct({ email: "k@x.co" }), dismissed: false })).toBe(false);
  });
  it("never while building, after a failed build, or without a trip", () => {
    expect(showSaveTripCard({ trip: { ...trip, _building: true }, account: acct(), dismissed: false })).toBe(false);
    expect(showSaveTripCard({ trip: { ...trip, _error: true }, account: acct(), dismissed: false })).toBe(false);
    expect(showSaveTripCard({ trip: null, account: acct(), dismissed: false })).toBe(false);
  });
  it("never on builds without accounts", () => {
    expect(showSaveTripCard({ trip, account: acct({ configured: false }), dismissed: false })).toBe(false);
  });
});

describe("SaveTripCard — what the traveler reads", () => {
  const html = renderToStaticMarkup(<SaveTripCard onSignIn={() => {}} onDismiss={() => {}} />).replaceAll("&#x27;", "'");
  it("uses the literal title and says what sign-in adds", () => {
    expect(html).toContain("Save this trip");
    expect(html).toContain("It's saved on this device. Sign in and it's on your phone and laptop too. One email, no password.");
  });
  it("offers Sign in and a permanent Maybe later", () => {
    expect(html).toContain(">Sign in<");
    expect(html).toContain(">Maybe later<");
  });
});
