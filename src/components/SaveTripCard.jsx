/**
 * SaveTripCard — the one-time sign-in ask after the first trip is built
 * (Profile spec P0-2). The trip is already on the device; the card says
 * what sign-in adds. "Maybe later" dismisses it for good on this device.
 *
 * Visibility is decided by showSaveTripCard() in utils; this file renders.
 */

import { T, ACCOUNT_COPY } from "../lib/constants.js";

export const SAVE_CARD_KEY = "wandr_save_card_dismissed";

export function readSaveCardDismissed() {
  try { return localStorage.getItem(SAVE_CARD_KEY) === "1"; } catch { return false; }
}
export function writeSaveCardDismissed() {
  try { localStorage.setItem(SAVE_CARD_KEY, "1"); } catch { /* optional */ }
}

export default function SaveTripCard({ onSignIn, onDismiss }) {
  return (
    <div role="region" aria-label={ACCOUNT_COPY.saveTitle}
      style={{ padding: "13px 15px", background: T.bg1, border: `1px solid ${T.border2}`, borderRadius: T.r.md, marginBottom: 12 }}>
      <div style={{ fontSize: T.fs.ui, fontWeight: 800, color: T.ink }}>{ACCOUNT_COPY.saveTitle}</div>
      <div style={{ fontSize: T.fs.body, color: T.muted, lineHeight: 1.5, marginTop: 4 }}>{ACCOUNT_COPY.saveBody}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
        <button onClick={onSignIn}
          style={{ padding: "8px 14px", borderRadius: T.r.sm, fontSize: T.fs.body, fontWeight: 700, color: T.white, background: T.accent, border: "none", cursor: "pointer", fontFamily: T.font }}>
          {ACCOUNT_COPY.saveAction}
        </button>
        <button onClick={onDismiss}
          style={{ padding: "8px 6px", fontSize: T.fs.body, fontWeight: 600, color: T.hint, background: "none", border: "none", cursor: "pointer", fontFamily: T.font }}>
          {ACCOUNT_COPY.saveDismiss}
        </button>
      </div>
    </div>
  );
}
