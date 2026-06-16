import { useState, useEffect, useRef } from "react";
import { T, DEST_PLACEHOLDERS } from "../lib/constants.js";
import WandrLogo from "./WandrLogo.jsx";

export default function WelcomeScreen({ onStart, savedTrip, onResume }) {
  const [dest, setDest]                     = useState("");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderFade, setPlaceholderFade] = useState(true);
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
    <div style={{ minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2.5rem 1.5rem", background: T.bg0, fontFamily: T.font }}>
      <div style={{ width: "100%", maxWidth: 440 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2.75rem" }}>
          <WandrLogo size="lg" />
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

        {/* Feature pills */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          {["Daily itinerary","Dining guide","Insider intel","Photography guide"].map(label => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 9, fontSize: 12, color: T.hint }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.accent, flexShrink: 0, display: "inline-block", opacity: .7 }} />
              <span style={{ fontWeight: 500 }}>{label}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
