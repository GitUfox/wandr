/**
 * App icon contract. Transit Diagram redesign, step 5.
 *
 * The mark exists in three places: TripinMark (screen), favicon.svg, and the
 * rasterizer in scripts/render-icons.mjs that draws the PNG icons. These
 * tests fail when the three disagree, or when a PNG in public/ is not the
 * current drawing. Fix: change all three, then run `npm run icons`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { T } from "./constants.js";
import { MARK, ICONS, colorAt, renderIcon, encodePng } from "../../scripts/render-icons.mjs";

const pts = (p) => p.map(([x, y]) => `${x},${y}`).join(" ");

/** Width, height and RGBA pixels of a PNG that this project wrote. */
function decodePng(buf) {
  const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20);
  const idat = [];
  for (let o = 8; o < buf.length;) {
    const len = buf.readUInt32BE(o), type = buf.toString("ascii", o + 4, o + 8);
    if (type === "IDAT") idat.push(buf.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(width * height * 4);
  for (let j = 0; j < height; j++) raw.copy(px, j * width * 4, j * (width * 4 + 1) + 1, (j + 1) * (width * 4 + 1));
  return { width, height, px, colorType: buf[25] };
}

describe("the mark is one geometry in three places", () => {
  const logo = readFileSync("src/components/TripinLogo.jsx", "utf8");
  const favicon = readFileSync("public/favicon.svg", "utf8");

  it("the rasterizer uses the same line points as the screen mark and the favicon", () => {
    for (const line of [MARK.red, MARK.blue]) {
      expect(logo).toContain(`points="${pts(line.points)}"`);
      expect(favicon).toContain(`points="${pts(line.points)}"`);
    }
  });

  it("the rasterizer uses the token colors", () => {
    expect(MARK.tile).toBe(T.ink);
    expect(MARK.red.color).toBe(T.line[0]);
    expect(MARK.blue.color).toBe(T.markBlue);
    expect(MARK.ring.fill.toLowerCase()).toBe(T.white.toLowerCase());
  });

  it("the station ring has the same center, radius and stroke", () => {
    const { cx, cy, r, stroke } = MARK.ring;
    expect(logo).toContain(`cx="${cx}" cy="${cy}" r="${r}"`);
    expect(logo).toContain(`strokeWidth="${stroke}"`);
    expect(favicon).toContain(`cx="${cx}" cy="${cy}" r="${r}"`);
  });
});

describe("the mark paints in SVG order", () => {
  it("the tile is the ground", () => {
    expect(colorAt(4, 4)).toBe(MARK.tile);
  });
  it("the station center is white and its ring is ink", () => {
    expect(colorAt(52, 68)).toBe(MARK.ring.fill);
    expect(colorAt(52, 68 - 12)).toBe(MARK.tile);
  });
  it("the red line runs left of the station and up to the right", () => {
    expect(colorAt(20, 74)).toBe(MARK.red.color);
    expect(colorAt(70, 50)).toBe(MARK.red.color);
  });
  it("the blue line is above the red line where they cross, outside the ring", () => {
    expect(colorAt(52, 20)).toBe(MARK.blue.color);
    expect(colorAt(52, 88)).toBe(MARK.blue.color);
  });
  it("the station ring covers the red corner, so the join style is not visible", () => {
    // The bend at (46,74) sits under the ring (center 52,68, outer radius 14.5).
    expect(colorAt(47, 79)).toBe(MARK.tile);
    expect(Math.hypot(46 - 52, 74 - 68)).toBeLessThan(MARK.ring.r + MARK.ring.stroke / 2);
  });
});

describe("the PNG files in public/", () => {
  it("lists the six icons the page and the manifest name", () => {
    const index = readFileSync("index.html", "utf8");
    const manifest = readFileSync("public/manifest.webmanifest", "utf8");
    for (const [name] of ICONS) expect(index + manifest).toContain(`/${name}`);
    expect(ICONS).toHaveLength(6);
  });

  it.each(ICONS)("%s is %ipx, opaque, and is the current drawing", (name, size, scale) => {
    const file = decodePng(readFileSync(`public/${name}`));
    expect(file.width).toBe(size);
    expect(file.height).toBe(size);
    expect(file.colorType).toBe(6);
    // Compare pixels, not bytes: zlib output can differ between Node versions.
    expect(file.px.equals(renderIcon(size, scale))).toBe(true);
    // No transparent pixel: a clear corner shows as black or white on a home screen.
    for (let o = 3; o < file.px.length; o += 4) if (file.px[o] !== 255) throw new Error(`${name} has a transparent pixel`);
  });

  it("the maskable icon keeps the mark inside the center 80%", () => {
    const size = 100, px = renderIcon(size, 0.72, 2), tile = [0x1A, 0x1A, 0x1A];
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      if (i >= 10 && i < 90 && j >= 10 && j < 90) continue;
      const o = (j * size + i) * 4;
      expect([px[o], px[o + 1], px[o + 2]]).toEqual(tile);
    }
  });

  it("encodePng writes a file that decodes to the same pixels", () => {
    const px = renderIcon(16);
    expect(decodePng(encodePng(16, px)).px.equals(px)).toBe(true);
  });
});
