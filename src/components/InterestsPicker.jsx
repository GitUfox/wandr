/**
 * InterestsPicker — the grouped interest chips, shared by every surface that
 * edits interests.
 *
 * Extracted rather than duplicated, following the BudgetTiers precedent: this
 * is the most-churned UI in the app (9 groups / ~60 tags, per-group expanders,
 * star-to-prioritize, a conditional favourite-team picker). A second copy in
 * the edit sheet would drift from the interview within one taxonomy change,
 * and the two would then disagree about what the traveler picked.
 *
 * Purely presentational — all state is owned by the caller, matching
 * InterviewFlow's existing "no state in the component" contract.
 */

import { useState } from "react";
import { T } from "../lib/constants.js";
import { chipSt, fieldSt } from "../lib/styles.js";
import { MLB_TEAMS } from "../lib/mlbTeams.js";
import Glyph from "./Glyphs.jsx";

// Selecting either tag means "I care about baseball", which is what reveals
// the team picker (§7 progressive disclosure — no extra interview step).
const BASEBALL_TAGS = ["Baseball", "Spring-training"];
const TEAM_OPTIONS  = [...MLB_TEAMS].sort((a, b) => a.name.localeCompare(b.name));

export default function InterestsPicker({
  groups,
  chips, setChips,
  priorityChips, setPriorityChips,
  teams, setTeams,
  compact = false,
  children,   // rendered between the chip grid and the summary line (the
              // interview slots its free-text "anything else" field here, so
              // extracting this changed no ordering on screen)
}) {
  // Which groups are showing their full tag list. Local by design: it's pure
  // presentation, doesn't survive navigation, and doesn't belong in answers.
  const [expanded, setExpanded] = useState(new Set());

  function toggleInterest(o) {
    const isSel = chips.includes(o);
    setChips(p => (isSel ? p.filter(x => x !== o) : [...p, o]));
    // A chip that's no longer selected can't stay prioritised — no orphan state.
    if (isSel) setPriorityChips(pc => pc.filter(x => x !== o));
  }

  function togglePriority(e, o) {
    e.stopPropagation();
    setPriorityChips(pc => (pc.includes(o) ? pc.filter(x => x !== o) : [...pc, o]));
  }

  const showTeams = chips.some(c => BASEBALL_TAGS.includes(c));

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: compact ? 14 : 18, marginBottom: 14 }}>
        {(groups || []).map(group => {
          const isOpen  = expanded.has(group.label);
          const count   = group.defaultCount ?? group.opts.length;
          const visible = isOpen ? group.opts : group.opts.slice(0, count);
          const hidden  = group.opts.length - count;
          return (
            <div key={group.label}>
              <div style={{ fontSize: T.fs.body, fontWeight: 900, color: T.ink, marginBottom: 8 }}>
                {group.label}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {visible.map(o => {
                  const sel  = chips.includes(o);
                  const prio = priorityChips.includes(o);
                  return (
                    <button key={o} aria-pressed={sel} onClick={() => toggleInterest(o)}
                      style={chipSt(sel, { small: true })}>
                      {o}
                      {sel && (
                        <span onClick={e => togglePriority(e, o)}
                          title={prio ? "Priority — wins scheduling conflicts" : "Mark as a priority"}
                          style={{ marginLeft: 6, fontSize: T.fs.ui, lineHeight: 1, color: prio ? T.line[3] : T.border, cursor: "pointer" }}>
                          {prio ? "★" : "☆"}
                        </span>
                      )}
                    </button>
                  );
                })}
                {hidden > 0 && (
                  <button onClick={() => setExpanded(p => {
                      const next = new Set(p);
                      next.has(group.label) ? next.delete(group.label) : next.add(group.label);
                      return next;
                    })}
                    style={{ minHeight: 40, padding: "0 6px", fontSize: T.fs.body, fontWeight: 700, color: T.accentInk, background: "none", border: "none", cursor: "pointer", fontFamily: T.font }}>
                    {isOpen ? "Show less" : `Show ${hidden} more →`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {children}

      {chips.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: T.fs.body, fontWeight: 700, color: T.ink }}>{chips.length} interest{chips.length !== 1 ? "s" : ""} selected</span>
          <span style={{ fontSize: T.fs.body, color: T.muted, marginLeft: 8 }}>
            · tap ☆ to prioritize{priorityChips.length > 0 ? ` (★ ${priorityChips.length})` : ""}
          </span>
        </div>
      )}

      {/* Favourite-team picker — only once baseball is an interest (§7).
          We flag that team's games at any destination, home or away. */}
      {showTeams && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: T.fs.ui, fontWeight: 700, color: T.ink }}>
            <Glyph name="ticket" size={15} color={T.ink} /> Favorite team?
          </span>
          <select value={teams?.[0] || ""} onChange={e => setTeams(e.target.value ? [e.target.value] : [])}
            style={{ ...fieldSt, flex: "1 1 180px", width: "auto", minWidth: 0, padding: "10px 12px", color: teams?.[0] ? T.ink : T.muted }}>
            <option value="">No favorite (just love the game)</option>
            {TEAM_OPTIONS.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </div>
      )}
    </>
  );
}
