/**
 * render-icons — draws the PNG favicons and PWA icons from the Tripin mark.
 *
 * Run: npm run icons
 *
 * The mark is code geometry (one tile, two lines, one station ring). This
 * script rasterizes that geometry itself and writes the PNG bytes with Node's
 * built-in zlib. It has no dependency and no install script, so it obeys the
 * .npmrc `ignore-scripts=true` rule. The geometry constants below repeat
 * TripinMark (src/components/TripinLogo.jsx) and public/favicon.svg.
 * scripts.test.js compares them, so a change to the mark in one place fails
 * the suite until all three agree and the icons are drawn again.
 *
 * The PNG tiles are full squares with no rounded corners and no transparent
 * pixels. iOS and Android cut their own corner shape, and a transparent
 * corner shows as black or white on a home screen.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The mark, in the 104-unit box that the SVG uses. */
export const MARK = {
  box: 104,
  tile: "#1A1A1A",
  red:  { color: "#E3262F", width: 13, points: [[14, 74], [46, 74], [78, 42]] },
  blue: { color: "#3D8BFF", width: 13, points: [[52, 14], [52, 90]] },
  ring: { cx: 52, cy: 68, r: 12, stroke: 5, fill: "#FFFFFF" },
};

/** Every icon file: name, pixel size, and the content scale. */
export const ICONS = [
  ["favicon-16.png", 16, 1],
  ["favicon-32.png", 32, 1],
  ["apple-touch-icon.png", 180, 1],
  ["icon-192.png", 192, 1],
  ["icon-512.png", 512, 1],
  // Maskable: the launcher may crop to the center 80%. Draw the lines at 72%.
  ["icon-maskable-512.png", 512, 0.72],
];

const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

/** True if (x, y) is in the butt-capped stroke of segment a→b. */
function inSegment(x, y, a, b, half) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const t = ((x - a[0]) * dx + (y - a[1]) * dy) / len;      // along the segment
  const d = Math.abs((x - a[0]) * dy - (y - a[1]) * dx) / len; // across it
  return t >= 0 && t <= len && d <= half;
}

/** True if (x, y) is in the convex quad p (any winding). */
function inQuad(x, y, p) {
  let sign = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (Math.abs(c) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(c); else if (Math.sign(c) !== sign) return false;
  }
  return true;
}

/** The miter join at vertex v between a→v and v→b: one quad per side. */
function miterQuads(a, v, b, half) {
  const unit = (p, q) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]); return [(q[0] - p[0]) / l, (q[1] - p[1]) / l]; };
  const d1 = unit(a, v), d2 = unit(v, b);
  const n1 = [-d1[1], d1[0]], n2 = [-d2[1], d2[0]];
  const k = 1 + n1[0] * n2[0] + n1[1] * n2[1];
  if (k < 1e-6) return [];
  return [1, -1].map(s => [
    v,
    [v[0] + s * n1[0] * half, v[1] + s * n1[1] * half],
    [v[0] + s * (n1[0] + n2[0]) / k * half, v[1] + s * (n1[1] + n2[1]) / k * half],
    [v[0] + s * n2[0] * half, v[1] + s * n2[1] * half],
  ]);
}

function inPolyline(x, y, line) {
  const half = line.width / 2, p = line.points;
  for (let i = 0; i + 1 < p.length; i++) if (inSegment(x, y, p[i], p[i + 1], half)) return true;
  for (let i = 1; i + 1 < p.length; i++) {
    for (const quad of miterQuads(p[i - 1], p[i], p[i + 1], half)) if (inQuad(x, y, quad)) return true;
  }
  return false;
}

/** The color of the mark at a point in the 104-unit box. Paint order = SVG order. */
export function colorAt(x, y) {
  const { ring } = MARK;
  const dr = Math.hypot(x - ring.cx, y - ring.cy);
  if (dr <= ring.r - ring.stroke / 2) return ring.fill;
  if (dr <= ring.r + ring.stroke / 2) return MARK.tile;
  if (inPolyline(x, y, MARK.blue)) return MARK.blue.color;
  if (inPolyline(x, y, MARK.red)) return MARK.red.color;
  return MARK.tile;
}

/** RGBA pixels for one icon. `scale` shrinks the lines about the center. */
export function renderIcon(size, scale = 1, samples = 4) {
  const px = Buffer.alloc(size * size * 4);
  const unit = MARK.box / size, c = MARK.box / 2;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0;
      for (let sj = 0; sj < samples; sj++) {
        for (let si = 0; si < samples; si++) {
          const x = c + ((i + (si + 0.5) / samples) * unit - c) / scale;
          const y = c + ((j + (sj + 0.5) / samples) * unit - c) / scale;
          const inBox = x >= 0 && x <= MARK.box && y >= 0 && y <= MARK.box;
          const [cr, cg, cb] = hex(inBox ? colorAt(x, y) : MARK.tile);
          r += cr; g += cg; b += cb;
        }
      }
      const n = samples * samples, o = (j * size + i) * 4;
      px[o] = Math.round(r / n); px[o + 1] = Math.round(g / n); px[o + 2] = Math.round(b / n); px[o + 3] = 255;
    }
  }
  return px;
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

/** PNG bytes for 8-bit RGBA pixels. */
export function encodePng(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits per channel, RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let j = 0; j < size; j++) px.copy(raw, j * (size * 4 + 1) + 1, j * size * 4, (j + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [name, size, scale] of ICONS) {
    const png = encodePng(size, renderIcon(size, scale));
    writeFileSync(new URL(`../public/${name}`, import.meta.url), png);
    console.log(`${name}  ${size}x${size}  ${png.length} bytes`);
  }
}
