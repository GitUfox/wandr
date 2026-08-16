import { useState, useEffect, useRef } from "react";
import { T, DEST_PLACEHOLDERS, INPUT_CAPS } from "../lib/constants.js";
import { parseISODate, countIdeas } from "../lib/utils.js";
import { useOnline } from "../hooks/useOnline.js";
import { useIsWide } from "../hooks/useIsWide.js";
import { fetchDestinationSuggestions } from "../lib/places.js";
import WandrLogo from "./WandrLogo.jsx";
import ProfileSheet from "./ProfileSheet.jsx";
import SettingsSheet from "./SettingsSheet.jsx";
import StardustBurst from "./StardustBurst.jsx";
import Glyph from "./Glyphs.jsx";

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
 * RailFork — the welcome fork (design pick 1F, 2026-08-15, off the round-two
 * board). The ticket rail arrives at a literal Y-junction: the ember idles at
 * the switch until the traveler taps a branch pill, then commits down that
 * track — branch ignites, the other line goes cold — and the flow starts.
 * The pills ARE the CTAs: one tap either way, same as the old single button.
 *
 * Motion notes: ember runs on CSS offset-path (wrfidle / wrfrun keyframes in
 * the welcome style block). VITE_NO_MOTION renders the ember parked and picks
 * navigate synchronously (harness clicks); prefers-reduced-motion gets the
 * same via the media query + the reduced check in pick().
 */
export function RailFork({ onPick, noMotion = false }) {
  const [committed, setCommitted] = useState(null); // "A" | "B" once a branch is chosen
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function pick(branch, style) {
    if (committed) return;
    setCommitted(branch);
    if (noMotion || reduced) { onPick(style); return; }
    setTimeout(() => onPick(style), 520); // let the ember finish the run (.5s)
  }

  const pillSt = (on, off) => ({
    position: "absolute", left: 158, width: 138, textAlign: "left", cursor: "pointer",
    background: on ? "#211712" : T.bg1, border: `1px solid ${on ? T.accent : T.border2}`,
    borderRadius: T.r.pill, padding: "7px 14px", fontFamily: T.font,
    opacity: off ? .4 : 1, transition: "border-color .3s, background .3s, opacity .3s",
    boxShadow: on ? "0 0 0 1px rgba(201,100,66,.35), 0 0 18px rgba(201,100,66,.18)" : "none",
  });
  const glowSt = (lit) => ({ strokeDasharray: 1, strokeDashoffset: lit ? 0 : 1, transition: "stroke-dashoffset .5s ease" });

  return (
    <div role="group" aria-label="Choose how to build this trip" className="fade-up"
      style={{ position: "relative", width: 300, height: 132, margin: "2px auto 4px" }}>
      <svg viewBox="0 0 300 132" width="300" height="132" aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id="wrfGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={T.accent} /><stop offset="1" stopColor="#ffc79b" />
          </linearGradient>
        </defs>
        <path d="M8,65 H96" fill="none" stroke={T.border} strokeWidth="3" strokeLinecap="round" />
        <path d="M96,65 C126,65 130,34 150,34" fill="none" strokeWidth="3" strokeLinecap="round"
          stroke={committed === "B" ? "#242424" : T.border} style={{ transition: "stroke .4s" }} />
        <path d="M96,65 C126,65 130,96 150,96" fill="none" strokeWidth="3" strokeLinecap="round"
          stroke={committed === "A" ? "#242424" : T.border} style={{ transition: "stroke .4s" }} />
        <path d="M8,65 H96 C126,65 130,34 150,34" pathLength="1" fill="none" stroke="url(#wrfGrad)"
          strokeWidth="3" strokeLinecap="round" style={{ ...glowSt(committed === "A"), filter: "drop-shadow(0 0 5px rgba(201,100,66,.65))" }} />
        <path d="M8,65 H96 C126,65 130,96 150,96" pathLength="1" fill="none" stroke="url(#wrfGrad)"
          strokeWidth="3" strokeLinecap="round" style={{ ...glowSt(committed === "B"), filter: "drop-shadow(0 0 5px rgba(201,100,66,.65))" }} />
      </svg>
      <span aria-hidden="true"
        className={noMotion ? "wrf-ember wrf-still" : committed ? `wrf-ember wrf-run${committed}` : "wrf-ember"} />
      <button onClick={() => pick("A", "itinerary")} aria-label="Full itinerary — a day-by-day plan"
        style={{ ...pillSt(committed === "A", committed === "B"), top: 12 }}>
        <span style={{ display: "block", fontSize: T.fs.meta, fontWeight: 800, color: T.ink, lineHeight: 1.25 }}>Full itinerary</span>
        <span style={{ display: "block", fontSize: T.fs.micro, fontWeight: 600, color: T.hint, lineHeight: 1.3 }}>day-by-day plan</span>
      </button>
      <button onClick={() => pick("B", "bucket")} aria-label="Bucket list — just the activities, no dates"
        style={{ ...pillSt(committed === "B", committed === "A"), top: 74 }}>
        <span style={{ display: "block", fontSize: T.fs.meta, fontWeight: 800, color: T.ink, lineHeight: 1.25 }}>Bucket list</span>
        <span style={{ display: "block", fontSize: T.fs.micro, fontWeight: 600, color: T.hint, lineHeight: 1.3 }}>just the activities</span>
      </button>
    </div>
  );
}

