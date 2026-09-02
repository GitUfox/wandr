/**
 * Editorial Pass type-system contract (2026-09-02, board picks 1B+2A+3B+4A).
 *
 * Screen and PDF are two renderers of the same trip — these tests pin the
 * pieces that would drift silently:
 *   1. The role tokens exist in T and name the agreed faces.
 *   2. index.html actually loads every face a token references (Google css2
 *      for Instrument/Young/Martian, self-hosted woff2 for Erode).
 *   3. The PDF export's print template loads the SAME faces — the print
 *      window is its own document; nothing from index.html reaches it.
 *   4. The Erode files the @font-face rules point at exist on disk.
 *   5. The print gate still waits on fonts.ready before print() — without it
 *      the dialog snapshots fallback fonts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { T } from "./constants.js";

const indexHtml = readFileSync("index.html", "utf8");
const dashboard = readFileSync("src/components/Dashboard.jsx", "utf8");

describe("type role tokens", () => {
  it("defines the four Editorial Pass roles on T", () => {
    expect(T.fontHero).toContain("Instrument Serif");
    expect(T.fontDay).toContain("Young Serif");
    expect(T.fontProse).toContain("Erode");
    expect(T.fontMono).toContain("Martian Mono");
  });

  it("keeps Manrope as the UI base (pick 4A)", () => {
    expect(T.font).toContain("Manrope");
  });

  it("gives every webfont a non-webfont fallback", () => {
    for (const stack of [T.fontHero, T.fontDay, T.fontProse, T.fontMono]) {
      expect(stack).toMatch(/,/); // never a bare single family
    }
  });
});

describe("index.html loads every face the tokens reference", () => {
  it("requests Instrument Serif, Young Serif and Martian Mono from Google", () => {
    const link = indexHtml.match(/fonts\.googleapis\.com\/css2\?[^"]+/)?.[0] || "";
    expect(link).toContain("family=Instrument+Serif");
    expect(link).toContain("family=Young+Serif");
    expect(link).toContain("family=Martian+Mono");
    expect(link).toContain("family=Manrope");
  });

  it("declares self-hosted Erode at 500 and 600", () => {
    expect(indexHtml).toContain("/fonts/erode-500.woff2");
    expect(indexHtml).toContain("/fonts/erode-600.woff2");
  });

  it("ships the Erode files those rules point at", () => {
    expect(existsSync("public/fonts/erode-500.woff2")).toBe(true);
    expect(existsSync("public/fonts/erode-600.woff2")).toBe(true);
  });
});

describe("PDF export loads the same faces (print window is its own document)", () => {
  it("requests the three Google faces in the print template", () => {
    const link = dashboard.match(/fonts\.googleapis\.com\/css2\?[^"]+/)?.[0] || "";
    expect(link).toContain("family=Instrument+Serif");
    expect(link).toContain("family=Young+Serif");
    expect(link).toContain("family=Martian+Mono");
  });

  it("declares Erode with an absolute origin URL (about:blank has no base)", () => {
    expect(dashboard).toContain("${location.origin}/fonts/erode-500.woff2");
    expect(dashboard).toContain("${location.origin}/fonts/erode-600.woff2");
  });

  it("uses each role face in the print CSS", () => {
    // The template is a string in source — presence of the family name in a
    // font-family declaration is the drift signal we care about.
    expect(dashboard).toMatch(/font-family:\s*'Instrument Serif'/);
    expect(dashboard).toMatch(/font-family:\s*'Young Serif'/);
    expect(dashboard).toMatch(/font-family:\s*'Erode'/);
    expect(dashboard).toMatch(/font-family:\s*'Martian Mono'/);
  });

  it("still gates print() on fonts.ready", () => {
    expect(dashboard).toContain("fonts?.ready");
  });
});
