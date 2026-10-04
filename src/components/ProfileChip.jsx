/**
 * ProfileChip — the account entry point (Profile spec P0-1, board picks
 * 1B ember ring + 2B outermost seat).
 *
 * Signed out: a "Sign in" pill (a verb, never icon-only) with an empty ring
 * and a dim, parked ember. Signed in: the traveler's initial inside an orbit
 * ring the ember rides. Renders nothing on builds without accounts, so
 * env-gated deploys look exactly as before.
 *
 * The button is a 44px touch target around a 32–34px visual, so it sits level
 * with the 32px ⚙ / ? circles beside it.
 */

import { T } from "../lib/constants.js";
import { accountInitial } from "../lib/utils.js";
import { useAccount } from "../hooks/useAccount.js";

export default function ProfileChip({ onOpen, noMotion = false }) {
  const account = useAccount();
  if (!account.configured) return null;

  const hit = { height: 44, minWidth: 44, padding: 0, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font, flexShrink: 0 };

  return (
    <>
      <style>{`
        .wchip-orbit{position:absolute;inset:0;border-radius:50%;border:1px solid ${T.border};animation:wchipspin 6s linear infinite}
        .wchip-orbit.wchip-fast{animation-duration:1.4s}
        .wchip-orbit.wchip-still{animation:none;transform:rotate(135deg)}
        .wchip-ember{position:absolute;top:-3px;left:50%;margin-left:-2.5px;width:5px;height:5px;border-radius:50%;background:${T.accentHover};box-shadow:0 0 6px 1px ${T.accent}}
        @keyframes wchipspin{to{transform:rotate(360deg)}}
        @media (prefers-reduced-motion:reduce){.wchip-orbit{animation:none;transform:rotate(135deg)}}
      `}</style>

      {account.email ? (
        <button onClick={onOpen} aria-label="Your account" title={account.email} style={hit}>
          <span style={{ position: "relative", width: 34, height: 34, display: "block" }}>
            <span className={noMotion ? "wchip-orbit wchip-still" : account.syncing ? "wchip-orbit wchip-fast" : "wchip-orbit"}>
              <span className="wchip-ember" />
            </span>
            <span style={{ position: "absolute", inset: 3, borderRadius: "50%", background: T.bg3, border: `1px solid ${T.border2}`, color: T.ink, fontWeight: 800, fontSize: T.fs.body, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {accountInitial(account.email)}
            </span>
          </span>
        </button>
      ) : (
        <button onClick={onOpen} aria-label="Sign in" style={hit}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 32, background: T.bg2, border: `1px solid ${T.border2}`, borderRadius: T.r.pill, padding: "0 12px 0 5px" }}>
            <span style={{ position: "relative", width: 22, height: 22, display: "block", flexShrink: 0 }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1px solid ${T.border2}` }} />
              <span style={{ position: "absolute", top: -2, left: "50%", marginLeft: -2, width: 4, height: 4, borderRadius: "50%", background: T.hint }} />
            </span>
            <span style={{ fontSize: T.fs.meta, fontWeight: 700, color: T.ink, whiteSpace: "nowrap" }}>Sign in</span>
          </span>
        </button>
      )}
    </>
  );
}
