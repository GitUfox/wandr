import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BucketView } from "./ItineraryEditor.jsx";

// Render-level smoke test for the Buckets view (§6 #5). The bucketing logic
// itself is covered in utils.test.js; this verifies the component groups
// activities under the right headers and renders working move affordances.
// (No jsdom in this project — react-dom/server is enough to catch render
// crashes and confirm the grouped markup.)

const day = {
  label: "Day 1 — Test",
  activities: [
    { id: "a", time: "9:00 AM", title: "**Camelback Hike**", details: "Echo Canyon" },
    { id: "b", time: "2:00 PM", title: "**Golf at TPC**",   details: "18 holes" },
    { id: "c", time: "7:00 PM", title: "**Old Town Bars**",  details: "Cocktails" },
  ],
  food: [], tips: [], extras: [],
};

describe("BucketView", () => {
  const html = renderToStaticMarkup(<BucketView day={day} dayIdx={0} onMoveToBucket={() => {}} />);

  it("renders all three time-of-day bucket headers", () => {
    expect(html).toContain("Morning");
    expect(html).toContain("Afternoon");
    expect(html).toContain("Evening");
  });

  it("renders each activity's title", () => {
    expect(html).toContain("Camelback Hike");
    expect(html).toContain("Golf at TPC");
    expect(html).toContain("Old Town Bars");
  });

  it("renders activities in bucket order: Morning → Afternoon → Evening", () => {
    // Bucket names also appear in each card's move chips, so assert on the
    // activity titles' DOM order — the 9 AM item precedes the 2 PM item
    // precedes the 7 PM item because buckets render in that fixed order.
    const iHike = html.indexOf("Camelback Hike"); // 9 AM  → Morning
    const iGolf = html.indexOf("Golf at TPC");    // 2 PM  → Afternoon
    const iBars = html.indexOf("Old Town Bars");  // 7 PM  → Evening
    expect(iHike).toBeLessThan(iGolf);
    expect(iGolf).toBeLessThan(iBars);
  });

  it("renders move affordances (the 'Move to:' chips)", () => {
    expect(html).toContain("Move to:");
  });

  it("shows an empty-bucket placeholder when a bucket has no activities", () => {
    const emptyDay = { ...day, activities: [day.activities[0]] }; // Morning only
    const out = renderToStaticMarkup(<BucketView day={emptyDay} dayIdx={0} onMoveToBucket={() => {}} />);
    expect(out).toContain("Nothing planned.");
  });
});
