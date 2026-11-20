/**
 * Look contract. Transit Diagram redesign (direction E).
 *
 * These checks read the component source. They pin the rules that a later
 * edit breaks without a visible error:
 *   1. No uppercase letterspaced labels (retired with the redesign).
 *   2. No dark color scheme on a form control (the ground is light).
 *   3. Every bottom sheet uses the shared backdrop and edge.
 *   4. The sign-in chip marker has no glow.
 *
 * PENDING lists files that are exempt. Every live screen is rebuilt, so the
 * list holds only the parked LoadingScreen. Do not add a live screen to it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const DIR = "src/components";
const PENDING = new Set(["LoadingScreen.jsx"]); // parked, unused, kept on disk
const files = readdirSync(DIR).filter(f => f.endsWith(".jsx") && !f.includes(".test.") && !PENDING.has(f));
const read = f => readFileSync(`${DIR}/${f}`, "utf8");

/** Dashboard.jsx also holds the PDF print template. The PDF is step 5. */
function screenSource(file) {
  const src = read(file);
  if (file !== "Dashboard.jsx") return src;
  const start = src.indexOf("function exportToPdf");
  const end = src.indexOf("  return (\n    <div style={{ minHeight:\"100vh\"");
  return start > -1 && end > start ? src.slice(0, start) + src.slice(end) : src;
}

describe("look contract: rebuilt screens", () => {
  it("covers the component folder", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(files)("%s has no uppercase label style", (file) => {
    expect(screenSource(file)).not.toMatch(/textTransform:\s*"uppercase"/);
  });

  it.each(files)("%s has no dark color scheme", (file) => {
    expect(screenSource(file)).not.toMatch(/colorScheme:\s*"dark"/);
  });
});

describe("look contract: sheets", () => {
  it.each(["EditTripSheet.jsx", "ProfileSheet.jsx", "SettingsSheet.jsx"])("%s uses the shared backdrop and edge", (file) => {
    const src = read(file);
    expect(src).toContain("sheetBackdropSt(open)");
    expect(src).toContain("...sheetEdgeSt");
  });
});

describe("look contract: sign-in chip", () => {
  it("has a plain marker, with no glow", () => {
    expect(read("ProfileChip.jsx")).not.toContain("box-shadow");
  });
});

describe("look contract: the PDF template", () => {
  const src = read("Dashboard.jsx");
  const start = src.indexOf("function exportToPdf");
  const pdf = src.slice(start, src.indexOf("  return (\n    <div style={{ minHeight:\"100vh\""));

  it("is found in the source", () => {
    expect(start).toBeGreaterThan(-1);
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it("asks the browser to print backgrounds (the lines and bars are backgrounds)", () => {
    expect(pdf).toContain("print-color-adjust: exact");
    expect(pdf).toContain("-webkit-print-color-adjust: exact");
  });

  it("builds the days from the same helpers as the screen", () => {
    expect(pdf).toContain("dayLineColor(dayIdx)");
    expect(pdf).toContain("stationKind(a.details, isLast)");
    expect(pdf).toContain("splitDetails(a.details)");
  });

  it("has no ticket, no uppercase label and no hand-typed path data", () => {
    expect(pdf).not.toContain('class="ticket"');
    expect(pdf).not.toContain("barcode");
    expect(pdf).not.toContain("text-transform: uppercase");
    expect(pdf).not.toContain("<path");
  });

  it("takes its colors from T, with no old accent", () => {
    expect(pdf).toContain("${T.ink}");
    expect(pdf).not.toMatch(/#c96442/i);
  });

  it("escapes model text before it reaches document.write", () => {
    expect(pdf).toContain("htmlEscape(day.label)");
    expect(pdf).toContain("htmlEscape(f.text)");
  });
});
