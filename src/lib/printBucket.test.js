import { describe, it, expect } from "vitest";
import { bucketPrintBody, bucketPlainText, bucketTicketRow, escapeHtml } from "./printBucket.js";

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

  it("marks picked rings and leaves the rest empty", () => {
    expect(html).toContain('class="bring on"');
    expect(html).toContain('class="bring"');
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

  it("carries priority chips, hot for essential", () => {
    expect(html).toContain('chip hot');
    expect(html).toContain("essential");
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

describe("bucketTicketRow", () => {
  it("seats IDEAS/PICKED around the shared earth string", () => {
    const row = bucketTicketRow(9, 2, "<svg>EARTH</svg>");
    expect(row).toContain("Ideas");
    expect(row).toContain(">9<");
    expect(row).toContain("Picked");
    expect(row).toContain(">2<");
    expect(row).toContain("<svg>EARTH</svg>");
    expect(row).toContain('class="perf"');
  });

  it("never prints NaN for malformed counts", () => {
    const row = bucketTicketRow(undefined, null, "");
    expect(row).not.toContain("NaN");
    expect(row).toContain(">0<");
  });
});

describe("escapeHtml", () => {
  it("handles null and the four dangerous characters", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml('<a href="x">&</a>')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });
});
