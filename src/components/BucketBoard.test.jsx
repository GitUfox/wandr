import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BucketBoard from "./BucketBoard.jsx";

// Render-level tests for the bucket-mode dashboard surface (2026-08-15).
// Same pattern as ItineraryEditor.test.jsx: static markup, assert structure.

const trip = {
  tripStyle: "bucket",
  categories: {
    culture: [
      { name: "Livraria Lello", description: "Neo-gothic bookshop.", proTip: "Buy the entry voucher online.", priority: "essential",
        verified: true, mapUrl: "https://www.google.com/maps/place/?q=place_id:abc", address: "R. das Carmelitas 144" },
      { name: "Casa da Música", description: "Concert hall.", priority: "recommended" },
    ],
    nightlife: [
      { name: "Maus Hábitos", description: "Multi-floor cultural bar.", priority: "optional",
        verified: true, mapUrl: "http://evil.example.com/maps" }, // wrong scheme/host — must not link
    ],
    junk: "not an array",
  },
  bucketPicks: { "culture:Livraria Lello": true },
};

describe("BucketBoard", () => {
  const html = renderToStaticMarkup(<BucketBoard trip={trip} onTogglePick={() => {}} />);

  it("renders shelves in canonical order (culture before nightlife)", () => {
    expect(html.indexOf("Culture")).toBeGreaterThan(-1);
    expect(html.indexOf("Nightlife")).toBeGreaterThan(-1);
    expect(html.indexOf("Culture")).toBeLessThan(html.indexOf("Nightlife"));
  });

  it("shows overall and per-shelf picked counts", () => {
    expect(html).toContain("1 of 3 picked");   // status row
    expect(html).toContain("1 of 2 picked");   // culture shelf
  });

  it("marks the picked ring pressed and the others not", () => {
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Remove Livraria Lello from my list");
    expect(html).toContain("Add Casa da Música to my list");
  });

  it("links Map only for venues with a validated google.com/maps URL", () => {
    expect(html).toContain('href="https://www.google.com/maps/place/?q=place_id:abc"');
    expect(html).not.toContain("evil.example.com");
  });

  it("renders the proTip and priority badges", () => {
    expect(html).toContain("Buy the entry voucher online.");
    expect(html).toContain("essential");
    expect(html).toContain("recommended");
  });

  it("never renders date words — the mode has no date DNA", () => {
    for (const word of ["Depart", "Return", "nights", "departs"]) {
      expect(html).not.toContain(word);
    }
  });

  it("shows the rebuild hint when the curation produced nothing", () => {
    const empty = renderToStaticMarkup(<BucketBoard trip={{ tripStyle: "bucket", categories: {} }} />);
    expect(empty).toContain("No ideas landed");
    expect(empty).toContain("Rebuild");
  });
});

describe("BucketBoard — non-canonical category tolerance", () => {
  // The first live build returned interest-named keys (museums/live_music)
  // despite the schema pin. The prompt now enforces the keys; the board keeps
  // rendering whatever arrives, with readable labels.
  const deviantTrip = {
    tripStyle: "bucket",
    categories: { live_music: [{ name: "Casa da Música", priority: "recommended" }] },
    bucketPicks: {},
  };
  const html = renderToStaticMarkup(<BucketBoard trip={deviantTrip} onTogglePick={() => {}} />);

  it("renders unknown categories instead of dropping the ideas", () => {
    expect(html).toContain("Casa da Música");
  });

  it("prettifies snake_case keys into readable shelf labels", () => {
    expect(html).toContain("Live music");
    expect(html).not.toContain("live_music<");
  });
});
