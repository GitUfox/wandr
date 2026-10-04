/**
 * SyncStatusLine — one quiet line where trips live that answers "are my
 * trips safe, and where?" (Profile spec P0-3).
 *
 * All state logic is syncStatus() in utils; all copy is ACCOUNT_COPY. This
 * file only renders. Absent on builds without accounts and whenever there is
 * nothing honest to say.
 */

import { useState, useEffect } from "react";
import { T, ACCOUNT_COPY } from "../lib/constants.js";
import { syncStatus, timeAgo } from "../lib/utils.js";
import { useAccount } from "../hooks/useAccount.js";
import { useOnline } from "../hooks/useOnline.js";

export default function SyncStatusLine({ onSignIn, style }) {
  const account = useAccount();
  const online = useOnline();
  const status = syncStatus(account, online);

  // Re-render twice a minute so "just now" ages into "2 min ago" on its own.
  const [, tick] = useState(0);
  const isSaved = status?.kind === "saved";
  useEffect(() => {
    if (!isSaved) return;
    const id = setInterval(() => tick(n => n + 1), 30_000);
    return () => clearInterval(id);
  }, [isSaved]);

  if (!status) return null;

  const live = status.kind === "saved" || status.kind === "saving";
  const text = {
    local:   ACCOUNT_COPY.statusLocal,
    offline: ACCOUNT_COPY.statusOffline,
    saving:  ACCOUNT_COPY.statusSaving,
    retry:   ACCOUNT_COPY.statusRetry,
    stalled: ACCOUNT_COPY.statusStalled,
    saved:   `${ACCOUNT_COPY.statusSaved} · ${timeAgo(status.at)}`,
  }[status.kind];

  return (
    <div role="status" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: T.fs.meta, color: T.hint, fontFamily: T.font, lineHeight: 1.4, ...style }}>
      <span className={status.kind === "saving" ? "wsync-dot wsync-pulse" : "wsync-dot"}
        style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: live ? T.accent : T.hint }} />
      <style>{`
        .wsync-pulse{animation:wsyncpulse 1.1s ease-in-out infinite}
        @keyframes wsyncpulse{0%,100%{opacity:1}50%{opacity:.3}}
        @media (prefers-reduced-motion:reduce){.wsync-pulse{animation:none}}
      `}</style>
      <span>
        {text}
        {status.kind === "local" && (
          <>
            {" · "}
            <button onClick={onSignIn}
              style={{ background: "transparent", border: "none", padding: 0, margin: 0, color: T.accent, fontWeight: 700, fontSize: "inherit", fontFamily: T.font, cursor: "pointer" }}>
              {ACCOUNT_COPY.statusLocalCta}
            </button>
          </>
        )}
      </span>
    </div>
  );
}
