import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { T } from "../lib/constants.js";
import TripinLogo, { TripinMark } from "./TripinLogo.jsx";
import StationSymbol, { STATION_KINDS } from "./StationSymbol.jsx";

// Transit Diagram identity (redesign direction E, step 2).

describe("TripinLogo", () => {
  const html = renderToStaticMarkup(<TripinLogo size="lg" />);

  it("renders the Tripin wordmark with one accessible name", () => {
    expect(html).toContain(">Tripin</span>");
    expect(html).toContain('aria-label="Tripin"');
  });

  it("uses the hero face at weight 900", () => {
    expect(html).toContain("font-weight:900");
    expect(html).toContain("Figtree");
  });

  it("can render the wordmark with no mark", () => {
    expect(renderToStaticMarkup(<TripinLogo mark={false} />)).not.toContain("<svg");
  });

  it("scales by size", () => {
    expect(renderToStaticMarkup(<TripinLogo size="sm" />)).toContain("font-size:35px");
    expect(html).toContain("font-size:74px");
  });
});

describe("TripinMark", () => {
  const svg = renderToStaticMarkup(<TripinMark px={40} />);

  it("is built from primitives only, with no hand-typed path data", () => {
    expect(svg).not.toContain("<path");
    expect(svg).toContain("<polyline");
    expect(svg).toContain("<circle");
  });

  it("takes its colors from T", () => {
    expect(svg).toContain(T.ink);
    expect(svg).toContain(T.line[0]);
    expect(svg).toContain(T.markBlue);
  });

  it("matches the favicon geometry and colors", () => {
    const favicon = readFileSync("public/favicon.svg", "utf8");
    for (const points of ["14,74 46,74 78,42", "52,14 52,90"]) {
      expect(svg).toContain(points);
      expect(favicon).toContain(points);
    }
    for (const color of [T.ink, T.line[0], T.markBlue]) expect(favicon).toContain(color);
  });
});

describe("StationSymbol", () => {
  it("renders each of the four kinds as a distinct shape", () => {
    const shapes = STATION_KINDS.map(kind => renderToStaticMarkup(<StationSymbol kind={kind} />));
    expect(new Set(shapes).size).toBe(4);
    for (const s of shapes) expect(s).not.toContain("<path");
  });

  it("falls back to a stop ring for an unknown kind", () => {
    expect(renderToStaticMarkup(<StationSymbol kind="nope" />))
      .toBe(renderToStaticMarkup(<StationSymbol kind="stop" />));
  });

  it("is decorative: hidden from assistive technology", () => {
    expect(renderToStaticMarkup(<StationSymbol />)).toContain('aria-hidden="true"');
  });
});

describe("user-facing name", () => {
  it("is Tripin in the page title and the manifest", () => {
    expect(readFileSync("index.html", "utf8")).toContain("<title>Tripin");
    const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
    expect(manifest.short_name).toBe("Tripin");
  });
});
