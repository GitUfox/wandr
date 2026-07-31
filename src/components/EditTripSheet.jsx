/**
 * EditTripSheet — the 4-mode edit overlay for Wandr.
 *
 * Modes:
 *   specific-activities — describe activities to swap out (re-generates full plan with instruction)
 *   specific-day        — pick a day + optional prompt (patches that day via complete())
 *   full-itinerary      — vibe chips + free-text (re-generates full plan with style overlay)
 *   trip-details        — compact form: destination, dates, budget, party (full rebuild)
 *
 * Accepts an `open` prop and owns its AnimatePresence internally so that each
 * motion.div (backdrop + sheet) is a direct keyed child — required for reliable
 * exit animation + unmounting. Dashboard renders this component always mounted.
 */
import { useState, useEffect } from "react";
import { T, nearestBudgetTier, INTERESTS_GROUPS } from "../lib/constants.js";
import { extractDayHeaders, extractActivityTitles } from "../lib/utils.js";
import DateRangePicker from "./DateRangePicker.jsx";
import BudgetTiers from "./BudgetTiers.jsx";
import InterestsPicker from "./InterestsPicker.jsx";
import Glyph from "./Glyphs.jsx";

const VIBE_CHIPS = [
  "More relaxed",
  "Less touristy",
  "More adventurous",
  "More budget-friendly",
  "More outdoor activities",
];

const PARTY_OPTS = [
  "Solo",
  "Couple",
  "Friends",
  "Group",
  "Family",
];

const OPTIONS = [
  {
    id:   "specific-activities",
    icon: "swap",
    title: "Specific Activities",
    sub:   "Describe what to swap out",
  },
  {
    id:   "specific-day",
    icon: "calendar",
    title: "Specific Day",
    sub:   "Redo one day from scratch",
  },
  {
    id:   "full-itinerary",
    icon: "mix",
    title: "Full Itinerary",
    sub:   "Adjust the overall feel",
  },
  {
    id:   "trip-details",
    icon: "trip",
    title: "Trip Details",
    sub:   "Destination, dates, budget, party",
  },
];

