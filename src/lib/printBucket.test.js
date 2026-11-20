import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bucketPrintBody, bucketPlainText, bucketTicketRow, escapeHtml, printStation } from "./printBucket.js";
import StationSymbol, { STATION_KINDS } from "../components/StationSymbol.jsx";
import { T } from "./constants.js";

// Bucket export builders (2026-08-15, Kraig's prod report). Pure string
// builders — Dashboard owns the window, this owns what gets written.

const trip = {
  destination: "Porto, Portugal",
  tripStyle: "bucket",
  categories: {
    culture: [
      { name: "Livraria Lello", description: "Neo-gothic bookshop.", proTip: "Voucher online.", priority: "essential",
        verified: true, mapUrl: "https://www.google.com/maps/place/?q=place_id:abc", address: "R. das Carmelitas 144" },
      { name: "Sneaky <script>alert(1)</script>", description: 'He said "go" & left', priority: "optional" },
    ],
    nightlife: [
      { name: "Maus Hábitos", priority: "recommended",
        verified: true, mapUrl: "http://evil.example.com/maps", address: "Should not print" },
    ],
  },
  bucketPicks: { "culture:Livraria Lello": true },
};

describe("bucketPrintBody", () => {
  const html = bucketPrintBody(trip);

  it("renders shelves in canonical order with picked counts", () => {
    expect(html.indexOf("Culture")).toBeLessThan(html.indexOf("Nightlife"));
    expect(html).toContain("1 of 2 picked");
  });

  it("marks a picked idea with a filled station and leaves the rest as rings", () => {
    expect(html).toContain(printStation("done"));
    expect(html).toContain(printStation("stop"));
  });

  it("prints the grounded street address only when the map URL validated", () => {
    expect(html).toContain("R. das Carmelitas 144");
    expect(html).not.toContain("Should not print"); // bad host → address untrusted
  });

  it("escapes every model-authored string (document.write hardening)", () => {
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;go&quot; &amp; left");
  });

  it("prints priority as text, with the accent for essential", () => {
    expect(html).toContain('class="prio hot"');
    expect(html).toContain("essential");
    expect(html).not.toContain('class="chip');
  });
});

describe("bucketPlainText", () => {
  const text = bucketPlainText(trip);

  it("leads with destination and counts", () => {
    expect(text).toContain("Porto, Portugal — bucket list (3 ideas, 1 picked)");
  });

  it("uses checkbox marks that mirror the picks", () => {
    expect(text).toContain("[x] Livraria Lello");
    expect(text).toMatch(/\[ \] Maus Hábitos/);
  });

  it("includes tips and validated addresses, plain (no escaping)", () => {
    expect(text).toContain("Tip: Voucher online.");
    expect(text).toContain("R. das Carmelitas 144");
    expect(text).toContain('He said "go" & left');
    expect(text).not.toContain("Should not print");
  });
});

describe("bucketTicketRow (the trip strip rows for a bucket list)", () => {
  it("prints the counts and one station per idea, filled when picked", () => {
    const row = bucketTicketRow(9, 2);
    expect(row).toContain("9 ideas · 2 picked");
    expect(row.match(/<svg/g)).toHaveLength(9);
    expect(row.split(printStation("done", 10)).length - 1).toBe(2);
  });

  it("has no ticket parts (retired with the Transit Diagram redesign)", () => {
    const row = bucketTicketRow(9, 2);
    expect(row).not.toContain('class="perf"');
    expect(row).not.toContain("notch");
  });

  it("uses the singular for one idea", () => {
    expect(bucketTicketRow(1, 0)).toContain("1 idea · 0 picked");
  });

  it("never prints NaN for malformed counts", () => {
    const row = bucketTicketRow(undefined, null);
    expect(row).not.toContain("NaN");
    expect(row).toContain("0 ideas · 0 picked");
    expect(row).not.toContain("<svg");
  });

  it("caps the stations for a very long list", () => {
    expect(bucketTicketRow(200, 0).match(/<svg/g)).toHaveLength(24);
  });
});

describe("printStation matches the on-screen StationSymbol", () => {
  // The inner shapes must be the same on paper and on screen. Compare the
  // markup between the <svg ...> tags, with attribute spelling normalized.
  const inner = (markup) => markup.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")
    .replace(/stroke-width/g, "strokeWidth").replace(/><\/(circle|rect)>/g, "/>").replace(/\s*\/>/g, "/>");

  it.each(STATION_KINDS)("%s has the same geometry", (kind) => {
    const screen = renderToStaticMarkup(createElement(StationSymbol, { kind }));
    expect(inner(printStation(kind))).toBe(inner(screen));
  });

  it("falls back to a stop ring for an unknown kind", () => {
    expect(printStation("nope")).toBe(printStation("stop"));
  });

  it("uses token colors", () => {
    expect(printStation("book")).toContain(T.ink);
    expect(printStation("book")).toContain(T.white);
  });
});

describe("escapeHtml", () => {
  it("handles null and the four dangerous characters", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml('<a href="x">&</a>')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });
});
