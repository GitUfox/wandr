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
import { useAccount } from "../hooks/useAccount.js";
import { signIn, signOut, fullSync } from "../lib/sync.js";

export default function SettingsSheet({ open, onClose, tripCount = 0 }) {
  const [timeFormat, setTimeFormat] = useState(getTimeFormat);
  const [confirmClear, setConfirmClear] = useState(false);
  const account = useAccount();
  const [email, setEmail] = useState("");
  const [justSynced, setJustSynced] = useState(null); // {pushed, pulled} flash
  const emailValid = /.+@.+\..+/.test(email.trim());

  async function handleSync() {
    const r = await fullSync();
    if (r) { setJustSynced(r); setTimeout(() => setJustSynced(null), 4000); }
  }

  const label = { fontSize: T.fs.label, fontWeight: 700, color: T.hint, textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 8 };
  const row = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: `1px solid ${T.border}` };

  function pickFormat(fmt) {
    saveSettings({ timeFormat: fmt });
    setTimeFormat(fmt);
  }

  async function doClear() {
    clearAllWandrData();
    // Signed in, "clear" must also sign out — otherwise the reload's auto-sync
    // pulls everything straight back from the account and the wipe looks broken.
    if (account.email) await signOut().catch(() => {});
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
            <div style={{ fontSize: T.fs.meta, color: T.hint, marginTop: 1 }}>{account.email ? "Synced to your account." : "Everything stays on this device."}</div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ width: 28, height: 28, borderRadius: "50%", background: "transparent", border: "none", color: T.hint, fontSize: T.fs.title, cursor: "pointer", fontFamily: T.font, lineHeight: 1 }}>×</button>
        </div>

        {/* ── Account ── */}
        <div style={{ marginTop: 18 }}>
          <div style={label}>Account</div>
          {!account.configured ? (
            <div style={{ fontSize: T.fs.body, color: T.hint, lineHeight: 1.55 }}>
              Cloud sync isn't connected yet. Your trips and profile live safely on this device.
            </div>
          ) : account.email ? (
            <div>
              <div style={{ ...row }}>
                <span style={{ fontSize: T.fs.body, color: T.muted }}>Signed in</span>
                <span style={{ fontSize: T.fs.body, color: T.ink, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{account.email}</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                <button onClick={handleSync} disabled={account.syncing}
                  style={{ fontSize: T.fs.body, fontWeight: 700, color: T.white, background: T.accent, border: "none", borderRadius: T.r.sm, padding: "8px 14px", cursor: account.syncing ? "default" : "pointer", opacity: account.syncing ? .6 : 1, fontFamily: T.font }}>
                  {account.syncing ? "Syncing…" : "Sync now"}
                </button>
                <button onClick={signOut}
                  style={{ fontSize: T.fs.body, fontWeight: 600, color: T.muted, background: "transparent", border: `1px solid ${T.border}`, borderRadius: T.r.sm, padding: "8px 14px", cursor: "pointer", fontFamily: T.font }}>
                  Sign out
                </button>
                {justSynced && (
                  <span style={{ fontSize: T.fs.meta, color: T.accent, fontWeight: 600 }}>
                    ✓ Synced{justSynced.pushed ? ` · ${justSynced.pushed} up` : ""}{justSynced.deleted ? ` · ${justSynced.deleted} removed` : ""}
                  </span>
                )}
              </div>
              <div style={{ fontSize: T.fs.meta, color: T.hint, marginTop: 8, lineHeight: 1.5 }}>
                Trips and your traveler profile sync to your account. Signing out keeps this device's copy.
              </div>
            </div>
          ) : account.pendingLink ? (
            <div style={{ fontSize: T.fs.body, color: T.ink, lineHeight: 1.55 }}>
              Check your email — tap the sign-in link on this device and you're in.
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && emailValid && signIn(email.trim())}
                  placeholder="you@example.com" autoComplete="email"
                  style={{ flex: 1, minWidth: 0, padding: "9px 12px", fontSize: T.fs.body, background: T.bg2, border: `1px solid ${T.border}`, borderRadius: T.r.sm, color: T.ink, outline: "none", fontFamily: T.font, colorScheme: "dark" }} />
                <button onClick={() => emailValid && signIn(email.trim())} disabled={!emailValid}
                  style={{ fontSize: T.fs.body, fontWeight: 700, color: emailValid ? T.white : T.hint, background: emailValid ? T.accent : T.bg3, border: "none", borderRadius: T.r.sm, padding: "8px 14px", cursor: emailValid ? "pointer" : "default", fontFamily: T.font, whiteSpace: "nowrap" }}>
                  Email me a link
                </button>
              </div>
              <div style={{ fontSize: T.fs.meta, color: T.hint, marginTop: 8, lineHeight: 1.5 }}>
                No password — we email you a sign-in link. Syncs your trips and profile across devices.
              </div>
              {account.lastError && (
                <div style={{ fontSize: T.fs.meta, color: "#f08070", marginTop: 6 }}>{account.lastError}</div>
              )}
            </div>
          )}
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
                your traveler profile, and these settings from this device{account.email ? ", and signs you out. Trips already synced stay in your account" : ""}. There's no undo.
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