/** "Day 1 — Wednesday, June 11, 2025" → { day: "Day 1", date: "Wed, Jun 11" } */
function shortDayLabel(label) {
  const m = label.match(/^(Day \d+) — (\w+), (\w+ \d+)/);
  if (m) return { day: m[1], date: `${m[2].slice(0, 3)}, ${m[3]}` };
  return { day: label, date: "" };
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div>
      <div style={{
        fontSize: T.fs.label, fontWeight: 700, color: T.hint,
        textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 8,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle = {
  background: T.bg2,
  border: `1px solid ${T.border2}`,
  borderRadius: T.r.md,
  color: T.ink,
  fontSize: T.fs.body,
  fontFamily: T.font,
  padding: "9px 12px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const textareaStyle = {
  ...inputStyle,
  resize: "none",
  lineHeight: 1.6,
};

function SubmitBar({ label, enabled, loading, onSubmit }) {
  return (
    <div style={{ marginTop: 20 }}>
      <button
        onClick={onSubmit}
        disabled={!enabled || loading}
        style={{
          width: "100%",
          padding: "13px",
          borderRadius: T.r.md,
          background: !enabled || loading ? T.bg3 : T.accent,
          border: "none",
          color: !enabled || loading ? T.hint : "#fff",
          fontSize: T.fs.ui,
          fontWeight: 700,
          cursor: !enabled || loading ? "not-allowed" : "pointer",
          fontFamily: T.font,
          transition: "all .15s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {loading ? (
          <>
            <div style={{
              width: 14, height: 14,
              border: "1.5px solid rgba(255,255,255,0.3)",
              borderTopColor: "#fff",
              borderRadius: "50%",
              animation: "spin .7s linear infinite",
            }} />
            Applying…
          </>
        ) : label}
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function EditTripSheet({
  open,
  trip,
  planText,
  planMode,
  planLoading,
  onClose,
  onEditPlan,
  onEditTripDetails,
  initialStage = null, // e.g. "full-itinerary" — Remix opens straight into that pane
}) {
  const [stage, setStage]           = useState("picker");
  const [selectedDay, setSelectedDay] = useState(null);
  const [prompt, setPrompt]         = useState("");
  const [selectedVibe, setSelectedVibe] = useState([]);
  const [surprise, setSurprise]     = useState(false); // "Surprise me" — regen with an avoid-list

  // Jump to the requested pane each time the sheet opens (Remix path).
  useEffect(() => {
    if (open && initialStage) setStage(initialStage);
  }, [open, initialStage]);

  // Trip Details local state — seeded from current trip.answers
  const a = trip.answers || {};
  const [localDest, setLocalDest]     = useState(a.destination || "");
  const [localStart, setLocalStart]   = useState(a.dates?.start || "");
  const [localEnd, setLocalEnd]       = useState(a.dates?.end || "");
  const [localBudget, setLocalBudget] = useState(() => nearestBudgetTier(a.budget));
  const [localParty, setLocalParty]   = useState(
    Array.isArray(a.party?.chips) ? a.party.chips[0] :
    typeof a.party === "string"   ? a.party : ""
  );
  // Interests were previously un-editable per trip — the only way to change them
  // was a full re-interview. Same shapes as answers.interests so doRebuild can
  // hand them straight back with no translation.
  const [localChips, setLocalChips]       = useState(() => a.interests?.chips || []);
  const [localPriority, setLocalPriority] = useState(() => a.interests?.priorityChips || []);
  const [localTeams, setLocalTeams]       = useState(() => a.interests?.teams || []);
  const [confirmRebuild, setConfirmRebuild] = useState(false);

  const dayHeaders = extractDayHeaders(planText || "");
  const hasPlan    = (planText || "").trim().length > 0;

  function goBack() {
    setStage("picker");
    setSelectedDay(null);
    setPrompt("");
    setSelectedVibe([]);
    setSurprise(false);
    setConfirmRebuild(false);
  }

  function toggleVibe(chip) {
    setSelectedVibe(prev =>
      prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]
    );
  }

  function isSubmitEnabled() {
    if (planLoading) return false;
    if (stage === "specific-activities") return prompt.trim().length > 2;
    if (stage === "specific-day")        return selectedDay !== null;
    if (stage === "full-itinerary")      return surprise || selectedVibe.length > 0 || prompt.trim().length > 2;
    if (stage === "trip-details")        return localDest.trim().length > 1;
    return false;
  }

  function getSubmitLabel() {
    if (stage === "specific-activities") return "Apply Changes";
    if (stage === "specific-day")        return "Redo This Day";
    if (stage === "full-itinerary")      return "Regenerate";
    if (stage === "trip-details")        return "Rebuild Trip";
    return "Apply";
  }

  function handleSubmit() {
    if (!isSubmitEnabled()) return;

    if (stage === "specific-activities") {
      onEditPlan("activities", prompt.trim(), null, null);
      onClose();
    } else if (stage === "specific-day") {
      const header = dayHeaders[selectedDay];
      onEditPlan("day", prompt.trim(), selectedDay, header?.label || "");
      onClose();
    } else if (stage === "full-itinerary") {
      const parts = [...selectedVibe];
      if (prompt.trim()) parts.push(prompt.trim());
      if (surprise) {
        // The avoid-list is what makes "Surprise me" honest — without it the
        // model regenerates a near-identical trip from the same database.
        const avoid = extractActivityTitles(planText).join("; ");
        parts.push("Take a completely different angle on this trip — different anchor activities, different neighborhoods or areas where possible");
        if (avoid) parts.push(`Do NOT reuse these places from the previous itinerary: ${avoid}`);
      }
      onEditPlan("full", parts.join(". "), null, null);
      onClose();
    }
    // trip-details rebuilds go through doRebuild() (confirm popup), not here.
  }

  // Executed after the user confirms the rebuild popup.
  function doRebuild() {
    const newAnswers = {
      ...a,
      destination: localDest.trim(),
      dates: { ...(a.dates || {}), start: localStart, end: localEnd },
      budget: localBudget,
      party: typeof a.party === "object" && a.party !== null
        ? { ...a.party, chips: [localParty] }
        : localParty,
      // Preserve the free-text overflow ("also: craft beer") the picker doesn't edit.
      interests: {
        ...(a.interests || {}),
        chips: localChips,
        priorityChips: localPriority,
        teams: localTeams,
      },
    };
    setConfirmRebuild(false);
    onEditTripDetails(newAnswers);
    // Screen navigates to loading — sheet unmounts automatically
  }

  const stageTitle = {
    picker:               "Edit Trip",
    "specific-activities":"Specific Activities",
    "specific-day":       "Specific Day",
    "full-itinerary":     "Full Itinerary",
    "trip-details":       "Trip Details",
  }[stage];

  // Call parent's onClose and reset stage after the slide-out animation settles (~400ms)
  function handleClose() {
    onClose();
    setConfirmRebuild(false);
    setSurprise(false);
    setTimeout(() => setStage("picker"), 420);
  }

  return (
    <>
      {/* Backdrop — CSS opacity transition */}
      <div
        onClick={handleClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(2px)",
          zIndex: 100,
          opacity: open ? 1 : 0,
          transition: "opacity 0.22s ease",
          pointerEvents: open ? "auto" : "none",
        }}
      />
      {/* Sheet — CSS transform transition, slides up/down from bottom */}
      <div
        style={{
          position: "fixed",
          bottom: 0, left: 0, right: 0,
          background: T.bg1,
          borderTop: `1px solid ${T.border}`,
          borderRadius: "16px 16px 0 0",
          zIndex: 101,
          maxHeight: "88vh",
          overflowY: "auto",
          fontFamily: T.font,
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
          willChange: "transform",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border2 }} />
        </div>

        {/* Header row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "4px 20px 14px",
          borderBottom: `1px solid ${T.border}`,
        }}>
          {stage !== "picker" && (
            <button
              onClick={goBack}
              style={{
                background: "none", border: "none", color: T.muted,
                fontSize: 20 /* off-ramp: back-chevron glyph tap target — title(17) visibly shrinks it */, cursor: "pointer", padding: "0 6px 0 0",
                lineHeight: 1, fontFamily: T.font,
              }}
            >
              ‹
            </button>
          )}
          <div style={{ flex: 1, fontSize: T.fs.title, fontWeight: 800, color: T.ink }}>
            {stageTitle}
          </div>
          <button
            onClick={handleClose}
            style={{
              background: "none", border: "none", color: T.hint,
              fontSize: 20 /* off-ramp: close-glyph tap target — title(17) visibly shrinks it */, cursor: "pointer", lineHeight: 1,
              padding: 0, fontFamily: T.font,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "8px 20px 40px" }}>

          {/* ── PICKER ───────────────────────────────────────────────────────── */}
          {stage === "picker" && (
            <div style={{ display: "flex", flexDirection: "column", paddingTop: 6 }}>
              {OPTIONS.map((opt, i) => {
                const needsPlan  = opt.id !== "trip-details";
                const isDisabled = needsPlan && !hasPlan;
                return (
                  <button
                    key={opt.id}
                    onClick={() => !isDisabled && setStage(opt.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "14px 4px",
                      background: "transparent", border: "none",
                      borderBottom: i < OPTIONS.length - 1 ? `1px solid ${T.border}` : "none",
                      cursor: isDisabled ? "not-allowed" : "pointer",
                      fontFamily: T.font,
                      opacity: isDisabled ? 0.38 : 1,
                      width: "100%", textAlign: "left",
                    }}
                  >
                    <span style={{ width: 26, display: "flex", justifyContent: "center", flexShrink: 0 }}>
                      <Glyph name={opt.icon} size={18} color={T.accent} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: T.fs.ui, fontWeight: 700, color: T.ink, marginBottom: 1 }}>
                        {opt.title}
                      </div>
                      <div style={{ fontSize: T.fs.body, color: T.muted }}>
                        {isDisabled ? "Generate a plan first" : opt.sub}
                      </div>
                    </div>
                    <span style={{ color: T.hint, fontSize: T.fs.title }}>›</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── SPECIFIC ACTIVITIES ──────────────────────────────────────────── */}
          {stage === "specific-activities" && (
            <div style={{ paddingTop: 14 }}>
              <div style={{ fontSize: T.fs.body, color: T.muted, marginBottom: 16, lineHeight: 1.65 }}>
                Describe what you'd like to change. Be as specific as you like — mention the day, activity name, or just describe the kind of change.
              </div>
              <textarea
                autoFocus
                placeholder={"e.g. Swap the museum visit for something outdoors\n         Change the Yankees game to a Knicks game\n         Add another day trip outside the city"}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={4}
                style={textareaStyle}
              />
              <div style={{ fontSize: T.fs.meta, color: T.hint, marginTop: 7 }}>
                Tip: mention the specific day or activity name for best results.
              </div>
              <SubmitBar
                label={getSubmitLabel()}
                enabled={isSubmitEnabled()}
                loading={planLoading}
                onSubmit={handleSubmit}
              />
            </div>
          )}

          {/* ── SPECIFIC DAY ─────────────────────────────────────────────────── */}
          {stage === "specific-day" && (
            <div style={{ paddingTop: 14 }}>
              <div style={{ fontSize: T.fs.meta, fontWeight: 600, color: T.hint, marginBottom: 10 }}>
                Which day?
              </div>
              {dayHeaders.length === 0 ? (
                <div style={{ fontSize: T.fs.body, color: T.muted, marginBottom: 16 }}>
                  No days found — generate a Full Itinerary first.
                </div>
              ) : (
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 20 }}>
                  {dayHeaders.map((h, i) => {
                    const { day, date } = shortDayLabel(h.label);
                    const active = selectedDay === i;
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedDay(i)}
                        style={{
                          background: active ? "#2a1a12" : T.bg2,
                          border: active ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                          borderRadius: T.r.md,
                          cursor: "pointer",
                          fontFamily: T.font,
                          padding: "7px 12px",
                          textAlign: "left",
                          minWidth: 64,
                        }}
                      >
                        <div style={{ fontSize: T.fs.meta, fontWeight: 700, color: active ? T.accent : T.ink }}>
                          {day}
                        </div>
                        {date && (
                          <div style={{ fontSize: T.fs.label, color: active ? "#a06040" : T.hint, marginTop: 1 }}>
                            {date}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: T.fs.meta, fontWeight: 600, color: T.hint, marginBottom: 8 }}>
                What should change? <span style={{ fontWeight: 400, color: T.border2 }}>(optional)</span>
              </div>
              <textarea
                placeholder="e.g. Add a morning hike · More local markets · Less museums — or leave blank to refresh the day"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={3}
                style={textareaStyle}
              />
              <SubmitBar
                label={getSubmitLabel()}
                enabled={isSubmitEnabled()}
                loading={planLoading}
                onSubmit={handleSubmit}
              />
            </div>
          )}

          {/* ── FULL ITINERARY ───────────────────────────────────────────────── */}
          {stage === "full-itinerary" && (
            <div style={{ paddingTop: 14 }}>
              <div style={{ fontSize: T.fs.body, color: T.muted, marginBottom: 16, lineHeight: 1.65 }}>
                How should the feel of this itinerary change? Pick one or more, or describe it yourself.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 18 }}>
                {VIBE_CHIPS.map(chip => {
                  const active = selectedVibe.includes(chip);
                  return (
                    <button
                      key={chip}
                      onClick={() => toggleVibe(chip)}
                      style={{
                        background: active ? "#2a1a12" : T.bg2,
                        border: active ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                        borderRadius: T.r.pill,
                        color: active ? T.accent : T.muted,
                        fontSize: T.fs.body,
                        fontWeight: active ? 700 : 400,
                        padding: "5px 12px",
                        cursor: "pointer",
                        fontFamily: T.font,
                        transition: "all .12s",
                      }}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>
              <textarea
                placeholder="or describe it in your own words…"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={3}
                style={textareaStyle}
              />
              <button
                onClick={() => setSurprise(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 9, width: "100%", marginTop: 12,
                  background: surprise ? "#2a1a12" : T.bg2,
                  border: surprise ? `1.5px solid ${T.accent}` : `1px dashed ${T.border2}`,
                  borderRadius: T.r.md, padding: "10px 13px", cursor: "pointer", fontFamily: T.font,
                  textAlign: "left", transition: "all .12s",
                }}
              >
                <Glyph name="dice" size={17} color={surprise ? T.accent : T.muted} />
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontSize: T.fs.body, fontWeight: 700, color: surprise ? T.accent : T.ink }}>Surprise me</span>
                  <span style={{ display: "block", fontSize: T.fs.meta, color: T.muted, marginTop: 1 }}>A genuinely different take — none of the current stops repeat</span>
                </span>
              </button>
              <div style={{ fontSize: T.fs.meta, color: T.hint, lineHeight: 1.5, marginTop: 12 }}>
                Heads up — this rebuilds the whole itinerary, including any edits you've made to it.
              </div>
              <SubmitBar
                label={getSubmitLabel()}
                enabled={isSubmitEnabled()}
                loading={planLoading}
                onSubmit={handleSubmit}
              />
            </div>
          )}

          {/* ── TRIP DETAILS ─────────────────────────────────────────────────── */}
          {stage === "trip-details" && (
            <div style={{ paddingTop: 14, display: "flex", flexDirection: "column", gap: 20 }}>

              <Field label="Destination">
                <input
                  autoFocus
                  type="text"
                  value={localDest}
                  onChange={e => setLocalDest(e.target.value)}
                  placeholder="e.g. Paris, France"
                  style={inputStyle}
                />
              </Field>

              <Field label="Dates">
                <DateRangePicker
                  d1={localStart} setD1={setLocalStart}
                  d2={localEnd}   setD2={setLocalEnd}
                />
              </Field>

              <Field label="Budget">
                <BudgetTiers value={localBudget} onChange={setLocalBudget} />
              </Field>

              <Field label="Who's going?">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {PARTY_OPTS.map(opt => {
                    const active = localParty === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => setLocalParty(opt)}
                        style={{
                          background: active ? "#2a1a12" : T.bg2,
                          border: active ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                          borderRadius: T.r.pill,
                          color: active ? T.accent : T.muted,
                          fontSize: T.fs.body,
                          fontWeight: active ? 700 : 400,
                          padding: "5px 12px",
                          cursor: "pointer",
                          fontFamily: T.font,
                          transition: "all .12s",
                        }}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Interests">
                <InterestsPicker
                  groups={INTERESTS_GROUPS}
                  chips={localChips} setChips={setLocalChips}
                  priorityChips={localPriority} setPriorityChips={setLocalPriority}
                  teams={localTeams} setTeams={setLocalTeams}
                  compact
                />
                <div style={{ fontSize: T.fs.meta, color: T.hint, marginTop: 10, lineHeight: 1.5 }}>
                  Starred interests win scheduling conflicts. Ranking happens when the
                  trip is built, so changes here take effect on the rebuild below.
                </div>
              </Field>

              <SubmitBar
                label={getSubmitLabel()}
                enabled={isSubmitEnabled()}
                loading={planLoading}
                onSubmit={() => setConfirmRebuild(true)}
              />
            </div>
          )}

        </div>
      </div>

      {/* Rebuild confirmation — destructive action gate */}
      {confirmRebuild && (
        <div
          onClick={() => setConfirmRebuild(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(2px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: T.bg1, border: `1px solid ${T.border}`, borderRadius: T.r.lg,
              padding: "22px 20px", maxWidth: 340, width: "100%", fontFamily: T.font,
            }}
          >
            <div style={{ fontSize: T.fs.title, fontWeight: 700, color: T.ink, marginBottom: 8 }}>
              Rebuild this trip?
            </div>
            <div style={{ fontSize: T.fs.body, color: T.muted, lineHeight: 1.55, marginBottom: 18 }}>
              This rebuilds the trip from your new answers. Any itinerary you've generated — including edits you've made by hand — is cleared. Your current trip stays until the new one's ready.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmRebuild(false)}
                style={{
                  flex: 1, padding: "11px", borderRadius: T.r.md,
                  background: T.bg3, border: `1px solid ${T.border}`, color: T.ink,
                  fontSize: T.fs.body, fontWeight: 700, cursor: "pointer", fontFamily: T.font,
                }}
              >
                Cancel
              </button>
              <button
                onClick={doRebuild}
                style={{
                  flex: 1, padding: "11px", borderRadius: T.r.md,
                  background: T.accent, border: "none", color: "#fff",
                  fontSize: T.fs.body, fontWeight: 700, cursor: "pointer", fontFamily: T.font,
                }}
              >
                Rebuild
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
