import { describe, it, expect } from "vitest";
import {
  normalizeVenueName,
  venueMatchScore,
  pickBestMatch,
  validatePlacesRequest,
  validateAutocompleteRequest,
  shapeResult,
  MATCH_THRESHOLD,
  MAX_VENUES_PER_REQUEST,
} from "./places-shared.js";

describe("normalizeVenueName", () => {
  it("lowercases, strips accents and punctuation, drops leading articles", () => {
    expect(normalizeVenueName("The Café Boulud")).toBe("cafe boulud");
    expect(normalizeVenueName("FUTURO")).toBe("futuro");
    expect(normalizeVenueName("Tom's Thumb Trailhead")).toBe("tom s thumb trailhead");
    expect(normalizeVenueName("A Bar Named Sue")).toBe("bar named sue");
  });

  it("handles junk safely", () => {
    expect(normalizeVenueName("")).toBe("");
    expect(normalizeVenueName(null)).toBe("");
    expect(normalizeVenueName(undefined)).toBe("");
  });
});

describe("venueMatchScore — the §12 contract cases", () => {
  it("Futuro vs Futile do NOT match (the original hallucination)", () => {
    expect(venueMatchScore("Futuro", "Futile Coffee")).toBeLessThan(MATCH_THRESHOLD);
    expect(venueMatchScore("Futile Coffee", "FUTURO")).toBeLessThan(MATCH_THRESHOLD);
  });

  it("accent/punctuation variants DO match", () => {
    expect(venueMatchScore("Café Boulud", "Cafe Boulud")).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it("official longer names match via containment", () => {
    // Google often returns the fuller official name — plain Jaccard would fail this.
    expect(
      venueMatchScore("Camelback Mountain", "Camelback Mountain Echo Canyon Trailhead")
    ).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it("sharing one generic word is not a match", () => {
    expect(venueMatchScore("Desert Botanical Garden", "Desert Museum")).toBeLessThan(MATCH_THRESHOLD);
  });

  it("a fragment candidate does NOT match — the 'The Coffee' live false positive (2026-08-13)", () => {
    // Google returned "The Coffee" for the hallucinated "Futile Coffee
    // Emporium"; the old bidirectional containment boost verified the fake
    // and attached a real venue's address to it. Containment must never
    // fire when the CANDIDATE is the contained side.
    expect(venueMatchScore("Futile Coffee Emporium", "The Coffee")).toBeLessThan(MATCH_THRESHOLD);
  });

  it("containment stays one-directional: query inside fuller official candidate still matches", () => {
    // The legit direction — model says the short name, Google returns the
    // fuller official one — must keep the boost even for single-token names.
    expect(venueMatchScore("Belcanto", "Belcanto by José Avillez")).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it("local name vs Google's English display name DOES match (Lisbon 0/3, 2026-08-13)", () => {
    // Google localizes displayName to English; the model writes local names.
    // Type-word canonicalization + connector stopwords bridge the gap.
    expect(venueMatchScore("Museu do Fado", "Fado Museum")).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(venueMatchScore("Museu Calouste Gulbenkian", "Calouste Gulbenkian Museum")).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(venueMatchScore("Palácio Nacional da Pena", "Pena Palace")).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it("type-word canonicalization does not merge distinct venues", () => {
    // Same type word, different identity — must still fail.
    expect(venueMatchScore("Museu do Fado", "Museu Nacional do Azulejo")).toBeLessThan(MATCH_THRESHOLD);
    expect(venueMatchScore("Mercado da Ribeira", "Mercado de Campo de Ourique")).toBeLessThan(MATCH_THRESHOLD);
  });

  it("identical names score 1", () => {
    expect(venueMatchScore("Heard Museum", "Heard Museum")).toBe(1);
  });

  it("empty inputs score 0", () => {
    expect(venueMatchScore("", "Heard Museum")).toBe(0);
    expect(venueMatchScore("Heard Museum", "")).toBe(0);
  });
});

describe("pickBestMatch", () => {
  const candidates = [
    { name: "Phoenix Art Museum",  placeId: "a" },
    { name: "Heard Museum",        placeId: "b" },
    { name: "Musical Instrument Museum", placeId: "c" },
  ];

  it("picks the best-scoring candidate above threshold", () => {
    expect(pickBestMatch("Heard Museum", candidates)?.placeId).toBe("b");
  });

  it("returns null when nothing clears the threshold", () => {
    expect(pickBestMatch("Futuro Coffee Roasters", candidates)).toBeNull();
  });

  it("returns null for empty candidate lists", () => {
    expect(pickBestMatch("Heard Museum", [])).toBeNull();
    expect(pickBestMatch("Heard Museum", undefined)).toBeNull();
  });
});

describe("validatePlacesRequest", () => {
  const good = { destination: "Phoenix, USA", venues: [{ name: "Heard Museum", category: "culture" }] };

  it("accepts a well-formed request", () => {
    expect(validatePlacesRequest(good)).toBeNull();
  });

  it("rejects missing/empty/oversize destination", () => {
    expect(validatePlacesRequest({ ...good, destination: "" })).toBeTruthy();
    expect(validatePlacesRequest({ ...good, destination: 42 })).toBeTruthy();
    expect(validatePlacesRequest({ ...good, destination: "x".repeat(121) })).toBeTruthy();
  });

  it("rejects empty, non-array, or oversized venue lists", () => {
    expect(validatePlacesRequest({ ...good, venues: [] })).toBeTruthy();
    expect(validatePlacesRequest({ ...good, venues: "nope" })).toBeTruthy();
    const tooMany = Array.from({ length: MAX_VENUES_PER_REQUEST + 1 },
      () => ({ name: "x", category: "culture" }));
    expect(validatePlacesRequest({ ...good, venues: tooMany })).toBeTruthy();
  });

  it("accepts exactly the max batch size", () => {
    const max = Array.from({ length: MAX_VENUES_PER_REQUEST },
      () => ({ name: "x", category: "culture" }));
    expect(validatePlacesRequest({ ...good, venues: max })).toBeNull();
  });

  it("rejects malformed venue entries", () => {
    expect(validatePlacesRequest({ ...good, venues: [{ name: "", category: "culture" }] })).toBeTruthy();
    expect(validatePlacesRequest({ ...good, venues: [{ name: "ok" }] })).toBeTruthy();
    expect(validatePlacesRequest({ ...good, venues: [{ name: "x".repeat(161), category: "c" }] })).toBeTruthy();
  });

  it("rejects a null body", () => {
    expect(validatePlacesRequest(null)).toBeTruthy();
    expect(validatePlacesRequest(undefined)).toBeTruthy();
  });
});

describe("shapeResult", () => {
  const venue = { name: "Heard Museum", category: "culture" };
  const match = {
    name: "Heard Museum", address: "2301 N Central Ave, Phoenix, AZ",
    placeId: "pid123", location: { lat: 33.47, lng: -112.07 },
    businessStatus: "OPERATIONAL",
  };

  it("no match → unverified with reason", () => {
    expect(shapeResult(venue, null)).toEqual(
      { name: "Heard Museum", category: "culture", verified: false, reason: "no-match" });
  });

  it("closed venue → found but NOT verified (never send travelers to a closed place)", () => {
    const r = shapeResult(venue, { ...match, businessStatus: "CLOSED_PERMANENTLY" });
    expect(r.verified).toBe(false);
    expect(r.reason).toBe("closed");
  });

  it("operational match → verified with canonical identity + map link", () => {
    const r = shapeResult(venue, match);
    expect(r.verified).toBe(true);
    expect(r.canonicalName).toBe("Heard Museum");
    expect(r.address).toMatch(/Central Ave/);
    expect(r.mapUrl).toContain("query_place_id=pid123");
    expect(r.location).toEqual({ lat: 33.47, lng: -112.07 });
    // Original name is preserved — phase 1 never renames (see places.js header).
    expect(r.name).toBe("Heard Museum");
  });
});

// ── validateAutocompleteRequest (destination autocomplete, 5A) ────────────────

describe("validateAutocompleteRequest", () => {
  it("accepts a plain 2..80-char input", () => {
    expect(validateAutocompleteRequest({ autocomplete: "ba" })).toBeNull();
    expect(validateAutocompleteRequest({ autocomplete: "Bangkok" })).toBeNull();
  });

  it("rejects missing, short, long, or non-string input", () => {
    expect(validateAutocompleteRequest({})).toBe("Invalid request.");
    expect(validateAutocompleteRequest({ autocomplete: "b" })).toBe("Invalid request.");
    expect(validateAutocompleteRequest({ autocomplete: " " })).toBe("Invalid request.");
    expect(validateAutocompleteRequest({ autocomplete: "x".repeat(81) })).toBe("Invalid request.");
    expect(validateAutocompleteRequest({ autocomplete: 42 })).toBe("Invalid request.");
    expect(validateAutocompleteRequest(null)).toBe("Invalid request.");
  });
});
