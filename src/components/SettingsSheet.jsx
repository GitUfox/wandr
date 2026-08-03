/**
 * SettingsSheet — app settings, opened from the ⚙ on the welcome screen.
 *
 * Local-first skeleton of the future account page: today it holds the
 * device-bound settings (time format, data, app status); when a backend
 * lands, email / export / delete-account slot into this same surface.
 *
 * Same plain-CSS bottom-sheet pattern as ProfileSheet/EditTripSheet — framer's
 * y:"100%" computes wrong on fixed-bottom elements (see CLAUDE.md).
 */

import { useState } from "react";
import { T, FEATURES } from "../lib/constants.js";
import { MAX_TRIPS } from "../lib/tripStore.js";
import { getTimeFormat, saveSettings, clearAllWandrData } from "../lib/settings.js";

export default function SettingsSheet({ open, onClose, tripCount = 0 }) {
  const [timeFormat, setTimeFormat] = useState(getTimeFormat);
  const [confirmClear, setConfirmClear] = useState(false);

  const label = { fontSize: T.fs.label, fontWeight: 700, color: T.hint, textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 8 };
  const row = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: `1px solid ${T.border}` };

  function pickFormat(fmt) {
    saveSettings({ timeFormat: fmt });
    setTimeFormat(fmt);
  }

  function doClear() {
    clearAllWandrData();
    // Full reload lands on a true first-run state — no half-cleared UI.
    window.location.reload();
  }

  // Status rows are read-only trust surface, not toggles — kill switches stay
  // developer-owned (FEATURES in constants.js).
  const offlineReady = typeof navigator !== "undefined"
    && !!navigator.serviceWorker?.controller;

  return (
    <>
      <div onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)", zIndex: 100, opacity: open ? 1 : 0, transition: "opacity 0.22s ease", pointerEvents: open ? "auto" : "none" }} />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 101,
        maxWidth: 640, margin: "0 auto",
        background: T.bg1, borderRadius: `${T.r.lg}px ${T.r.lg}px 0 0`, border: `1px solid ${T.border2}`, borderBottom: "none",
        maxHeight: "88vh", overflowY: "auto",
        transform: open ? "translateY(0)" : "translateY(105%)",
        transition: "transform 0.38s cubic-bezier(.32,.72,.28,1)",
        padding: "1.25rem 1.5rem 1.75rem", fontFamily: T.font, boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: T.bg3, border: `1px solid ${T.border2}`, color: T.muted, fontWeight: 800, fontSize: T.fs.title, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>⚙</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: T.fs.title, fontWeight: 800, color: T.ink }}>Settings</div>
            <div style={{ fontSize: T.fs.meta, color: T.hint, marginTop: 1 }}>Everything stays on this device.</div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ width: 28, height: 28, borderRadius: "50%", background: "transparent", border: "none", color: T.hint, fontSize: T.fs.title, cursor: "pointer", fontFamily: T.font, lineHeight: 1 }}>×</button>
        </div>

        {/* ── Time format ── */}
        <div style={{ marginTop: 18 }}>
          <div style={label}>Time format</div>
          <div style={{ display: "inline-flex", background: T.bg2, border: `1px solid ${T.border}`, borderRadius: T.r.pill, padding: 3 }}>
            {[["24h", "24-hour · 17:30"], ["12h", "12-hour · 5:30 PM"]].map(([fmt, lbl]) => {
              const on = timeFormat === fmt;
              return (
                <button key={fmt} onClick={() => pickFormat(fmt)}
                  style={{ border: "none", borderRadius: T.r.pill, padding: "6px 14px", fontSize: T.fs.body, fontWeight: 700, fontFamily: T.font, cursor: "pointer", background: on ? T.accent : "transparent", color: on ? T.white : T.muted, transition: "all .12s" }}>
                  {lbl}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: T.fs.meta, color: T.hint, marginTop: 8, lineHeight: 1.5 }}>
            Applies to itinerary times and the time picker.
          </div>
        </div>

        {/* ── App status ── */}
        <div style={{ marginTop: 22 }}>
          <div style={label}>App</div>
          <div style={{ ...row }}>
            <span style={{ fontSize: T.fs.body, color: T.muted }}>Version</span>
            <span style={{ fontSize: T.fs.body, color: T.ink, fontWeight: 600 }}>2.0.0</span>
          </div>
          <div style={{ ...row }}>
            <span style={{ fontSize: T.fs.body, color: T.muted }}>Trips stored</span>
            <span style={{ fontSize: T.fs.body, color: T.ink, fontWeight: 600 }}>{tripCount} of {MAX_TRIPS}</span>
          </div>
          <div style={{ ...row }}>
            <span style={{ fontSize: T.fs.body, color: T.muted }}>Offline reading</span>
            <span style={{ fontSize: T.fs.body, color: offlineReady ? T.accent : T.hint, fontWeight: 600 }}>
              {offlineReady ? "Ready" : "After first online visit"}
            </span>
          </div>
          <div style={{ ...row, borderBottom: "none" }}>
            <span style={{ fontSize: T.fs.body, color: T.muted }}>Venue verification</span>
            <span style={{ fontSize: T.fs.body, color: T.hint, fontWeight: 600 }}>
              {FEATURES.venueGrounding ? "Waiting on activation" : "Off"}
            </span>
          </div>
        </div>

        {/* ── Data ── */}
        <div style={{ marginTop: 22 }}>
          <div style={label}>Your data</div>
          {!confirmClear ? (
            <button onClick={() => setConfirmClear(true)}
              style={{ fontSize: T.fs.body, fontWeight: 600, color: T.muted, background: "transparent", border: `1px solid ${T.border}`, borderRadius: T.r.sm, padding: "8px 14px", cursor: "pointer", fontFamily: T.font }}>
              Clear my data…
            </button>
          ) : (
            <div style={{ background: T.bg2, border: `1px solid ${T.border2}`, borderRadius: T.r.md, padding: "12px 14px" }}>
              <div style={{ fontSize: T.fs.body, color: T.ink, fontWeight: 700, marginBottom: 4 }}>
                Delete everything saved on this device?
              </div>
              <div style={{ fontSize: T.fs.meta, color: T.muted, lineHeight: 1.55, marginBottom: 12 }}>
                Removes all {tripCount} saved trip{tripCount === 1 ? "" : "s"} and their itineraries,
                your traveler profile, and these settings. There's no undo.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={doClear}
                  style={{ fontSize: T.fs.body, fontWeight: 700, color: T.white, background: T.accent, border: "none", borderRadius: T.r.sm, padding: "8px 14px", cursor: "pointer", fontFamily: T.font }}>
                  Delete everything
                </button>
                <button onClick={() => setConfirmClear(false)}
                  style={{ fontSize: T.fs.body, fontWeight: 600, color: T.muted, background: "transparent", border: `1px solid ${T.border}`, borderRadius: T.r.sm, padding: "8px 14px", cursor: "pointer", fontFamily: T.font }}>
                  Keep my data
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
