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
import { TripinMark } from "./TripinLogo.jsx";
import { useState, useEffect } from "react";
import { T, INTERESTS_GROUPS, PACE_BANDS } from "../lib/constants.js";
import { chipSt, labelSt, primaryBtnSt, sheetBackdropSt, sheetEdgeSt, titleSt } from "../lib/styles.js";
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

  const label = { ...labelSt, fontWeight: 900 };

  return (
    <>
      <div onClick={onClose}
        style={sheetBackdropSt(open)} />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 101,
        maxWidth: 640, margin: "0 auto",
        ...sheetEdgeSt,
        maxHeight: "88vh", overflowY: "auto",
        transform: open ? "translateY(0)" : "translateY(105%)",
        transition: "transform 0.38s cubic-bezier(.32,.72,.28,1)",
        padding: "1.25rem 1.5rem 1.75rem", fontFamily: T.font, boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <TripinMark px={36} />
          <div style={{ flex: 1 }}>
            <div style={titleSt}>Your traveler profile</div>
            <div style={{ fontSize: T.fs.meta, color: T.muted, marginTop: 1 }}>No dates. No destinations. Just you.</div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ width: 44, height: 44, margin: "-8px -10px -8px 0", borderRadius: "50%", background: "transparent", border: "none", color: T.ink, fontSize: 24, cursor: "pointer", fontFamily: T.font, lineHeight: 1 }}>×</button>
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PACE_OPTS.map(o => {
              const on = pace === o;
              return (
                <button key={o} onClick={() => setPace(on ? "" : o)}
                  aria-pressed={on} style={chipSt(on, { small: true })}>
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
                  aria-pressed={on} style={chipSt(on, { small: true })}>
                  {o}
                </button>
              );
            })}
          </div>
        </div>

        <button onClick={save}
          style={{ ...primaryBtnSt(true), width: "100%", marginTop: 24 }}>
          Save profile
        </button>
      </div>
    </>
  );
}