export default function WelcomeScreen({ onStart, hasProfile, profile, onUpdateProfile, savedTrip, onResume, trips = [], onDeleteTrip }) {
  const [dest, setDest]                     = useState("");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderFade, setPlaceholderFade] = useState(true);
  const [showAbout, setShowAbout]           = useState(false);
  const [showSettings, setShowSettings]     = useState(false);
  const [showProfile, setShowProfile]       = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [suggestions, setSuggestions]       = useState([]);
  const [destPicked, setDestPicked]         = useState(false); // a suggestion was chosen (or "use as typed")
  const [pickBurst, setPickBurst]           = useState(0);     // 8C stardust — increments each time the ✓ lands
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
    setPickBurst(b => b + 1);
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

  // Motion is idle-only (design picks 8A + 8D): the comet orbits and the
  // placeholder shimmers only while the field is empty. The first keystroke
  // calms both to the static accent look — movement never competes with the
  // user's own text. (Not gated on focus: the field is autofocused on load,
  // which is precisely the idle moment the motion exists for.)
  const destIdle = dest.length === 0;

  // One card renderer for BOTH the mobile shelf and the desktop departures
  // rail (12B binding constraint: arrangements may arrange, never rebuild).
  // 1A ticket stubs (2026-08-11 feedback pick): a trip renders as a small
  // boarding pass — main panel, dashed perforation with notch punches, and a
  // nights tail — so it can never be mistaken for the Where-to input again
  // (the 2026-08-08 note: "the pill looks almost identical to the box").
  // The notch punches match the surface behind the card: bg0 page on mobile,
  // bg1 departures rail on desktop.
  const renderTripCard = (t) => {
    const isActive   = t.id === savedTrip?.id;
    const confirming = confirmDeleteId === t.id;
    const start  = t.answers?.dates?.start;
    const stub   = stubDate(start);
    const broken = !!t._error;
    // Bucket trips (1F, 2026-08-15) carry no date words anywhere — the card
    // identifies by place + activities: "18 ideas · 6 picked", IDEAS tail.
    const isBucketTrip = t.tripStyle === "bucket";
    const ideas  = isBucketTrip ? countIdeas(t.categories) : 0;
    const picked = isBucketTrip ? Object.keys(t.bucketPicks || {}).length : 0;
    const punchBg = isWide ? T.bg1 : T.bg0;
    const sub = broken
      ? "build didn't finish — tap to rebuild"
      : isBucketTrip
        ? [`${ideas} ${ideas === 1 ? "idea" : "ideas"}`, picked ? `${picked} picked` : ""].filter(Boolean).join(" · ")
        : [stub && `${stub.mon} ${stub.day}`, departsIn(start)].filter(Boolean).join(" · ") || "planning";
    if (confirming) {
      return (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${T.border2}`, borderRadius: T.r.md, background: T.bg1, padding: "12px 14px", marginBottom: 8 }}>
          <div style={{ flex: 1, fontSize: T.fs.body, color: T.muted }}>
            Delete <strong style={{ color: T.ink }}>{t.destination}</strong> and its itinerary?
          </div>
          <button onClick={() => { onDeleteTrip?.(t.id); setConfirmDeleteId(null); }}
            style={{ fontSize: T.fs.meta, fontWeight: 700, color: T.white, background: T.accent, border: "none", borderRadius: T.r.sm, padding: "5px 10px", cursor: "pointer", fontFamily: T.font }}>
            Delete
          </button>
          <button onClick={() => setConfirmDeleteId(null)}
            style={{ fontSize: T.fs.meta, fontWeight: 600, color: T.muted, background: "transparent", border: `1px solid ${T.border}`, borderRadius: T.r.sm, padding: "5px 10px", cursor: "pointer", fontFamily: T.font }}>
            Keep
          </button>
        </div>
      );
    }
    return (
      <div key={t.id}
        style={{ position: "relative", display: "flex", alignItems: "stretch", border: `1px solid ${isActive ? T.border2 : T.border}`, borderRadius: T.r.md, background: T.bg1, marginBottom: 10, opacity: broken ? .9 : 1, overflow: "hidden" /* clips the notch punches to half-circle bites — unclipped, adjacent cards' punches merge in the gap and the shelf reads as one sewn-together strip */ }}>
        <button onClick={() => onResume(t.id)}
          style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", fontFamily: T.font, padding: "11px 6px 11px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
            <span style={{ fontSize: T.fs.ui, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.destination}</span>
            {isActive && <span style={{ fontSize: T.fs.micro, fontWeight: 700, color: T.accent, border: `1px solid ${T.accent}`, borderRadius: T.r.pill, padding: "1px 6px", letterSpacing: ".06em", flexShrink: 0 }}>CURRENT</span>}
          </div>
          <div style={{ fontSize: T.fs.label, color: broken ? "#f08070" : T.muted, marginTop: 3 }}>{sub}</div>
        </button>
        <button onClick={() => setConfirmDeleteId(t.id)} aria-label={`Delete ${t.destination}`}
          style={{ width: 30, alignSelf: "stretch", fontSize: T.fs.ui, lineHeight: 1, color: T.hint, background: "transparent", border: "none", cursor: "pointer", fontFamily: T.font, flexShrink: 0 }}>
          ×
        </button>
        {/* Perforation + nights tail — the part that says "ticket". */}
        <div style={{ position: "relative", width: 56, flexShrink: 0, borderLeft: `1.5px dashed ${T.border2}`, background: T.bg2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
          <span aria-hidden="true" style={{ position: "absolute", left: -6.5, top: -6.5, width: 11, height: 11, borderRadius: "50%", background: punchBg, border: `1px solid ${isActive ? T.border2 : T.border}` }} />
          <span aria-hidden="true" style={{ position: "absolute", left: -6.5, bottom: -6.5, width: 11, height: 11, borderRadius: "50%", background: punchBg, border: `1px solid ${isActive ? T.border2 : T.border}` }} />
          {broken ? (
            <span style={{ color: T.accent, fontWeight: 800, fontSize: T.fs.title }}>↻</span>
          ) : isBucketTrip ? (
            <>
              <span style={{ fontSize: T.fs.title, fontWeight: 800, color: T.accent, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{ideas}</span>
              <span style={{ fontSize: T.fs.micro, fontWeight: 800, letterSpacing: ".14em", color: T.hint, textTransform: "uppercase" }}>{ideas === 1 ? "idea" : "ideas"}</span>
            </>
          ) : t.nights ? (
            <>
              <span style={{ fontSize: T.fs.title, fontWeight: 800, color: T.accent, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{t.nights}</span>
              <span style={{ fontSize: T.fs.micro, fontWeight: 800, letterSpacing: ".14em", color: T.hint, textTransform: "uppercase" }}>{t.nights === 1 ? "night" : "nights"}</span>
            </>
          ) : (
            <Glyph name="plane" size={14} color={T.hint} />
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={ isWide
      ? { minHeight: "100vh", width: "100%", display: "flex", alignItems: "stretch", background: T.bg0, fontFamily: T.font, position: "relative" }
      : { minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2.5rem 1.5rem", background: T.bg0, fontFamily: T.font, position: "relative" } }>
      <style>{`
        @property --wbeam { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
        @keyframes wbeam { to { --wbeam: 360deg; } }
        .wbeam-idle {
          background: conic-gradient(from var(--wbeam),
            rgba(201,100,66,.18) 0turn, rgba(201,100,66,.18) .8turn,
            ${T.accent} .92turn, #ffc79b .965turn, rgba(201,100,66,.18) 1turn);
          animation: wbeam 3.8s linear infinite;
        }
        @keyframes wshim { to { background-position: -220% 0; } }
        .wshim {
          background: linear-gradient(100deg, ${T.hint} 42%, #f4e9e2 50%, ${T.hint} 58%);
          background-size: 220% 100%;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: wshim 2.7s linear infinite;
        }
        /* Rail-fork ember (1F). Idle: patrols the trunk toward the junction.
           Run: commits down the chosen branch (paths must mirror the SVG). */
        .wrf-ember{position:absolute;width:11px;height:11px;border-radius:50%;z-index:2;pointer-events:none;
          background:radial-gradient(circle at 38% 35%, #ffd9b3 0%, #ffc79b 34%, ${T.accent} 72%, rgba(201,100,66,0) 100%);
          box-shadow:0 0 10px 2px rgba(224,112,80,.75), 0 0 26px 6px rgba(201,100,66,.3);
          offset-path:path("M8,65 H96");offset-distance:4%;
          animation:wrfidle 2.6s ease-in-out infinite alternate}
        @keyframes wrfidle{from{offset-distance:4%}to{offset-distance:96%}}
        .wrf-ember.wrf-runA{offset-path:path("M8,65 H96 C126,65 130,34 150,34");animation:wrfrun .5s ease-in-out forwards}
        .wrf-ember.wrf-runB{offset-path:path("M8,65 H96 C126,65 130,96 150,96");animation:wrfrun .5s ease-in-out forwards}
        @keyframes wrfrun{from{offset-distance:0%}to{offset-distance:100%}}
        .wrf-ember.wrf-still{animation:none;offset-distance:96%}
        @media (prefers-reduced-motion: reduce) {
          .wbeam-idle { animation: none; background: ${T.accent}; }
          .wshim { animation: none; background: none; color: ${T.hint}; }
          .wrf-ember { animation: none; offset-distance: 96%; }
        }
      `}</style>

      {/* Settings — device-bound app settings; future account-page home */}
      <button onClick={() => setShowSettings(true)} aria-label="Settings"
        style={{ position: "fixed", top: 16, right: (isWide ? 332 : 16) + 40, width: 32, height: 32, borderRadius: "50%", background: T.bg2, border: `1px solid ${T.border}`, color: T.muted, fontSize: T.fs.ui, fontWeight: 700, cursor: "pointer", fontFamily: T.font, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
        ⚙
      </button>

      {/* Help affordance — unambiguous "?" that opens an About panel */}
      <button onClick={() => setShowAbout(true)} aria-label="About Wandr"
        style={{ position: "fixed", top: 16, right: isWide ? 332 : 16, width: 32, height: 32, borderRadius: "50%", background: T.bg2, border: `1px solid ${T.border}`, color: T.muted, fontSize: T.fs.ui, fontWeight: 700, cursor: "pointer", fontFamily: T.font, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
        ?
      </button>

      {/* About panel */}
      {showAbout && (
        <div onClick={() => setShowAbout(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
          <div onClick={e => e.stopPropagation()} className="fade-up"
            style={{ width: "100%", maxWidth: 380, background: T.bg1, border: `1px solid ${T.border}`, borderRadius: T.r.lg, padding: "1.5rem 1.5rem 1.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: T.fs.title, fontWeight: 700, color: T.ink }}>Wandr into your next trip</div>
              <button onClick={() => setShowAbout(false)} aria-label="Close"
                style={{ width: 26, height: 26, borderRadius: "50%", background: "transparent", border: "none", color: T.hint, fontSize: T.fs.title, cursor: "pointer", fontFamily: T.font, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: T.fs.body, color: T.muted, lineHeight: 1.6, marginBottom: 16 }}>
              Answer a few quick questions and Wandr builds you a personal trip — tailored to your pace, budget, and what you actually care about.
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

        {/* Dotted flight path — texture for the desktop void (12B) */}
        {isWide && (
          <svg viewBox="0 0 900 560" preserveAspectRatio="none" aria-hidden="true"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            <path d="M-20 480 Q 300 190 640 290 T 960 100" fill="none" stroke={T.accent}
              strokeWidth="1.2" strokeDasharray="1 8" opacity=".22" strokeLinecap="round" />
          </svg>
        )}

        {/* Brand — splash-centered on mobile; a quiet top-left row on desktop
            so the input, not the logo, owns the stage (12B). */}
        <div style={ isWide
          ? { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 0 }
          : { textAlign: "center", marginBottom: "2.75rem" } }>
          <WandrLogo size={isWide ? "sm" : "lg"} globe="animated" showTrail={false} />
          <div style={{ fontSize: isWide ? T.fs.body : T.fs.ui, fontWeight: 600, color: T.muted, letterSpacing: ".02em", marginTop: isWide ? 0 : "1rem" }}>
            Make it your trip.
          </div>
        </div>

        {/* On desktop everything actionable lives in a 560px stage column that
            starts at the upper-third line. */}
        <div style={ isWide ? { maxWidth: 560, width: "100%", marginTop: "16vh", position: "relative" } : undefined }>

        {/* Destination input */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: T.fs.meta, fontWeight: 700, color: T.hint, textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 8 }}>Where to?</div>
          {/* Comet ring (8A): the wrapper IS the border — a 1.5px ring the
              gradient orbits while idle, solid accent otherwise. */}
          <div className={destIdle ? "wbeam-idle" : undefined}
            style={{ position: "relative", borderRadius: T.r.md, padding: 1.5, ...(destIdle ? {} : { background: T.accent }) }}>
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={dest}
              maxLength={INPUT_CAPS.destination}
              onChange={e => { setDest(e.target.value); setDestPicked(false); }}
              onKeyDown={e => e.key === "Enter" && handleStart(hasProfile ? "continue" : "fresh")}
              style={{ width: "100%", padding: "14px 16px", fontSize: T.fs.title, fontWeight: 600, background: T.bg1, border: "none", borderRadius: 10.5 /* off-ramp: inner radius = ring wrapper T.r.md(12) minus 1.5 padding */, color: T.ink, outline: "none", fontFamily: T.font, colorScheme: "dark", boxSizing: "border-box", display: "block" }}
            />
            {dest.length === 0 && (
              <div className={destIdle ? "wshim" : undefined}
                style={{ position: "absolute", left: 24, top: "50%", transform: "translateY(-50%)", fontSize: T.fs.title, fontWeight: 600, color: destIdle ? undefined : T.hint, pointerEvents: "none", opacity: placeholderFade ? 1 : 0, transition: "opacity .18s ease" }}>
                {DEST_PLACEHOLDERS[placeholderIdx]}
              </div>
            )}
            {destPicked && (
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: T.accent, fontWeight: 800, fontSize: T.fs.ui, pointerEvents: "none" }}>✓</span>
            )}
            <StardustBurst burstKey={pickBurst} origin={{ right: 12, top: "50%" }} />
          </div>
          {suggestions.length > 0 && (
            <div className="fade-up" style={{ marginTop: 6, background: T.bg1, border: `1px solid ${T.border2}`, borderRadius: T.r.md, overflow: "hidden" }}>
              {suggestions.map((s, i) => (
                <button key={s.placeId || i} onClick={() => pickSuggestion(s)}
                  style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "11px 14px", background: "transparent", border: "none", borderTop: i === 0 ? "none" : `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.font }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M12 21s7-6.1 7-11.5A7 7 0 105 9.5C5 14.9 12 21 12 21z" stroke={i === 0 ? T.accent : T.hint} strokeWidth="2" />
                    {i === 0 && <circle cx="12" cy="9.5" r="2.4" fill={T.accent} />}
                  </svg>
                  <span style={{ fontSize: T.fs.ui, color: T.ink, fontWeight: 600 }}>
                    {s.main}
                    {s.secondary && <span style={{ color: T.hint, fontWeight: 400 }}> — {s.secondary}</span>}
                  </span>
                </button>
              ))}
              <button onClick={() => { setDestPicked(true); setSuggestions([]); setPickBurst(b => b + 1); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "transparent", border: "none", borderTop: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.font, fontSize: T.fs.body, color: T.accent, fontWeight: 700 }}>
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
            <span style={{ color: T.accent, fontSize: T.fs.body, flexShrink: 0 }}>✦</span>
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
            <div style={{ fontSize: T.fs.label, fontWeight: 700, color: T.hint, textTransform: "uppercase", letterSpacing: ".16em", margin: "4px 0 8px" }}>My trips</div>
            {trips.map(renderTripCard)}
          </div>
        )}

      </div>

      {/* Departures rail (design pick 12B) — desktop's permanent trips surface.
          Same renderTripCard as the mobile shelf; only the arrangement differs. */}
      {isWide && (
        <div style={{ width: 316, flexShrink: 0, borderLeft: `1px solid ${T.border}`, background: T.bg1, padding: "22px 18px", overflowY: "auto" }}>
          <div style={{ fontSize: T.fs.label, fontWeight: 700, color: T.hint, textTransform: "uppercase", letterSpacing: ".18em", margin: "2px 0 12px" }}>Departures</div>
          {trips.map(renderTripCard)}
          <button onClick={() => inputRef.current?.focus()}
            style={{ width: "100%", border: `1px dashed ${T.border2}`, borderRadius: T.r.md, background: "transparent", textAlign: "center", padding: "11px 0", fontSize: T.fs.body, color: T.muted, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>
            + New trip
          </button>
        </div>
      )}

      {/* Traveler profile editor (design pick 6A) */}
      <SettingsSheet open={showSettings} onClose={() => setShowSettings(false)} tripCount={trips.length} />

      <ProfileSheet
        open={showProfile}
        profile={profile}
        onClose={() => setShowProfile(false)}
        onSave={onUpdateProfile}
      />
    </div>
  );
}
