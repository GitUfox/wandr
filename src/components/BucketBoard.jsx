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
import { T, BUCKET_CATS } from "../lib/constants.js";
import { bucketPickKey, countIdeas } from "../lib/utils.js";

const PRIORITY_STYLE = {
  essential:   { color: T.white,  background: T.accent,     border: `1px solid ${T.accent}` },
  recommended: { color: T.accent, background: "transparent", border: `1px solid ${T.accent}` },
  optional:    { color: T.hint,   background: "transparent", border: `1px solid ${T.border}` },
};

function CheckRing({ picked, onToggle, name }) {
  return (
    <button onClick={onToggle} aria-pressed={picked} aria-label={picked ? `Remove ${name} from my list` : `Add ${name} to my list`}
      style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, cursor: "pointer", fontFamily: T.font,
        background: picked ? T.accent : "transparent",
        border: picked ? `1.5px solid ${T.accent}` : `1.5px solid ${T.border2}`,
        color: T.white, fontSize: 13, fontWeight: 800, lineHeight: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background .15s, border-color .15s", padding: 0 }}>
      {picked ? "✓" : ""}
    </button>
  );
}

function IdeaCard({ cat, item, picked, onToggle }) {
  const pr = PRIORITY_STYLE[item.priority] || PRIORITY_STYLE.optional;
  const mapOk = item.verified && typeof item.mapUrl === "string" && item.mapUrl.startsWith("https://www.google.com/maps");
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", marginBottom: 8,
      background: picked ? "#1a1512" : T.bg1, borderRadius: T.r.md,
      border: `1px solid ${picked ? "rgba(201,100,66,.45)" : T.border}`, transition: "background .15s, border-color .15s" }}>
      <div style={{ paddingTop: 1 }}>
        <CheckRing picked={picked} onToggle={onToggle} name={item.name} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: T.fs.ui, fontWeight: 800, color: T.ink, lineHeight: 1.3 }}>{item.name}</span>
          {item.priority && (
            <span style={{ ...pr, fontSize: T.fs.micro, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase",
              borderRadius: T.r.pill, padding: "2px 8px", flexShrink: 0 }}>
              {item.priority}
            </span>
          )}
        </div>
        {item.description && (
          <div style={{ fontSize: T.fs.body, color: T.muted, lineHeight: 1.55, marginTop: 3 }}>{item.description}</div>
        )}
        {item.proTip && (
          <div style={{ display: "flex", gap: 7, marginTop: 7, padding: "5px 10px", background: "rgba(201,100,66,.07)",
            borderLeft: `2.5px solid ${T.accent}`, borderRadius: `0 ${T.r.sm}px ${T.r.sm}px 0` }}>
            <span style={{ color: T.accent, fontWeight: 800, fontSize: T.fs.meta, lineHeight: 1.5 }}>!</span>
            <span style={{ fontSize: T.fs.meta, color: T.muted, lineHeight: 1.5 }}>{item.proTip}</span>
          </div>
        )}
        {mapOk && (
          <div style={{ marginTop: 7 }}>
            <a href={item.mapUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: T.fs.label, fontWeight: 700,
                color: T.accent, border: `1px solid ${T.accent}`, borderRadius: T.r.pill, padding: "3px 10px",
                textDecoration: "none" }}>
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z" /><circle cx="12" cy="10" r="2.4" />
              </svg>
              Map
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BucketBoard({ trip, onTogglePick }) {
  const categories = trip?.categories || {};
  const picks = trip?.bucketPicks || {};
  const ideas = countIdeas(categories);
  const picked = Object.keys(picks).length;

  // Canonical shelf order first, then any category the schema pin didn't
  // anticipate — nothing the model curated is ever silently dropped. Extras
  // get readable labels ("live_music" → "Live music"); this fallback caught a
  // real deviation on the first live run (the prompt now pins the keys, this
  // stays as the belt to that suspender).
  const prettify = (id) => id.replace(/[_-]+/g, " ").replace(/^\w/, ch => ch.toUpperCase());
  const known = BUCKET_CATS.filter(([id]) => Array.isArray(categories[id]) && categories[id].length > 0);
  const extras = Object.keys(categories)
    .filter(id => !BUCKET_CATS.some(([k]) => k === id) && Array.isArray(categories[id]) && categories[id].length > 0)
    .map(id => [id, prettify(id)]);
  const shelves = [...known, ...extras];

  if (ideas === 0) {
    return (
      <div style={{ padding: "18px 16px", background: T.bg1, border: `1px solid ${T.border}`, borderRadius: T.r.md,
        fontSize: T.fs.body, color: T.muted, lineHeight: 1.6 }}>
        <strong style={{ color: T.ink }}>No ideas landed for this list.</strong>{" "}
        The curation didn't finish — Edit trip → Rebuild runs it again.
      </div>
    );
  }

  return (
    <div>
      {/* Status row — same anatomy as the itinerary's, dateless. */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, rowGap: 8,
        padding: "4px 2px 12px", borderBottom: `1px solid ${T.border}`, marginBottom: 14 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.accent,
          boxShadow: "0 0 0 3px rgba(201,100,66,.14)", flexShrink: 0 }} />
        <span style={{ fontSize: T.fs.body, fontWeight: 800, color: T.ink }}>Your list</span>
        <span style={{ fontSize: T.fs.meta, color: T.hint }}>
          {picked ? `${picked} of ${ideas} picked` : `${ideas} ideas — tap the ring to claim one`}
        </span>
      </div>

      {shelves.map(([id, label]) => {
        const items = categories[id];
        const shelfPicked = items.filter(it => picks[bucketPickKey(id, it)]).length;
        return (
          <div key={id} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: T.fs.label, fontWeight: 800, color: T.hint, textTransform: "uppercase", letterSpacing: ".07em" }}>{label}</span>
              <span style={{ fontSize: T.fs.micro, color: shelfPicked ? T.accent : T.hint, fontWeight: 700 }}>
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
