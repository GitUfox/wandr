import { useState, useEffect, useRef } from "react";
import { T, DEST_PLACEHOLDERS } from "../lib/constants.js";
import WandrLogo from "./WandrLogo.jsx";

export default function WelcomeScreen({ onStart, savedTrip, onResume }) {
  const [dest, setDest]                     = useState("");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderFade, setPlaceholderFade] = useState(true);
  const [showAbout, setShowAbout]           = useState(false);
  const intervalRef = useRef(null);

  const destValid = dest.trim().length > 1;

  useEffect(() => {
    if (dest.length > 0) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      setPlaceholderFade(false);
      setTimeout(() => { setPlaceholderIdx(i => (i + 1) % DEST_PLACEHOLDERS.length); setPlaceholderFade(true); }, 180);
    }, 2200);
    return () => clearInterval(intervalRef.current);
  }, [dest]);

  function handleStart() {
    if (!destValid) return;
    onStart(dest.trim());
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
              ["Dining for every meal", "Where to eat and what to order, to your budget"],
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
              onKeyDown={e => e.key === "Enter" && handleStart()}
              style={{ width: "100%", padding: "14px 16px", fontSize: 16, fontWeight: 600, background: T.bg1, border: `1.5px solid ${destValid ? T.accent : T.border}`, borderRadius: 10, color: T.ink, outline: "none", fontFamily: T.font, colorScheme: "dark", transition: "border-color .2s", boxSizing: "border-box" }}
            />
            {dest.length === 0 && (
              <div style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 16, fontWeight: 600, color: T.hint, pointerEvents: "none", opacity: placeholderFade ? 1 : 0, transition: "opacity .18s ease" }}>
                {DEST_PLACEHOLDERS[placeholderIdx]}
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        {destValid && (
          <button onClick={handleStart} className="fade-up"
            style={{ width: "100%", background: T.accent, color: T.white, padding: "14px 0", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", border: "none", fontFamily: T.font, marginBottom: "1rem" }}>
            Let's go →
          </button>
        )}
        {!destValid && <div style={{ height: 16 }} />}

        {/* Resume last trip */}
        {savedTrip?.destination && (
          <button onClick={onResume}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 600, color: T.muted, background: "transparent", border: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.font, marginBottom: "1.5rem" }}>
            <span style={{ fontSize: 12 }}>↩</span> Resume: <strong style={{ color: T.ink }}>{savedTrip.destination}</strong>
          </button>
        )}
        {!savedTrip?.destination && destValid && <div style={{ height: "1.5rem" }} />}
        {!savedTrip?.destination && !destValid && <div style={{ height: 0 }} />}

        {/* Honest value line — replaces the old fake-clickable feature pills */}
        <div style={{ textAlign: "center", fontSize: 12.5, color: T.hint, lineHeight: 1.6, padding: "0 8px" }}>
          A complete day-by-day itinerary, built around how you actually travel.
        </div>

      </div>
    </div>
  );
}
