import { useState, useEffect, useRef } from "react";
import { T, DEST_PLACEHOLDERS, INPUT_CAPS } from "../lib/constants.js";
import { parseISODate, countIdeas } from "../lib/utils.js";
import { packingNudge } from "../lib/packing.js";
import { useOnline } from "../hooks/useOnline.js";
import { useIsWide } from "../hooks/useIsWide.js";
import { fetchDestinationSuggestions } from "../lib/places.js";
import TripinLogo from "./TripinLogo.jsx";
import ProfileSheet from "./ProfileSheet.jsx";
import SettingsSheet from "./SettingsSheet.jsx";
import ProfileChip from "./ProfileChip.jsx";
import SyncStatusLine from "./SyncStatusLine.jsx";
import { useAccount } from "../hooks/useAccount.js";
import StationSymbol from "./StationSymbol.jsx";

/** Compact profile summary for the ✦ strip: starred interests first. */
function profileSummary(p) {
  if (!p) return "";
  const starred = p.interests?.priorityChips || [];
  const rest    = (p.interests?.chips || []).filter(c => !starred.includes(c));
  const bits    = [...starred, ...rest].slice(0, 4);
  const crew    = Array.isArray(p.party?.chips) ? p.party.chips[0] : typeof p.party === "string" ? p.party : "";
  if (crew) bits.push(crew);
  if (p.logistics?.pace) bits.push(`${p.logistics.pace} pace`);
  return bits.join(" · ");
}

/** ISO date → { mon: "JUN", day: "30" } for the mini-ticket stub. */
function stubDate(iso) {
  const d = parseISODate(iso);
  if (!d) return null;
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return { mon: months[d.getMonth()], day: String(d.getDate()) };
}

