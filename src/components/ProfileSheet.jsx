/**
 * ProfileSheet — the Traveler Profile editor (design pick 6A).
 *
 * Identity, not itinerary: interests (with priorities + teams), pace, and the
 * usual crew. No dates, no destinations — those belong to trips. Edits the
 * same wandr_profile object the interview's "save as defaults" writes, so the
 * two paths can never drift.
 *
 * Same bottom-sheet mechanics as EditTripSheet: plain CSS transform
 * transitions on a fixed+bottom:0 element (framer's y:"100%" computes wrong
 * on fixed-bottom elements — see CLAUDE.md).
 */
import { useState, useEffect } from "react";
import { T, INTERESTS_GROUPS, PACE_BANDS } from "../lib/constants.js";
import InterestsPicker from "./InterestsPicker.jsx";

const CREW_OPTS = ["Solo", "Couple", "Friends", "Group", "Family"];
const PACE_OPTS = Object.keys(PACE_BANDS); // Slow / Balanced / Fast

/** answers.party is {chips:[...]} or a bare string — normalize to one chip. */
function partyChip(party) {
  if (Array.isArray(party?.chips)) return party.chips[0] || "";
  return typeof party === "string" ? party : "";
}

export default function ProfileSheet({ open, profile, onClose, onSave }) {
  const p = profile || {};
  const [chips, setChips]                 = useState(() => p.interests?.chips || []);
  const [priorityChips, setPriorityChips] = useState(() => p.interests?.priorityChips || []);
  const [teams, setTeams]                 = useState(() => p.interests?.teams || []);
  const [pace, setPace]                   = useState(() => p.logistics?.pace || "");
  const [crew, setCrew]                   = useState(() => partyChip(p.party));

  // Re-seed from the stored profile every time the sheet opens, so stale
  // local state from a cancelled edit can't leak into the next one.
  useEffect(() => {
    if (!open) return;
    setChips(p.interests?.chips || []);
    setPriorityChips(p.interests?.priorityChips || []);
    setTeams(p.interests?.teams || []);
    setPace(p.logistics?.pace || "");
    setCrew(partyChip(p.party));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function save() {
    onSave({
      ...p,
      version: 1,
      party: typeof p.party === "object" && p.party !== null
        ? { ...p.party, chips: crew ? [crew] : [] }
        : crew,
      logistics: { ...(p.logistics || {}), pace },
      interests: { ...(p.interests || {}), chips, priorityChips, teams },
      savedAt: new Date().toISOString(),
    });
    onClose();
  }

  const label = { fontSize: 10.5, fontWeight: 700, color: T.hint, textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 8 };

  return (
    <>
      <div onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)", zIndex: 100, opacity: open ? 1 : 0, transition: "opacity 0.22s ease", pointerEvents: open ? "auto" : "none" }} />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 101,
        maxWidth: 640, margin: "0 auto",
        background: T.bg1, borderRadius: "18px 18px 0 0", border: `1px solid ${T.border2}`, borderBottom: "none",
        maxHeight: "88vh", overflowY: "auto",
        transform: open ? "translateY(0)" : "translateY(105%)",
        transition: "transform 0.38s cubic-bezier(.32,.72,.28,1)",
        padding: "1.25rem 1.5rem 1.75rem", fontFamily: T.font, boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: T.accent, color: T.bg0, fontWeight: 800, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✦</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>Your traveler profile</div>
            <div style={{ fontSize: 11, color: T.hint, marginTop: 1 }}>No dates. No destinations. Just you.</div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ width: 28, height: 28, borderRadius: "50%", background: "transparent", border: "none", color: T.hint, fontSize: 18, cursor: "pointer", fontFamily: T.font, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={label}>Always into</div>
          <InterestsPicker
            groups={INTERESTS_GROUPS}
            chips={chips} setChips={setChips}
            priorityChips={priorityChips} setPriorityChips={setPriorityChips}
            teams={teams} setTeams={setTeams}
            compact
          />
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={label}>Pace</div>
          <div style={{ display: "inline-flex", background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 100, padding: 3 }}>
            {PACE_OPTS.map(o => {
              const on = pace === o;
              return (
                <button key={o} onClick={() => setPace(on ? "" : o)}
                  style={{ border: "none", borderRadius: 100, padding: "6px 14px", fontSize: 12.5, fontWeight: 700, fontFamily: T.font, cursor: "pointer", background: on ? T.accent : "transparent", color: on ? T.white : T.muted, transition: "all .12s" }}>
                  {o}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={label}>Usual crew</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {CREW_OPTS.map(o => {
              const on = crew === o;
              return (
                <button key={o} onClick={() => setCrew(on ? "" : o)}
                  style={{ background: on ? "#2a1a12" : T.bg2, border: on ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`, borderRadius: 100, color: on ? T.accent : T.muted, fontSize: 12.5, fontWeight: on ? 700 : 400, padding: "6px 14px", cursor: "pointer", fontFamily: T.font, transition: "all .12s" }}>
                  {o}
                </button>
              );
            })}
          </div>
        </div>

        <button onClick={save}
          style={{ width: "100%", marginTop: 22, padding: 13, borderRadius: 10, background: T.accent, border: "none", color: T.white, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: T.font }}>
          Save profile
        </button>
      </div>
    </>
  );
}
