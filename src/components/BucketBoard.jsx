/**
 * BucketBoard — the dashboard surface for Bucket List mode (2026-08-15).
 *
 * Kraig's model, verbatim: "the bucket approach doesn't have a date attached
 * to it. It is activities." So this board renders the trip DB exactly as the
 * AI curated it — category shelves, no schedule, no times — and the one
 * interaction is the check ring: picked = "I want to do this". Picks persist
 * via trip.bucketPicks (App.toggleBucketPick → tripStore).
 *
 * Purely presentational; all state lives in App. Grounded venues get the same
 * validated Map chip as the itinerary (href must be a google.com/maps URL) and
 * unverified rows deliberately get no link at all.
 */
import { T } from "../lib/constants.js";
import { outlineBtnSt, titleSt } from "../lib/styles.js";
import StationSymbol from "./StationSymbol.jsx";
import Glyph from "./Glyphs.jsx";
import { bucketPickKey, bucketShelves, countIdeas } from "../lib/utils.js";

// Priority reads as plain text weight, not a badge (Transit Diagram).
const PRIORITY_STYLE = {
  essential:   { color: T.accentInk, fontWeight: 900 },
  recommended: { color: T.ink,       fontWeight: 700 },
  optional:    { color: T.muted,     fontWeight: 500 },
};

// The pick control is a station: ring = an idea, filled disc = picked.
function CheckRing({ picked, onToggle, name }) {
  return (
    <button onClick={onToggle} aria-pressed={picked} aria-label={picked ? `Remove ${name} from my list` : `Add ${name} to my list`}
      style={{ width: 44, height: 44, margin: "-8px 0 0 -8px", flexShrink: 0, cursor: "pointer", background: "transparent", border: "none", padding: 0,
        display: "flex", alignItems: "center", justifyContent: "center" }}>
      <StationSymbol kind={picked ? "done" : "stop"} size={26} />
    </button>
  );
}

function IdeaCard({ cat, item, picked, onToggle }) {
  const pr = PRIORITY_STYLE[item.priority] || PRIORITY_STYLE.optional;
  const mapOk = item.verified && typeof item.mapUrl === "string" && item.mapUrl.startsWith("https://www.google.com/maps");
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start", padding: "14px 0", borderTop: `1px solid ${T.border}` }}>
      <CheckRing picked={picked} onToggle={onToggle} name={item.name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: T.fs.ui, fontWeight: picked ? 900 : 700, color: T.ink, lineHeight: 1.3 }}>{item.name}</span>
          {item.priority && (
            <span style={{ ...pr, fontSize: T.fs.meta, textTransform: "capitalize", flexShrink: 0 }}>
              {item.priority}
            </span>
          )}
        </div>
        {item.description && (
          <div style={{ fontFamily: T.fontProse, fontWeight:400, fontSize: T.fs.body, color: T.muted, lineHeight: 1.5, marginTop: 3 }}>{item.description}</div>
        )}
        {item.proTip && (
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 6 }}>
            <span style={{ flexShrink: 0, marginTop: 2 }}><Glyph name="info" size={12} color={T.ink} /></span>
            <span style={{ fontFamily: T.fontProse, fontWeight:400, fontSize: T.fs.meta, color: T.muted, lineHeight: 1.5 }}>{item.proTip}</span>
          </div>
        )}
        {mapOk && (
          <div style={{ marginTop: 6 }}>
            <a href={item.mapUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: T.fs.meta, fontWeight: 900,
                color: T.accentInk, textDecoration: "underline", textUnderlineOffset: 3 }}>
              <Glyph name="pin" size={12} color="currentColor" />
              Map
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BucketBoard({ trip, onTogglePick, onExport, onCopy, copied }) {
  const categories = trip?.categories || {};
  const picks = trip?.bucketPicks || {};
  const ideas = countIdeas(categories);
  const picked = Object.keys(picks).length;

  // Shelf order + unknown-key tolerance live in bucketShelves (utils) — ONE
  // source shared with the PDF export and the copy text, so the surfaces
  // can't drift.
  const shelves = bucketShelves(categories);

  if (ideas === 0) {
    return (
      <div style={{ padding: "18px 16px", background: T.bg1, border: `2px solid ${T.ink}`, borderRadius: T.r.md,
        fontSize: T.fs.body, color: T.muted, lineHeight: 1.6 }}>
        <strong style={{ color: T.ink }}>No ideas landed for this list.</strong>{" "}
        The curation didn't finish — Edit trip → Rebuild runs it again.
      </div>
    );
  }

  return (
    <div>
      {/* Status row — same anatomy as the itinerary's, dateless. */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 10, rowGap: 8, padding: "4px 0 14px", marginBottom: 8 }}>
        <h2 style={{ ...titleSt, margin: 0 }}>Your list</h2>
        <span style={{ fontSize: T.fs.body, color: T.muted }}>
          {picked ? `${picked} of ${ideas} picked` : `${ideas} ideas — tap the ring to claim one`}
        </span>
        {/* Same toolbar anatomy as the itinerary status row. */}
        {(onCopy || onExport) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, width: "100%" }}>
            {onCopy && (
              <button onClick={onCopy}
                style={{ ...outlineBtnSt, color: copied === "error" ? T.danger : T.ink, background: copied ? T.bg2 : "transparent" }}>
                {copied === "error" ? "Copy failed" : copied ? "✓ Copied" : "Copy"}
              </button>
            )}
            {onExport && (
              <button onClick={onExport} style={outlineBtnSt}>
                Export PDF
              </button>
            )}
          </div>
        )}
      </div>

      {shelves.map(([id, label]) => {
        const items = categories[id];
        const shelfPicked = items.filter(it => picks[bucketPickKey(id, it)]).length;
        return (
          <div key={id} style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, paddingTop: 10, marginBottom: 2, borderTop: `3px solid ${T.ink}` }}>
              <h3 style={{ ...titleSt, margin: 0 }}>{label}</h3>
              <span style={{ fontSize: T.fs.body, color: T.muted, fontWeight: shelfPicked ? 700 : 500 }}>
                {shelfPicked ? `${shelfPicked} of ${items.length} picked` : `${items.length}`}
              </span>
            </div>
            {items.map(item => {
              const key = bucketPickKey(id, item);
              return (
                <IdeaCard key={key} cat={id} item={item} picked={!!picks[key]}
                  onToggle={() => onTogglePick?.(key)} />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
