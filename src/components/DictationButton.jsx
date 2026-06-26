/**
 * DictationButton — voice-to-text mic for any free-text field.
 *
 * Uses the browser's built-in Web Speech API (no API key, no cost). Appends
 * recognised speech to the field's current value via onChange. Renders nothing
 * on browsers without support (e.g. Firefox), so there's never a dead control.
 *
 * Props:
 *   value    — current field value (string)
 *   onChange — setter; called with the new full string as speech comes in
 *   style    — optional positioning overrides (defaults to bottom-right)
 */
import { useEffect, useRef, useState } from "react";
import { T } from "../lib/constants.js";

const SR = typeof window !== "undefined" &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

export default function DictationButton({ value, onChange, style }) {
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);

  // Inject the pulse keyframes once, and stop any live recognition on unmount.
  useEffect(() => {
    if (typeof document !== "undefined" && !document.getElementById("wandr-mic-style")) {
      const s = document.createElement("style");
      s.id = "wandr-mic-style";
      s.textContent =
        "@keyframes wandrMicPulse{0%{box-shadow:0 0 0 0 rgba(201,100,66,.45)}70%{box-shadow:0 0 0 7px rgba(201,100,66,0)}100%{box-shadow:0 0 0 0 rgba(201,100,66,0)}}";
      document.head.appendChild(s);
    }
    return () => { try { recRef.current?.stop(); } catch {} };
  }, []);

  if (!SR) return null;

  function start() {
    let rec;
    try { rec = new SR(); } catch { return; }
    rec.continuous     = true;
    rec.interimResults = true;
    rec.lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";

    // Preserve whatever's already typed, then append dictated speech to it.
    const base = value && value.trim() ? value.replace(/\s+$/, "") + " " : "";
    let finalText = base;

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += chunk.trim() + " ";
        else interim += chunk;
      }
      onChange(finalText + interim);
    };
    rec.onend   = () => setListening(false);
    rec.onerror = () => setListening(false);

    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  }

  function stop() {
    try { recRef.current?.stop(); } catch {}
    setListening(false);
  }

  return (
    <button
      type="button"
      onClick={() => (listening ? stop() : start())}
      aria-label={listening ? "Stop dictation" : "Dictate with your voice"}
      title={listening ? "Stop dictation" : "Dictate"}
      style={{
        position: "absolute", bottom: 10, right: 10,
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 30, height: 30, borderRadius: "50%",
        background: listening ? T.accent : T.bg2,
        border: `1px solid ${listening ? T.accent : T.border}`,
        color: listening ? "#fff" : T.muted,
        cursor: "pointer", padding: 0, transition: "background .15s, border-color .15s, color .15s",
        animation: listening ? "wandrMicPulse 1.4s infinite" : "none",
        ...style,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="2" width="6" height="11" rx="3" />
        <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    </button>
  );
}
