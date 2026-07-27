import { useState, useEffect, useRef } from "react";
import { T, DEST_PLACEHOLDERS } from "../lib/constants.js";
import { formatShortDate } from "../lib/utils.js";
import { useOnline } from "../hooks/useOnline.js";
import WandrLogo from "./WandrLogo.jsx";

export default function WelcomeScreen({ onStart, hasProfile, savedTrip, onResume, trips = [], onDeleteTrip }) {
  const [dest, setDest]                     = useState("");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderFade, setPlaceholderFade] = useState(true);
  const [showAbout, setShowAbout]           = useState(false);
  const [showAllTrips, setShowAllTrips]     = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const intervalRef = useRef(null);
  const online = useOnline();

  // With one saved trip the UI stays exactly as it was — a single Resume
  // button. The list only appears once there's an actual choice to make.
  const hasMultiple = trips.length > 1;

  const destValid = dest.trim().length > 1;

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

  return (
    <div style={{ minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2.5rem 1.5rem", background: T.bg0, fontFamily: T.font, position: "relative" }}>

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
              <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>What Wandr does</div>
              <button onClick={() => setShowAbout(false)} aria-label="Close"
                style={{ width: 26, height: 26, borderRadius: "50%", background: "transparent", border: "none", color: T.hint, fontSize: 18, cursor: "pointer", fontFamily: T.font, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, marginBottom: 16 }}>
              Answer a few quick questions and Wandr builds you a personal trip — tailored to your pace, budget, and what you actually care about.
            </div>
            {[
              ["A day-by-day itinerary", "Every day planned, morning to night"],
              ["Activities picked for you", "Matched to your pace, interests, and budget"],
              ["Tips built into each day", "Timing, getting around, and what to skip"],
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
          <div style={{ position: "relative" }}>
            <input
              autoFocus
              type="text"
              value={dest}
              onChange={e => setDest(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleStart(hasProfile ? "continue" : "fresh")}
              style={{ width: "100%", padding: "14px 16px", fontSize: 16, fontWeight: 600, background: T.bg1, border: `1.5px solid ${T.accent}`, borderRadius: 10, color: T.ink, outline: "none", fontFamily: T.font, colorScheme: "dark", transition: "border-color .2s", boxSizing: "border-box" }}
            />
            {dest.length === 0 && (
              <div style={{ position: "absolute", left: 24, top: "50%", transform: "translateY(-50%)", fontSize: 16, fontWeight: 600, color: T.hint, pointerEvents: "none", opacity: placeholderFade ? 1 : 0, transition: "opacity .18s ease" }}>
                {DEST_PLACEHOLDERS[placeholderIdx]}
              </div>
            )}
          </div>
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

        {/* CTA — single "Let's go" for first-timers; three-way entry once a
            profile exists (Continue / Edit / Start fresh). */}
        {destValid && online && !hasProfile && (
          <button onClick={() => handleStart("fresh")} className="fade-up"
            style={{ width: "100%", background: T.accent, color: T.white, padding: "14px 0", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", border: "none", fontFamily: T.font, marginBottom: "1rem" }}>
            Let's go →
          </button>
        )}
        {destValid && online && hasProfile && (
          <div className="fade-up" style={{ marginBottom: "1rem" }}>
            <button onClick={() => handleStart("continue")}
              style={{ width: "100%", background: T.accent, color: T.white, padding: "14px 0", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", border: "none", fontFamily: T.font, marginBottom: 8 }}>
              Continue with my preferences →
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => handleStart("edit")}
                style={{ flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 600, color: T.muted, background: "transparent", border: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.font }}>
                Edit preferences
              </button>
              <button onClick={() => handleStart("fresh")}
                style={{ flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 600, color: T.hint, background: "transparent", border: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.font }}>
                Start fresh
              </button>
            </div>
          </div>
        )}
        {!destValid && <div style={{ height: 16 }} />}

        {/* Resume the active trip. With more than one saved, a disclosure opens
            the full list so the others are reachable instead of stored-but-lost. */}
        {savedTrip?.destination && (
          <button onClick={() => onResume()}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 600, color: T.muted, background: "transparent", border: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.font, marginBottom: hasMultiple ? 8 : "1.5rem" }}>
            <span style={{ fontSize: 12 }}>↩</span> Resume: <strong style={{ color: T.ink }}>{savedTrip.destination}</strong>
          </button>
        )}

        {savedTrip?.destination && hasMultiple && (
          <div style={{ marginBottom: "1.5rem" }}>
            <button onClick={() => { setShowAllTrips(v => !v); setConfirmDeleteId(null); }}
              style={{ width: "100%", padding: "7px 0", background: "transparent", border: "none", color: T.hint, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>
              {showAllTrips ? "Hide" : `All trips (${trips.length})`} {showAllTrips ? "▴" : "▾"}
            </button>

            {showAllTrips && (
              <div className="fade-up" style={{ marginTop: 4, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
                {trips.map((t, i) => {
                  const isActive    = t.id === savedTrip.id;
                  const confirming  = confirmDeleteId === t.id;
                  const dates = [t.answers?.dates?.start, t.answers?.dates?.end].every(Boolean)
                    ? `${formatShortDate(t.answers.dates.start)} → ${formatShortDate(t.answers.dates.end)}`
                    : `${t.nights || "?"} nights`;
                  return (
                    <div key={t.id}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: isActive ? T.bg2 : T.bg1, borderTop: i === 0 ? "none" : `1px solid ${T.border}` }}>
                      {confirming ? (
                        <>
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
                        </>
                      ) : (
                        <>
                          <button onClick={() => onResume(t.id)}
                            style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", fontFamily: T.font, padding: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, display: "flex", alignItems: "center", gap: 6 }}>
                              {t.destination}
                              {isActive && <span style={{ fontSize: 9, fontWeight: 700, color: T.accent, border: `1px solid ${T.accent}`, borderRadius: 100, padding: "1px 6px", letterSpacing: ".06em" }}>CURRENT</span>}
                            </div>
                            <div style={{ fontSize: 11, color: T.hint, marginTop: 2 }}>{dates}</div>
                          </button>
                          <button onClick={() => setConfirmDeleteId(t.id)} aria-label={`Delete ${t.destination}`}
                            style={{ fontSize: 14, lineHeight: 1, color: T.hint, background: "transparent", border: "none", cursor: "pointer", fontFamily: T.font, padding: "4px 2px" }}>
                            ×
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {!savedTrip?.destination && destValid && <div style={{ height: "1.5rem" }} />}
        {!savedTrip?.destination && !destValid && <div style={{ height: 0 }} />}

      </div>
    </div>
  );
}
