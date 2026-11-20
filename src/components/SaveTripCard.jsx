/**
 * SaveTripCard — the one-time sign-in ask after the first trip is built
 * (Profile spec P0-2). The trip is already on the device; the card says
 * what sign-in adds. "Maybe later" dismisses it for good on this device.
 *
 * Visibility is decided by showSaveTripCard() in utils; this file renders.
 */

import { T, ACCOUNT_COPY } from "../lib/constants.js";
import { solidBtnSt, titleSt } from "../lib/styles.js";

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
      style={{ padding: "14px 16px", background: T.bg1, border: `2px solid ${T.ink}`, borderRadius: T.r.md, marginBottom: 16 }}>
      <div style={titleSt}>{ACCOUNT_COPY.saveTitle}</div>
      <div style={{ fontSize: T.fs.body, color: T.muted, lineHeight: 1.5, marginTop: 4 }}>{ACCOUNT_COPY.saveBody}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
        <button onClick={onSignIn}
          style={solidBtnSt}>
          {ACCOUNT_COPY.saveAction}
        </button>
        <button onClick={onDismiss}
          style={{ minHeight: 44, padding: "0 8px", fontSize: T.fs.body, fontWeight: 700, color: T.muted, background: "none", border: "none", cursor: "pointer", fontFamily: T.font }}>
          {ACCOUNT_COPY.saveDismiss}
        </button>
      </div>
    </div>
  );
}