/** "departs in 31 days" / "departs tomorrow" / "departs today" — empty once past. */
function departsIn(iso) {
  const d = parseISODate(iso);
  if (!d) return "";
  const days = Math.round((d - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days > 1)  return `departs in ${days} days`;
  if (days === 1) return "departs tomorrow";
  if (days === 0) return "departs today";
  return "";
}

/**
 * RailFork: the welcome fork, Transit Diagram version (redesign direction E).
 * One line leaves the destination field at a station and splits into two day
 * lines. Each line ends at a button. The buttons ARE the CTAs: one tap either
 * way starts the flow (Full itinerary, or the dateless Bucket list).
 *
 * Geometry: the SVG and the button row share one 320px box. The two line ends
 * (x = 77 and x = 243) are the centers of the two 154px buttons. If the box
 * width or the gap changes, change FORK to match. Lines bend at 45 degrees
 * only. Polylines only, no path data.
 *
 * Motion: when the fork appears, both lines draw from the station and the
 * buttons rise in. On a pick, the line that was not chosen goes cold (a
 * color change). VITE_NO_MOTION and prefers-reduced-motion show the finished
 * fork at once and commit with no delay.
 */
const FORK = {
  width: 320, height: 74, gap: 12,
  left:  "160,0 160,12 120,52 97,52 77,72 77,74",
  right: "160,0 160,12 200,52 223,52 243,72 243,74",
};

export function RailFork({ onPick, noMotion = false }) {
  const [committed, setCommitted] = useState(null); // "A" | "B" once a branch is chosen
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const still = noMotion || reduced;

  function pick(branch, style) {
    if (committed) return;
    setCommitted(branch);
    if (still) { onPick(style); return; }
    setTimeout(() => onPick(style), 260); // let the cold line settle (.25s)
  }

  const lineSt = { transition: still ? "none" : "stroke .25s" };
  const btnSt = (bg, off) => ({
    flex: 1, minWidth: 0, minHeight: 58, padding: "8px 8px", textAlign: "center", cursor: "pointer",
    background: bg, color: T.white, border: "none", borderRadius: T.r.pill, fontFamily: T.font,
    opacity: off ? .35 : 1, transition: still ? "none" : "opacity .25s",
  });

  return (
    <div role="group" aria-label="Choose how to build this trip" data-still={still ? "true" : undefined}
      style={{ width: FORK.width, maxWidth: "100%", margin: "0 auto 14px" }}>
      <svg viewBox={`0 0 ${FORK.width} ${FORK.height}`} width={FORK.width} height={FORK.height} fill="none" aria-hidden="true"
        style={{ display: "block", maxWidth: "100%" }}>
        {/* Motion: both lines draw from the station to their buttons, then
            the buttons rise in. pathLength="1" lets one keyframe draw any line. */}
        <polyline points={FORK.left}  pathLength="1" className={still ? undefined : "t-draw"} strokeWidth="10" stroke={committed === "B" ? T.border : T.line[0]} style={lineSt} />
        <polyline points={FORK.right} pathLength="1" className={still ? undefined : "t-draw"} strokeWidth="10" stroke={committed === "A" ? T.border : T.line[1]} style={lineSt} />
        <circle cx="160" cy="11" r="10" fill={T.white} stroke={T.ink} strokeWidth="5" />
      </svg>
      <div className={still ? undefined : "t-rise"} style={{ display: "flex", gap: FORK.gap, ...(still ? {} : { animationDelay: "320ms" }) }}>
        <button onClick={() => pick("A", "itinerary")} aria-label="Full itinerary — a day-by-day plan"
          style={btnSt(T.line[0], committed === "B")}>
          <span style={{ display: "block", fontSize: T.fs.ui, fontWeight: 900, lineHeight: 1.2 }}>Full itinerary</span>
          <span style={{ display: "block", fontSize: T.fs.meta, fontWeight: 500, lineHeight: 1.3 }}>day-by-day plan</span>
        </button>
        <button onClick={() => pick("B", "bucket")} aria-label="Bucket list — just the activities, no dates"
          style={btnSt(T.line[1], committed === "A")}>
          <span style={{ display: "block", fontSize: T.fs.ui, fontWeight: 900, lineHeight: 1.2 }}>Bucket list</span>
          <span style={{ display: "block", fontSize: T.fs.meta, fontWeight: 500, lineHeight: 1.3 }}>just the activities</span>
        </button>
      </div>
    </div>
  );
}

export default function WelcomeScreen({ onStart, hasProfile, profile, onUpdateProfile, savedTrip, onResume, trips = [], onDeleteTrip }) {
  const [dest, setDest]                     = useState("");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderFade, setPlaceholderFade] = useState(true);
  const [showAbout, setShowAbout]           = useState(false);
  const [showSettings, setShowSettings]     = useState(false); // false | "settings" (the ⚙) | "account" (chip, sync line)
  // An expired sign-in link lands here. Open the account card so the message
  // and the resend are in front of the traveler, not behind the chip.
  const account = useAccount();
  useEffect(() => { if (account.linkExpired) setShowSettings("account"); }, [account.linkExpired]);
  const [showProfile, setShowProfile]       = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [suggestions, setSuggestions]       = useState([]);
  const [destPicked, setDestPicked]         = useState(false); // a suggestion was chosen (or "use as typed")
  const intervalRef = useRef(null);
  const inputRef = useRef(null);
  const online = useOnline();
  const isWide = useIsWide(); // 12B departures-board arrangement on desktop

  const destValid = dest.trim().length > 1;

  // Destination autocomplete (design pick 5A) — debounced, aborts in-flight
  // lookups, silent no-op while the Places key is unconfigured.
  useEffect(() => {
    if (destPicked || !online || dest.trim().length < 2) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const s = await fetchDestinationSuggestions(dest, controller.signal);
      if (!controller.signal.aborted) setSuggestions(s);
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [dest, destPicked, online]);

  function pickSuggestion(s) {
    setDest(s.secondary ? `${s.main}, ${s.secondary}` : s.main);
    setDestPicked(true);
    setSuggestions([]);
  }

  useEffect(() => {
    if (dest.length > 0) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      setPlaceholderFade(false);
      setTimeout(() => { setPlaceholderIdx(i => (i + 1) % DEST_PLACEHOLDERS.length); setPlaceholderFade(true); }, 180);
    }, 2200);
    return () => clearInterval(intervalRef.current);
  }, [dest]);

  function handleStart(mode = "fresh", tripStyle = "itinerary") {
    if (!destValid || !online) return;   // building a trip requires the AI
    onStart(dest.trim(), mode, tripStyle);
  }

  // One row renderer for BOTH the mobile list and the desktop rail (12B
  // binding constraint: arrangements may arrange, never rebuild).
  // Transit Diagram (direction E): a trip is a ROW, not a card. A dated trip
  // shows one color bar per day (T.line, in day order). A bucket trip shows
  // one station symbol per idea, filled when picked. The first row carries
  // the ink rule that opens the list.
  const MAX_BARS = 10, MAX_DOTS = 12;
  const renderTripCard = (t, i) => {
    const isActive   = t.id === savedTrip?.id;
    const confirming = confirmDeleteId === t.id;
    const start  = t.answers?.dates?.start;
    const stub   = stubDate(start);
    const broken = !!t._error;
    // Bucket trips (1F, 2026-08-15) carry no date words anywhere. The row
    // identifies by place + activities: "18 ideas · 6 picked".
    const isBucketTrip = t.tripStyle === "bucket";
    const ideas  = isBucketTrip ? countIdeas(t.categories) : 0;
    const picked = isBucketTrip ? Object.keys(t.bucketPicks || {}).length : 0;
    const days   = !isBucketTrip && t.nights ? Math.min(t.nights + 1, MAX_BARS) : 0;
    const dots   = Math.min(ideas, MAX_DOTS);
    const rule   = i === 0 ? `3px solid ${T.ink}` : `1px solid ${T.border}`;
    const sub = broken
      ? "build didn't finish — tap to rebuild"
      : isBucketTrip
        ? [`${ideas} ${ideas === 1 ? "idea" : "ideas"}`, picked ? `${picked} picked` : ""].filter(Boolean).join(" · ")
        // Packing nudge (3C): the same packingNudge() line the dashboard row
        // shows ("25 to pack" / "Last call · 6"), only inside the 7-day window.
        : [stub && `${stub.mon[0]}${stub.mon.slice(1).toLowerCase()} ${stub.day}`, departsIn(start), packingNudge(t)?.short].filter(Boolean).join(" · ") || "planning";
    const tail = broken ? "Rebuild"
      : isBucketTrip ? "Bucket list"
      : t.nights ? `${t.nights} ${t.nights === 1 ? "night" : "nights"}` : "";
    if (confirming) {
      return (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, borderTop: rule, minHeight: 76, padding: "10px 0" }}>
          <div style={{ flex: 1, fontSize: T.fs.body, color: T.muted }}>
            Delete <strong style={{ color: T.ink }}>{t.destination}</strong> and its itinerary?
          </div>
          <button onClick={() => { onDeleteTrip?.(t.id); setConfirmDeleteId(null); }}
            style={{ minHeight: 44, fontSize: T.fs.body, fontWeight: 700, color: T.white, background: T.accent, border: "none", borderRadius: T.r.pill, padding: "0 16px", cursor: "pointer", fontFamily: T.font }}>
            Delete
          </button>
          <button onClick={() => setConfirmDeleteId(null)}
            style={{ minHeight: 44, fontSize: T.fs.body, fontWeight: 700, color: T.ink, background: "transparent", border: `2px solid ${T.ink}`, borderRadius: T.r.pill, padding: "0 16px", cursor: "pointer", fontFamily: T.font }}>
            Keep
          </button>
        </div>
      );
    }
    return (
      <div key={t.id} style={{ display: "flex", alignItems: "stretch", borderTop: rule }}>
        <button onClick={() => onResume(t.id)}
          style={{ flex: 1, minWidth: 0, minHeight: 76, display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", fontFamily: T.font, color: T.ink, padding: "12px 0" }}>
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
              <span style={{ fontFamily: T.fontDay, fontSize: T.fs.title, fontWeight: 900, letterSpacing: "-.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.destination}</span>
              {isActive && <span style={{ fontSize: T.fs.meta, fontWeight: 700, color: T.accentInk, flexShrink: 0 }}>Current</span>}
            </span>
            {days > 0 && (
              <span aria-hidden="true" style={{ display: "flex", gap: 3 }}>
                {Array.from({ length: days }, (_, d) => (
                  <span key={d} style={{ width: 22, height: 8, background: T.line[d % T.line.length] }} />
                ))}
              </span>
            )}
            {dots > 0 && (
              <span aria-hidden="true" style={{ display: "flex", gap: 4 }}>
                {Array.from({ length: dots }, (_, d) => (
                  <StationSymbol key={d} kind={d < picked ? "done" : "stop"} size={12} />
                ))}
              </span>
            )}
            <span style={{ fontSize: T.fs.meta, fontWeight: 500, color: broken ? T.danger : T.muted }}>{sub}</span>
          </span>
          {tail && <span style={{ fontSize: T.fs.body, fontWeight: 700, color: broken ? T.accentInk : T.ink, flexShrink: 0 }}>{tail}</span>}
        </button>
        <button onClick={() => setConfirmDeleteId(t.id)} aria-label={`Delete ${t.destination}`}
          style={{ width: 44, alignSelf: "stretch", fontSize: T.fs.title, lineHeight: 1, color: T.hint, background: "transparent", border: "none", cursor: "pointer", fontFamily: T.font, flexShrink: 0 }}>
          ×
        </button>
      </div>
    );
  };

  return (
    <div style={ isWide
      ? { minHeight: "100vh", width: "100%", display: "flex", alignItems: "stretch", background: T.bg0, fontFamily: T.font, position: "relative" }
      : { minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "5.5rem 1.5rem 2.5rem" /* top clears the 54px corner cluster and the logo row */, background: T.bg0, fontFamily: T.font, position: "relative" } }>

      {/* Corner cluster — ONE fixed flex row so the variable-width chip can
          never collide with its neighbours. Order is board pick 2B: utilities
          first, identity at the extreme corner (the Gmail/YouTube seat).
          44px tall so the chip's touch target centers on the 32px circles.
          Mobile: absolute, so the row scrolls away with the page and never
          covers content (the Sign in pill makes it about half the screen
          wide). Desktop keeps it fixed beside the departures rail. */}
      <div style={{ position: isWide ? "fixed" : "absolute", top: 10, right: isWide ? 332 : 16, height: 44, display: "flex", alignItems: "center", gap: 8, zIndex: 10 }}>
        {/* Settings — device-bound app settings */}
        <button onClick={() => setShowSettings("settings")} aria-label="Settings"
          style={{ width: 36, height: 36, borderRadius: "50%", background: T.bg1, border: `2px solid ${T.ink}`, color: T.ink, fontSize: T.fs.ui, fontWeight: 700, cursor: "pointer", fontFamily: T.font, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          ⚙
        </button>

        {/* Help affordance — unambiguous "?" that opens an About panel */}
        <button onClick={() => setShowAbout(true)} aria-label="About Tripin"
          style={{ width: 36, height: 36, borderRadius: "50%", background: T.bg1, border: `2px solid ${T.ink}`, color: T.ink, fontSize: T.fs.ui, fontWeight: 700, cursor: "pointer", fontFamily: T.font, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          ?
        </button>

        {/* Identity — opens the account card (Settings today, the merged
            Profile sheet at spec P1-2). */}
        <ProfileChip onOpen={() => setShowSettings("account")} />
      </div>

      {/* About panel */}
      {showAbout && (
        <div onClick={() => setShowAbout(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
          <div onClick={e => e.stopPropagation()} className="fade-up"
            style={{ width: "100%", maxWidth: 380, background: T.bg1, border: `1px solid ${T.border}`, borderRadius: T.r.lg, padding: "1.5rem 1.5rem 1.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: T.fs.title, fontWeight: 700, color: T.ink }}>Plan your next trip with Tripin</div>
              <button onClick={() => setShowAbout(false)} aria-label="Close"
                style={{ width: 26, height: 26, borderRadius: "50%", background: "transparent", border: "none", color: T.hint, fontSize: T.fs.title, cursor: "pointer", fontFamily: T.font, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: T.fs.body, color: T.muted, lineHeight: 1.6, marginBottom: 16 }}>
              Answer a few quick questions and Tripin builds you a personal trip — tailored to your pace, budget, and what you actually care about.
            </div>
            {[
              ["Top-tier itineraries", "Every day planned, morning to night"],
              ["Next-level activities", "Matched to your pace, interests, and budget"],
              ["Localized tips that make grandma proud", "Timing, getting around, and what to skip"],
            ].map(([title, desc]) => (
              <div key={title} style={{ display: "flex", gap: 9, marginBottom: 11 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent, flexShrink: 0, marginTop: 6 }} />
                <div>
                  <div style={{ fontSize: T.fs.body, fontWeight: 700, color: T.ink }}>{title}</div>
                  <div style={{ fontSize: T.fs.body, color: T.hint, lineHeight: 1.5 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={ isWide
        ? { flex: 1, minWidth: 0, position: "relative", display: "flex", flexDirection: "column", padding: "26px 48px 32px" }
        : { width: "100%", maxWidth: 440 } }>

        {/* Brand. Mobile: the mark and wordmark sit in the top-left corner,
            level with the corner cluster. Desktop: a quiet top-left row. */}
        <div style={ isWide
          ? { display: "flex", alignItems: "center", gap: 14 }
          : { position: "absolute", top: 10, left: 24, height: 44, display: "flex", alignItems: "center" } }>
          <TripinLogo size={isWide ? "sm" : "xs"} />
          {isWide && <div style={{ fontSize: T.fs.body, fontWeight: 600, color: T.muted }}>Make it your trip.</div>}
        </div>

        {/* On desktop everything actionable lives in a 560px stage column that
            starts at the upper-third line. */}
        <div style={ isWide ? { maxWidth: 560, width: "100%", marginTop: "14vh", position: "relative" } : undefined }>

        {/* Destination input. The question is the headline. The field is a
            station: the fork below leaves from its bottom edge. */}
        <div style={{ marginBottom: destValid && online && suggestions.length === 0 ? 0 : 16 }}>
          <h1 style={{ margin: 0, fontFamily: T.fontHero, fontWeight: 900, fontSize: T.fs.display, lineHeight: .95, letterSpacing: "-.04em", color: T.ink }}>Where to?</h1>
          {!isWide && <div style={{ fontSize: T.fs.ui, fontWeight: 500, color: T.muted, marginTop: 8 }}>Make it your trip.</div>}
          <label htmlFor="tripin-dest" style={{ display: "block", fontSize: T.fs.ui, fontWeight: 700, color: T.ink, margin: "22px 0 8px" }}>City or place</label>
          <div style={{ position: "relative" }}>
            <input
              id="tripin-dest"
              ref={inputRef}
              autoFocus
              type="text"
              value={dest}
              maxLength={INPUT_CAPS.destination}
              onChange={e => { setDest(e.target.value); setDestPicked(false); }}
              onKeyDown={e => e.key === "Enter" && handleStart(hasProfile ? "continue" : "fresh")}
              style={{ width: "100%", height: 58, padding: "0 48px 0 22px", fontSize: T.fs.title, fontWeight: 700, background: T.bg1, border: `4px solid ${T.ink}`, borderRadius: T.r.pill, color: T.ink, outline: "none", fontFamily: T.font, colorScheme: "light", boxSizing: "border-box", display: "block" }}
            />
            {dest.length === 0 && (
              <div aria-hidden="true"
                style={{ position: "absolute", left: 26, top: "50%", transform: "translateY(-50%)", fontSize: T.fs.title, fontWeight: 700, color: T.hint, pointerEvents: "none", opacity: placeholderFade ? 1 : 0, transition: "opacity .18s ease" }}>
                {DEST_PLACEHOLDERS[placeholderIdx]}
              </div>
            )}
            {destPicked && (
              <span aria-hidden="true" style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                <StationSymbol kind="done" size={18} color={T.line[2]} />
              </span>
            )}
          </div>
          {suggestions.length > 0 && (
            <div className="fade-up" style={{ marginTop: 8, background: T.bg1, border: `2px solid ${T.ink}`, borderRadius: T.r.md, overflow: "hidden" }}>
              {suggestions.map((s, i) => (
                <button key={s.placeId || i} onClick={() => pickSuggestion(s)}
                  style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 48, textAlign: "left", padding: "10px 14px", background: "transparent", border: "none", borderTop: i === 0 ? "none" : `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.font }}>
                  <StationSymbol kind={i === 0 ? "book" : "stop"} size={16} />
                  <span style={{ fontSize: T.fs.ui, color: T.ink, fontWeight: 700 }}>
                    {s.main}
                    {s.secondary && <span style={{ color: T.muted, fontWeight: 400 }}> — {s.secondary}</span>}
                  </span>
                </button>
              ))}
              <button onClick={() => { setDestPicked(true); setSuggestions([]); }}
                style={{ display: "block", width: "100%", minHeight: 48, textAlign: "left", padding: "10px 14px", background: "transparent", border: "none", borderTop: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.font, fontSize: T.fs.body, color: T.accentInk, fontWeight: 700 }}>
                Use “{dest.trim()}” as typed →
              </button>
            </div>
          )}
        </div>

        {/* Offline notice — building a trip needs the AI, so say so plainly
            instead of letting the CTA fail on tap. A saved trip still opens. */}
        {!online && (
          <div style={{ marginBottom: 16, padding: "10px 12px", background: T.bg1, border: `1px solid ${T.border}`, borderRadius: T.r.md, fontSize: T.fs.body, color: T.muted, lineHeight: 1.5 }}>
            <strong style={{ color: T.ink }}>You're offline.</strong>{" "}
            {savedTrip?.destination
              ? "Your saved trip opens below — new trips need a connection."
              : "New trips need a connection. Anything you've already saved will open here."}
          </div>
        )}

        {/* CTA — the rail fork (design pick 1F, 2026-08-15). The two branch
            pills ARE the commit buttons: Full itinerary keeps today's one-tap
            flow, Bucket list starts the dateless mode. With a profile, either
            branch plans "my way" (mode continue); the blank-slate escape below
            stays. Editing preferences opens the ProfileSheet — never the
            interview. */}
        {destValid && online && (
          <RailFork
            noMotion={!!import.meta.env.VITE_NO_MOTION}
            onPick={(style) => handleStart(hasProfile ? "continue" : "fresh", style)}
          />
        )}

        {/* Traveler profile strip — always visible once a profile exists, so
            "my way" is never a mystery. Edit opens the profile sheet. */}
        {hasProfile && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${T.border}`, borderRadius: T.r.md, background: T.bg1, padding: "11px 14px", marginBottom: destValid ? 8 : 16 }}>
            <StationSymbol kind="book" size={16} />
            <span style={{ fontSize: T.fs.meta, color: T.muted, flex: 1, lineHeight: 1.45 }}>{profileSummary(profile) || "Your traveler profile"}</span>
            <button onClick={() => setShowProfile(true)}
              style={{ fontSize: T.fs.meta, fontWeight: 700, color: T.accent, background: "transparent", border: "none", cursor: "pointer", fontFamily: T.font, padding: "2px 2px", flexShrink: 0 }}>
              Edit
            </button>
          </div>
        )}
        {destValid && online && hasProfile && (
          <button onClick={() => handleStart("fresh")}
            style={{ width: "100%", padding: "4px 0 0", background: "transparent", border: "none", color: T.hint, fontSize: T.fs.meta, fontWeight: 600, cursor: "pointer", fontFamily: T.font, marginBottom: 16 }}>
            or start from a blank slate
          </button>
        )}

        </div>

        {/* My trips — mini boarding-pass shelf (design pick 7A), mobile only;
            on desktop the departures rail (12B) is the trips surface. */}
        {!isWide && trips.length > 0 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontFamily: T.fontDay, fontSize: T.fs.title, fontWeight: 900, letterSpacing: "-.02em", color: T.ink, margin: "18px 0 8px" }}>My trips</h2>
            {trips.map(renderTripCard)}
            <SyncStatusLine onSignIn={() => setShowSettings("account")} style={{ marginTop: 10 }} />
          </div>
        )}

      </div>

      {/* Departures rail (design pick 12B) — desktop's permanent trips surface.
          Same renderTripCard as the mobile shelf; only the arrangement differs. */}
      {isWide && (
        <div style={{ width: 316, flexShrink: 0, borderLeft: `1px solid ${T.border}`, background: T.bg1, padding: "22px 18px", overflowY: "auto" }}>
          <h2 style={{ fontFamily: T.fontDay, fontSize: T.fs.title, fontWeight: 900, letterSpacing: "-.02em", color: T.ink, margin: "2px 0 12px" }}>My trips</h2>
          {trips.length > 0 && <SyncStatusLine onSignIn={() => setShowSettings("account")} style={{ margin: "2px 0 12px" }} />}
          {trips.map(renderTripCard)}
          <button onClick={() => inputRef.current?.focus()}
            style={{ width: "100%", border: `1px dashed ${T.border2}`, borderRadius: T.r.md, background: "transparent", textAlign: "center", padding: "11px 0", fontSize: T.fs.body, color: T.muted, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>
            + New trip
          </button>
        </div>
      )}

      {/* Traveler profile editor (design pick 6A) */}
      <SettingsSheet open={!!showSettings} focusAccount={showSettings === "account"} onClose={() => setShowSettings(false)} tripCount={trips.length} />

      <ProfileSheet
        open={showProfile}
        profile={profile}
        onClose={() => setShowProfile(false)}
        onSave={onUpdateProfile}
      />
    </div>
  );
}
