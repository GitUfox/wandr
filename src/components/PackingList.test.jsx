import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PackingList from "./PackingList.jsx";
import { seedPacking, toggleItem } from "../lib/packing.js";

// Packing screen (design pick 1C). Static markup only — the pane is the
// interaction check. Copy pinned as literals on purpose.

const trip = (o = {}) => ({
  id: "t-lisbon", destination: "Lisbon", tripStyle: "itinerary", nights: 4,
  answers: { dates: { start: "2099-10-24", end: "2099-10-28" }, interests: { chips: ["Beach"], text: "" } },
  ...o,
});
const render = (props) => renderToStaticMarkup(<PackingList onChange={() => {}} onBack={() => {}} trips={[]} {...props} />).replaceAll("&#x27;", "'").replaceAll("&amp;", "&");

describe("before the list exists — the seed card", () => {
  it("offers the starter list and shows the trip-aware adds with their reason", () => {
    const html = render({ trip: trip() });
    expect(html).toContain("Packing for Lisbon");
    expect(html).toContain("Starter list, 37 things. Counts follow your 4 nights.");
    expect(html).toContain("Added for Lisbon in October · autumn");
    expect(html).toContain("Light rain layer");
    expect(html).toContain("Quick-dry towel");
    expect(html).toContain(">Start packing<");
    expect(html).not.toContain("Use my list");
  });
  it("offers the previous trip's list when one exists, with the starter as the escape", () => {
    const porto = trip({ id: "t-porto", destination: "Porto", nights: 3 });
    const html = render({ trip: trip(), trips: [{ ...porto, packing: seedPacking(porto, null) }] });
    expect(html).toContain("Your list from <b");
    expect(html).toContain("Porto</b>");
    expect(html).toContain("Counts refit to 4 nights.");
    expect(html).toContain(">Use my list<");
    expect(html).toContain(">Starter list<");
  });
  it("a bucket trip (no dates) gets fixed counts and no season adds", () => {
    const html = render({ trip: trip({ tripStyle: "bucket", nights: null, answers: { dates: { bucket: true, now: "now" }, interests: { chips: [] } } }) });
    expect(html).toContain("Counts stay fixed");
    expect(html).not.toContain("Added for");
  });
});

describe("with a list — the ticket and the shelves", () => {
  const p = seedPacking(trip(), null);
  const html = render({ trip: trip({ packing: p }) });
  it("ticket: packed / to go stubs, the destination, the percent, the trip line", () => {
    expect(html).toContain(">Packed<");
    expect(html).toContain(">To go<");
    expect(html).toContain(">Lisbon</h1>");
    expect(html).toContain(">0%<");
    expect(html).toContain("4 nights");
    expect(html).toContain("OCT 24");
  });
  it("shelves use the day face with mono counts, and items carry their tags", () => {
    expect(html).toContain("Young Serif");
    expect(html).toContain(">Clothing</h2>");
    expect(html).toContain("0 / 11");               // 8 starter + rain layer + towel + flip-flops (swimsuit deduped)
    expect(html).toContain("Last call");
    expect(html).toContain("Added · autumn");
    expect(html).toContain("Added · Beach");
    expect(html).toContain("×5");                   // nights+1
  });
  it("status line counts what is left and what waits for the morning", () => {
    expect(html).toContain("things to pack.");
    expect(html).toContain("wait for the morning you leave.");
  });
  it("controls: four filters, search, new shelf, unpack and reset", () => {
    for (const s of [">All<", "To pack", ">Packed<", "Last call", "Find an item", "New shelf, like Beach or Camera", "Unpack everything", "Reset to the starter list"]) expect(html).toContain(s);
    expect(html).toContain("Back to the trip");
  });
  it("says bags closed once everything is packed", () => {
    let all = p;
    for (const s of all.shelves) for (const i of s.items) all = toggleItem(all, i.id);
    const done = render({ trip: trip({ packing: all }) });
    expect(done).toContain("Bags closed.");
    expect(done).toContain(">100%<");
  });
  it("every input is capped", () => {
    expect(html).toContain('maxLength="60"');
    expect(html).toContain('maxLength="40"');
  });
});
