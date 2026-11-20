/**
 * TripinLogo: the Transit Diagram mark and wordmark (redesign direction E).
 *
 * The mark is two day lines that meet at one station, on an ink tile.
 * It is built from code geometry only (rect, polyline, circle). Do not
 * replace it with hand-typed path data.
 *
 * Props:
 *   size   "xs" | "sm" | "md" | "lg"   (default "md")
 *   mark   bool                  show the mark tile (default true)
 *   word   bool                  show the wordmark (default true)
 */
import { T } from "../lib/constants.js";

const FONT_PX = { xs: 22, sm: 35, md: 53, lg: 74 };
const MIN_MARK_PX = 30; // the mark stays legible beside the xs wordmark

/** The mark alone. `px` is the tile's width and height. */
export function TripinMark({ px = 32, title }) {
  return (
    <svg
      width={px} height={px} viewBox="0 0 104 104" fill="none"
      role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}
      style={{ display: "block", flexShrink: 0 }}
    >
      <rect width="104" height="104" rx="22" fill={T.ink} />
      <polyline points="14,74 46,74 78,42" stroke={T.line[0]} strokeWidth="13" />
      <polyline points="52,14 52,90" stroke={T.markBlue} strokeWidth="13" />
      <circle cx="52" cy="68" r="12" fill={T.white} stroke={T.ink} strokeWidth="5" />
    </svg>
  );
}

export default function TripinLogo({ size = "md", mark = true, word = true }) {
  const fontSize = FONT_PX[size] || FONT_PX.md;
  return (
    <div
      role="img" aria-label="Tripin"
      style={{ display: "inline-flex", alignItems: "center", gap: Math.round(fontSize * 0.2), userSelect: "none" }}
    >
      {mark && <TripinMark px={Math.max(MIN_MARK_PX, Math.round(fontSize * 0.9))} />}
      {word && (
        <span aria-hidden="true" style={{
          fontFamily: T.fontHero, fontWeight: 900, fontSize, lineHeight: 1,
          letterSpacing: "-0.04em", color: T.ink,
        }}>Tripin</span>
      )}
    </div>
  );
}
