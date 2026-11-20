/**
 * Type-system contract. Transit Diagram redesign (2026-11-20, direction E).
 *
 * Screen and PDF are two renderers of the same trip. These tests pin the
 * pieces that drift silently:
 *   1. The role tokens exist on T and all resolve to Figtree.
 *   2. index.html loads Figtree at the weights the roles use.
 *   3. The PDF print template loads the SAME face. The print window is its
 *      own document. Nothing from index.html reaches it.
 *   4. No retired face is still referenced on either renderer.
 *   5. The print gate still waits on fonts.ready before print().
 *   6. The selected-state and day-line color tokens exist.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { T } from "./constants.js";

const indexHtml = readFileSync("index.html", "utf8");
const dashboard = readFileSync("src/components/Dashboard.jsx", "utf8");
const RETIRED = ["Manrope", "Instrument Serif", "Young Serif", "Martian Mono"];

describe("type role tokens", () => {
  it("resolves the base and all four roles to Figtree", () => {
    for (const stack of [T.font, T.fontHero, T.fontDay, T.fontProse, T.fontMono]) {
      expect(stack).toContain("Figtree");
    }
  });

  it("gives every role a non-webfont fallback", () => {
    for (const stack of [T.fontHero, T.fontDay, T.fontProse, T.fontMono]) {
      expect(stack).toMatch(/,/); // never a bare single family
    }
  });
});

describe("index.html loads the face the tokens reference", () => {
  const link = indexHtml.match(/fonts\.googleapis\.com\/css2\?[^"]+/)?.[0] || "";

  it("requests Figtree as a weight range that covers 400 to 900", () => {
    expect(link).toContain("family=Figtree:wght@300..900");
  });

  it("no longer requests a retired face", () => {
    for (const face of RETIRED) expect(link).not.toContain(face.replace(/ /g, "+"));
    expect(indexHtml).not.toContain("erode-");
  });
});

describe("PDF export loads the same face (print window is its own document)", () => {
  const link = dashboard.match(/fonts\.googleapis\.com\/css2\?[^"]+/)?.[0] || "";

  it("requests Figtree in the print template, with the bold weights", () => {
    expect(link).toContain("family=Figtree");
    expect(link).toContain("900");
  });

  it("uses Figtree in the print CSS and no retired face", () => {
    expect(dashboard).toMatch(/font-family:\s*'Figtree'/);
    for (const face of RETIRED) {
      expect(dashboard).not.toMatch(new RegExp(`font-family:\\s*'${face}'`));
    }
    expect(dashboard).not.toMatch(/font-family:\s*'Erode'/);
  });

  it("still gates print() on fonts.ready", () => {
    expect(dashboard).toContain("fonts?.ready");
  });
});

describe("Transit Diagram color tokens", () => {
  it("defines the selected-state pair", () => {
    expect(T.accentSoft).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(T.accentInk).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("defines five day line colors, the first equal to the accent", () => {
    expect(T.line).toHaveLength(5);
    expect(T.line[0]).toBe(T.accent);
  });
});
