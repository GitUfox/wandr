/**
 * ProfileChip — the account entry point (Profile spec P0-1, board picks
 * 1B ember ring + 2B outermost seat).
 *
 * Signed out: a "Sign in" pill (a verb, never icon-only). Signed in: the
 * traveler's initial inside a station ring. A small red marker rides the
 * ring (Transit Diagram: the old glowing ember became a plain marker; the
 * class names keep the word "ember"). It runs faster during a sync. Renders nothing on builds without accounts, so
 * env-gated deploys look exactly as before.
 *
 * The button is a 44px touch target around a 32–34px visual, so it sits level
 * with the 32px ⚙ / ? circles beside it.
 */

import { T, NO_MOTION } from "../lib/constants.js";
import { accountInitial } from "../lib/utils.js";
import { useAccount } from "../hooks/useAccount.js";

export default function ProfileChip({ onOpen, noMotion = NO_MOTION }) {
  const account = useAccount();
  if (!account.configured) return null;

  const hit = { height: 44, minWidth: 44, padding: 0, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font, flexShrink: 0 };

  return (
    <>
      <style>{`
        .wchip-orbit{position:absolute;inset:0;border-radius:50%;border:3px solid ${T.ink};animation:wchipspin 6s linear infinite}
        .wchip-orbit.wchip-fast{animation-duration:1.4s}
        .wchip-orbit.wchip-still{animation:none;transform:rotate(135deg)}
        .wchip-ember{position:absolute;top:-6px;left:50%;margin-left:-5px;width:10px;height:10px;box-sizing:border-box;border-radius:50%;background:${T.line[0]};border:2px solid ${T.bg0}}
        @keyframes wchipspin{to{transform:rotate(360deg)}}
        @media (prefers-reduced-motion:reduce){.wchip-orbit{animation:none;transform:rotate(135deg)}}
      `}</style>

      {account.email ? (
        <button onClick={onOpen} aria-label="Your account" title={account.email} style={hit}>
          <span style={{ position: "relative", width: 36, height: 36, display: "block" }}>
            <span className={noMotion ? "wchip-orbit wchip-still" : account.syncing ? "wchip-orbit wchip-fast" : "wchip-orbit"}>
              <span className="wchip-ember" />
            </span>
            <span style={{ position: "absolute", inset: 3, borderRadius: "50%", background: T.bg1, color: T.ink, fontWeight: 900, fontSize: T.fs.body, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {accountInitial(account.email)}
            </span>
          </span>
        </button>
      ) : (
        <button onClick={onOpen} aria-label="Sign in" style={hit}>
          <span style={{ display: "inline-flex", alignItems: "center", height: 36, background: T.bg1, border: `2px solid ${T.ink}`, borderRadius: T.r.pill, padding: "0 14px" }}>
            <span style={{ fontSize: T.fs.body, fontWeight: 700, color: T.ink, whiteSpace: "nowrap" }}>Sign in</span>
          </span>
        </button>
      )}
    </>
  );
}
