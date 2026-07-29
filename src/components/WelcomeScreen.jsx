import { useState, useEffect, useRef } from "react";
import { T, DEST_PLACEHOLDERS } from "../lib/constants.js";
import { parseISODate } from "../lib/utils.js";
import { useOnline } from "../hooks/useOnline.js";
import { fetchDestinationSuggestions } from "../lib/places.js";
import WandrLogo from "./WandrLogo.jsx";
import ProfileSheet from "./ProfileSheet.jsx";
import StardustBurst from "./StardustBurst.jsx";

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

export default function WelcomeScreen({ onStart, hasProfile, profile, onUpdateProfile, savedTrip, onResume, trips = [], onDeleteTrip }) {
  const [dest, setDest]                     = useState("");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderFade, setPlaceholderFade] = useState(true);
  const [showAbout, setShowAbout]           = useState(false);
  const [showProfile, setShowProfile]       = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [suggestions, setSuggestions]       = useState([]);
  const [destPicked, setDestPicked]         = useState(false); // a suggestion was chosen (or "use as typed")
  const [pickBurst, setPickBurst]           = useState(0);     // 8C stardust — increments each time the ✓ lands
  const intervalRef = useRef(null);
  const online = useOnline();

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

  function handleStart(mode = "fresh") {
    if (!destValid || !online) return;   // building a trip requires the AI
    onStart(dest.trim(), mode);
  }

  // Motion is idle-only (design picks 8A + 8D): the comet orbits and the
  // placeholder shimmers only while the field is empty. The first keystroke
  // calms both to the static accent look — movement never competes with the
  // user's own text. (Not gated on focus: the field is autofocused on load,
  // which is precisely the idle moment the motion exists for.)
  const destIdle = dest.length === 0;

  return (
    <div style={{ minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2.5rem 1.5rem", background: T.bg0, fontFamily: T.font, position: "relative" }}>
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
        @media (prefers-reduced-motion: reduce) {
          .wbeam-idle { animation: none; background: ${T.accent}; }
          .wshim { animation: none; background: none; color: ${T.hint}; }
        }
      `}</style>

      {/* Help affordance — unambiguous "?" that opens an About panel */}
      <button onClick={() => setShowAbout(true)} aria-label="About Wandr"
        style={{ position: "fixed", top: 16, right: 16, width: 32, height: 32, borderRadius: "50%", background: T.bg2, border: `1px solid ${T.border}`, color: T.muted, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: T.font, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
        ?
      </button>

      {/* About panel */}
      {showAbout && (
        <div onClick={() => setShowAbout(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
          <div onClick={e => e.stopPropagation()} className="fade-up"
            style={{ width: "100%", maxWidth: 380, background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 14, padding: "1.5rem 1.5rem 1.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>Wandr into your next trip</div>
              <button onClick={() => setShowAbout(false)} aria-label="Close"
                style={{ width: 26, height: 26, borderRadius: "50%", background: "transparent", border: "none", color: T.hint, fontSize: 18, cursor: "pointer", fontFamily: T.font, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, marginBottom: 16 }}>
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{title}</div>
                  <div style={{ fontSize: 12, color: T.hint, lineHeight: 1.5 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ width: "100%", maxWidth: 440 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2.75rem" }}>
          <WandrLogo size="lg" globe="animated" showTrail={false} />
          <div style={{ fontSize: 14, fontWeight: 600, color: T.muted, letterSpacing: ".02em", marginTop: "1rem" }}>
            Make it your trip.
          </div>
        </div>

        {/* Destination input */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.hint, textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 8 }}>Where to?</div>
          {/* Comet ring (8A): the wrapper IS the border — a 1.5px ring the
              gradient orbits while idle, solid accent otherwise. */}
          <div className={destIdle ? "wbeam-idle" : undefined}
            style={{ position: "relative", borderRadius: 12, padding: 1.5, ...(destIdle ? {} : { background: T.accent }) }}>
            <input
              autoFocus
              type="text"
              value={dest}
              onChange={e => { setDest(e.target.value); setDestPicked(false); }}
              onKeyDown={e => e.key === "Enter" && handleStart(hasProfile ? "continue" : "fresh")}
              style={{ width: "100%", padding: "14px 16px", fontSize: 16, fontWeight: 600, background: T.bg1, border: "none", borderRadius: 10.5, color: T.ink, outline: "none", fontFamily: T.font, colorScheme: "dark", boxSizing: "border-box", display: "block" }}
            />
            {dest.length === 0 && (
              <div className={destIdle ? "wshim" : undefined}
                style={{ position: "absolute", left: 24, top: "50%", transform: "translateY(-50%)", fontSize: 16, fontWeight: 600, color: destIdle ? undefined : T.hint, pointerEvents: "none", opacity: placeholderFade ? 1 : 0, transition: "opacity .18s ease" }}>
                {DEST_PLACEHOLDERS[placeholderIdx]}
              </div>
            )}
            {destPicked && (
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: T.accent, fontWeight: 800, fontSize: 14, pointerEvents: "none" }}>✓</span>
            )}
            <StardustBurst burstKey={pickBurst} origin={{ right: 12, top: "50%" }} />
          </div>
          {suggestions.length > 0 && (
            <div className="fade-up" style={{ marginTop: 6, background: T.bg1, border: `1px solid ${T.border2}`, borderRadius: 12, overflow: "hidden" }}>
              {suggestions.map((s, i) => (
                <button key={s.placeId || i} onClick={() => pickSuggestion(s)}
                  style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "11px 14px", background: "transparent", border: "none", borderTop: i === 0 ? "none" : `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.font }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M12 21s7-6.1 7-11.5A7 7 0 105 9.5C5 14.9 12 21 12 21z" stroke={i === 0 ? T.accent : T.hint} strokeWidth="2" />
                    {i === 0 && <circle cx="12" cy="9.5" r="2.4" fill={T.accent} />}
                  </svg>
                  <span style={{ fontSize: 13.5, color: T.ink, fontWeight: 600 }}>
                    {s.main}
                    {s.secondary && <span style={{ color: T.hint, fontWeight: 400 }}> — {s.secondary}</span>}
                  </span>
                </button>
              ))}
              <button onClick={() => { setDestPicked(true); setSuggestions([]); setPickBurst(b => b + 1); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "transparent", border: "none", borderTop: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.font, fontSize: 12, color: T.accent, fontWeight: 700 }}>
                Use “{dest.trim()}” as typed →
              </button>
            </div>
          )}
        </div>

        {/* Offline notice — building a trip needs the AI, so say so plainly
            instead of letting the CTA fail on tap. A saved trip still opens. */}
        {!online && (
          <div style={{ marginBottom: 16, padding: "10px 12px", background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
            <strong style={{ color: T.ink }}>You're offline.</strong>{" "}
            {savedTrip?.destination
              ? "Your saved trip opens below — new trips need a connection."
              : "New trips need a connection. Anything you've already saved will open here."}
          </div>
        )}

        {/* CTA — "Let's go" for first-timers; once a profile exists the primary
            action plans with it (design pick 6B), and "start fresh" demotes to
            a text link. Editing preferences opens the ProfileSheet — never the
            interview. */}
        {destValid && online && !hasProfile && (
          <button onClick={() => handleStart("fresh")} className="fade-up"
            style={{ width: "100%", background: T.accent, color: T.white, padding: "14px 0", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", border: "none", fontFamily: T.font, marginBottom: "1rem" }}>
            Let's go →
          </button>
        )}
        {destValid && online && hasProfile && (
          <button onClick={() => handleStart("continue")} className="fade-up"
            style={{ width: "100%", background: T.accent, color: T.white, padding: "14px 0", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", border: "none", fontFamily: T.font, marginBottom: 10 }}>
            Plan it my way →
          </button>
        )}

        {/* Traveler profile strip — always visible once a profile exists, so
            "my way" is never a mystery. Edit opens the profile sheet. */}
        {hasProfile && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${T.border}`, borderRadius: 12, background: T.bg1, padding: "11px 14px", marginBottom: destValid ? 8 : 16 }}>
            <span style={{ color: T.accent, fontSize: 13, flexShrink: 0 }}>✦</span>
            <span style={{ fontSize: 11.5, color: T.muted, flex: 1, lineHeight: 1.45 }}>{profileSummary(profile) || "Your traveler profile"}</span>
            <button onClick={() => setShowProfile(true)}
              style={{ fontSize: 11, fontWeight: 700, color: T.accent, background: "transparent", border: "none", cursor: "pointer", fontFamily: T.font, padding: "2px 2px", flexShrink: 0 }}>
              Edit
            </button>
          </div>
        )}
        {destValid && online && hasProfile && (
          <button onClick={() => handleStart("fresh")}
            style={{ width: "100%", padding: "4px 0 0", background: "transparent", border: "none", color: T.hint, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: T.font, marginBottom: 16 }}>
            or start from a blank slate
          </button>
        )}
        {!destValid && !hasProfile && <div style={{ height: 16 }} />}

        {/* My trips — mini boarding-pass shelf (design pick 7A). Same ticket
            metaphor as the dashboard hero; a failed build says so and offers a
            rebuild instead of resuming into a broken trip. */}
        {trips.length > 0 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.hint, textTransform: "uppercase", letterSpacing: ".16em", margin: "4px 0 8px" }}>My trips</div>
            {trips.map(t => {
              const isActive   = t.id === savedTrip?.id;
              const confirming = confirmDeleteId === t.id;
              const stub  = stubDate(t.answers?.dates?.start);
              const broken = !!t._error;
              const sub = broken
                ? "build didn't finish — tap to rebuild"
                : t.nights ? `${t.nights} ${t.nights === 1 ? "night" : "nights"}` : "";
              if (confirming) {
                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${T.border2}`, borderRadius: 12, background: T.bg1, padding: "12px 14px", marginBottom: 8 }}>
                    <div style={{ flex: 1, fontSize: 12, color: T.muted }}>
                      Delete <strong style={{ color: T.ink }}>{t.destination}</strong> and its itinerary?
                    </div>
                    <button onClick={() => { onDeleteTrip?.(t.id); setConfirmDeleteId(null); }}
                      style={{ fontSize: 11, fontWeight: 700, color: T.white, background: T.accent, border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontFamily: T.font }}>
                      Delete
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)}
                      style={{ fontSize: 11, fontWeight: 600, color: T.muted, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontFamily: T.font }}>
                      Keep
                    </button>
                  </div>
                );
              }
              return (
                <div key={t.id}
                  style={{ display: "flex", alignItems: "stretch", border: `1px solid ${isActive ? T.border2 : T.border}`, borderRadius: 12, background: T.bg1, overflow: "hidden", marginBottom: 8, opacity: broken ? .9 : 1 }}>
                  <div style={{ background: T.bg2, borderRight: `1px dashed ${T.border2}`, padding: "9px 12px", textAlign: "center", alignSelf: "stretch", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 46 }}>
                    {stub ? (
                      <>
                        <div style={{ fontSize: 9, fontWeight: 800, color: T.accent, letterSpacing: ".08em" }}>{stub.mon}</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{stub.day}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 15, color: T.hint }}>✈</div>
                    )}
                  </div>
                  <button onClick={() => onResume(t.id)}
                    style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", fontFamily: T.font, padding: "9px 13px", minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.destination}</span>
                      {isActive && <span style={{ fontSize: 8.5, fontWeight: 700, color: T.accent, border: `1px solid ${T.accent}`, borderRadius: 100, padding: "1px 6px", letterSpacing: ".06em", flexShrink: 0 }}>CURRENT</span>}
                    </div>
                    <div style={{ fontSize: 10.5, color: broken ? "#f08070" : T.hint, marginTop: 2 }}>{sub}</div>
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: 2, paddingRight: 10 }}>
                    <span style={{ color: broken ? T.hint : T.accent, fontWeight: 800, fontSize: 13 }}>{broken ? "↻" : "↩"}</span>
                    <button onClick={() => setConfirmDeleteId(t.id)} aria-label={`Delete ${t.destination}`}
                      style={{ fontSize: 14, lineHeight: 1, color: T.hint, background: "transparent", border: "none", cursor: "pointer", fontFamily: T.font, padding: "4px 4px" }}>
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Traveler profile editor (design pick 6A) */}
      <ProfileSheet
        open={showProfile}
        profile={profile}
        onClose={() => setShowProfile(false)}
        onSave={onUpdateProfile}
      />
    </div>
  );
}
