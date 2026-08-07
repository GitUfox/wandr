/**
 * ItineraryEditor — renders the structured plan model as editable blocks.
 *
 * Phase 1: inline-edit (time / title / details) + delete per activity.
 * Phase 2: drag to reorder within a day (framer Reorder + a drag handle so it
 * doesn't fight the tap controls), and a "Move" picker to send an activity to
 * another day. Food and tips render read-only.
 *
 * All mutations lift to useGenerate, which re-serializes planText and persists,
 * so copy / PDF export / reload all stay in sync.
 */
import { useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { T } from "../lib/constants.js";
import { useOnline } from "../hooks/useOnline.js";
import { BUCKETS, bucketOf, timeSortKey, formatTime, displayTime, splitDetails } from "../lib/utils.js";
import Glyph from "./Glyphs.jsx";

const clean = s => (s || "").replace(/\*\*/g, "").trim();

/* ── Fact chips (design pick 4A, with the 4C legacy bridge) ──────────────────
   splitDetails() turns the stored Details string into a description line plus
   standardized fact tokens at RENDER TIME only — the string itself is never
   rewritten, so edit/copy/PDF/sync all keep carrying the raw cell. Grammar
   plans split on " · "; legacy sentence-blobs get chips derived from the
   prose (which keeps the facts too — a regex can miss). */
const FACT_GLYPH = { cost: "coin", duration: "clock", hours: "doors", booking: "bookmark", note: "info" };

function DetailsBlock({ details, indent = 0 }) {
  const { desc, facts } = splitDetails(details);
  if (!desc && !facts.length) return null;
  return (
    <>
      {desc && <div style={{ fontSize: T.fs.meta, color: T.muted, lineHeight: 1.55, marginLeft: indent }}>{desc}</div>}
      {facts.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6, marginLeft: indent }}>
          {facts.map((f, i) => {
            const hot = f.kind === "booking";
            return (
              <span key={i} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: T.fs.label, fontWeight: 700, lineHeight: 1.3, fontVariantNumeric: "tabular-nums",
                color: hot ? T.accentHover : T.muted,
                background: hot ? "rgba(201,100,66,.08)" : T.bg2,
                border: `1px solid ${hot ? "rgba(201,100,66,.4)" : T.border}`,
                borderRadius: T.r.sm, padding: "3px 8px",
              }}>
                <Glyph name={FACT_GLYPH[f.kind] || "info"} size={11} color="currentColor" />
                {f.text}
              </span>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ── Slot-chip time picker (design pick 3A) ──────────────────────────────────
   Tap a slot instead of typing. 30-minute grain grouped by daypart — the
   grain an itinerary actually uses. Chips are 24-hour (the app-wide format).
   An off-grid value ("09:15", a legacy "9:15 AM", a range) keeps showing on
   the trigger and survives Save untouched unless a chip is picked, so
   AI-written times are never mangled. */
const DAYPARTS = [
  { label: "Morning",   from: 6 * 60,  to: 11 * 60 + 30 },
  { label: "Afternoon", from: 12 * 60, to: 17 * 60 + 30 },
  { label: "Evening",   from: 18 * 60, to: 23 * 60 + 30 },
];

function TimeSlotPicker({ value, onPick }) {
  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: T.r.md, padding: "10px 12px 4px", marginBottom: 8 }}>
      {DAYPARTS.map(p => {
        const slots = [];
        for (let m = p.from; m <= p.to; m += 30) slots.push(formatTime(m));
        return (
          <div key={p.label} style={{ marginBottom: 9 }}>
            <div style={{ fontSize: T.fs.micro, letterSpacing: ".18em", textTransform: "uppercase", color: T.hint, fontWeight: 700, marginBottom: 6 }}>{p.label}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {slots.map(t => {
                const on = t === value;
                return (
                  <button key={t} onClick={() => onPick(t)}
                    style={{
                      fontFamily: T.font, fontSize: T.fs.meta, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                      width: 62, padding: "6px 0", textAlign: "center", borderRadius: T.r.md, cursor: "pointer",
                      color: on ? T.white : T.muted,
                      background: on ? T.accent : T.bg2,
                      border: `1px solid ${on ? T.accent : T.border}`,
                    }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const iconBtn = {
  background: "transparent", border: "none", cursor: "pointer",
  fontFamily: T.font, fontSize: T.fs.body, padding: "3px 6px", borderRadius: T.r.sm, lineHeight: 1,
};

function ActivityBlock({ a, dayIdx, days, isTweaking, onEditActivity, onDeleteActivity, onMoveActivity, onTweakActivity }) {
  // The ✦ tweak is the only per-activity action that calls the AI; inline edit,
  // move and delete are all local, so they stay available offline.
  const online = useOnline();
  const controls = useDragControls();
  const [editing, setEditing]       = useState(false);
  const [time, setTime]             = useState(a.time);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [title, setTitle]           = useState(clean(a.title));
  const [details, setDetails]       = useState(a.details);
  const [confirmDel, setConfirmDel] = useState(false);
  const [moving, setMoving]         = useState(false);
  const [tweakOpen, setTweakOpen]   = useState(false);
  const [tweakText, setTweakText]   = useState("");

  function submitTweak() {
    const t = tweakText.trim();
    if (!t) return;
    onTweakActivity(dayIdx, a.id, t);
    setTweakOpen(false);
    setTweakText("");
  }

  function save() {
    onEditActivity(dayIdx, a.id, {
      time: time.trim(),
      title: title.trim() ? `**${title.trim()}**` : "",
      details: details.trim(),
    });
    setEditing(false);
    setPickerOpen(false);
  }
  function cancel() {
    setTime(a.time); setTitle(clean(a.title)); setDetails(a.details);
    setEditing(false);
    setPickerOpen(false);
  }

  const inputSt = {
    width: "100%", padding: "7px 10px", border: `1px solid ${T.border2}`, borderRadius: T.r.sm,
    background: T.bg2, color: T.ink, outline: "none", fontSize: T.fs.body, fontFamily: T.font,
    boxSizing: "border-box",
  };

  const otherDays = days.filter(d => d.idx !== dayIdx);

  return (
    <Reorder.Item value={a} as="div" dragListener={false} dragControls={controls}
      style={{ position: "relative", background: T.bg1, border: `1px solid ${editing ? T.accent : T.border}`, borderRadius: T.r.md, padding: editing ? "11px 12px" : "10px 10px 10px 4px", marginBottom: 8, listStyle: "none" }}>

      {editing ? (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button onClick={() => setPickerOpen(v => !v)}
              title="Pick a time"
              style={{ ...inputSt, width: 110, flexShrink: 0, color: T.accent, fontWeight: 700, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clean(time) || "Set time"}</span>
              <span style={{ color: T.hint, fontSize: T.fs.label, flexShrink: 0 }}>{pickerOpen ? "▴" : "▾"}</span>
            </button>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Place / activity" autoFocus
              style={{ ...inputSt, fontWeight: 700 }} />
          </div>
          {pickerOpen && (
            <TimeSlotPicker value={clean(time)} onPick={t => { setTime(t); setPickerOpen(false); }} />
          )}
          <textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="Details — what it is · ~€15 · 2h · opens 09:00 · book ahead" rows={3}
            style={{ ...inputSt, lineHeight: 1.5, resize: "vertical", marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 7, justifyContent: "flex-end" }}>
            <button onClick={cancel} style={{ ...iconBtn, fontSize: T.fs.body, color: T.muted, padding: "6px 12px", border: `1px solid ${T.border}` }}>Cancel</button>
            <button onClick={save} style={{ ...iconBtn, fontSize: T.fs.body, fontWeight: 700, color: T.white, background: T.accent, padding: "6px 14px" }}>Save</button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          {/* Drag handle — the only drag trigger, so taps elsewhere stay clickable */}
          <span onPointerDown={e => controls.start(e)} title="Drag to reorder"
            style={{ cursor: "grab", touchAction: "none", color: T.hint, fontSize: T.fs.ui, padding: "2px 4px", flexShrink: 0, userSelect: "none", lineHeight: 1.2 }}>⠿</span>
          <div style={{ width: 58, flexShrink: 0, fontSize: T.fs.meta, color: T.accent, fontWeight: 700, paddingTop: 2 }}>{displayTime(clean(a.time))}</div>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 60, paddingTop: 1 }}>
            <div style={{ fontSize: T.fs.body, color: T.ink, fontWeight: 700, lineHeight: 1.35, marginBottom: 2 }}>{clean(a.title)}</div>
            {a.details && <DetailsBlock details={a.details} />}
            {/* Move picker — choose a destination day */}
            {moving && otherDays.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: T.fs.label, color: T.hint }}>Move to:</span>
                {otherDays.map(d => (
                  <button key={d.idx} onClick={() => { onMoveActivity(dayIdx, a.id, d.idx); setMoving(false); }}
                    style={{ ...iconBtn, fontSize: T.fs.meta, color: T.accent, border: `1px solid ${T.accent}`, padding: "3px 9px" }}>
                    Day {d.idx + 1}
                  </button>
                ))}
                <button onClick={() => setMoving(false)} style={{ ...iconBtn, fontSize: T.fs.meta, color: T.muted }}>Cancel</button>
              </div>
            )}
            {/* AI tweak — free-text instruction for just this activity */}
            {isTweaking ? (
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8, fontSize: T.fs.meta, color: T.accent }}>
                <span style={{ width: 12, height: 12, border: `1.5px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
                Tweaking this activity…
              </div>
            ) : tweakOpen && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
                <input value={tweakText} onChange={e => setTweakText(e.target.value)} autoFocus
                  onKeyDown={e => e.key === "Enter" && submitTweak()}
                  placeholder="e.g. make it more relaxed · something cheaper nearby"
                  style={{ flex: 1, minWidth: 0, padding: "6px 9px", border: `1px solid ${T.accent}`, borderRadius: T.r.sm, background: T.bg2, color: T.ink, outline: "none", fontSize: T.fs.meta, fontFamily: T.font }} />
                <button onClick={submitTweak} style={{ ...iconBtn, fontSize: T.fs.meta, fontWeight: 700, color: T.white, background: T.accent, padding: "5px 11px" }}>Ask AI</button>
                <button onClick={() => setTweakOpen(false)} style={{ ...iconBtn, fontSize: T.fs.meta, color: T.muted }}>✕</button>
              </div>
            )}
          </div>

          {/* Actions (hidden while an AI tweak is in flight) */}
          {!isTweaking && (
            <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 2 }}>
              {confirmDel ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4, background: T.bg3, borderRadius: T.r.sm, padding: "2px 4px" }}>
                  <span style={{ fontSize: T.fs.label, color: T.muted, paddingLeft: 4 }}>Delete?</span>
                  <button onClick={() => onDeleteActivity(dayIdx, a.id)} title="Confirm delete" style={{ ...iconBtn, color: "#f08070", fontWeight: 700 }}>Yes</button>
                  <button onClick={() => setConfirmDel(false)} title="Keep" style={{ ...iconBtn, color: T.muted }}>No</button>
                </div>
              ) : (
                <>
                  <button onClick={() => online && setTweakOpen(o => !o)} disabled={!online}
                    title={online ? "Ask AI to tweak this" : "Tweaking needs a connection"}
                    style={{ ...iconBtn, color: tweakOpen ? T.accent : T.muted, opacity: online ? 1 : .35, cursor: online ? "pointer" : "not-allowed" }}>✦</button>
                  {otherDays.length > 0 && (
                    <button onClick={() => setMoving(m => !m)} title="Move to another day" style={{ ...iconBtn, color: moving ? T.accent : T.muted }}>⤴</button>
                  )}
                  <button onClick={() => setEditing(true)} title="Edit" style={{ ...iconBtn, color: T.muted }}>✎</button>
                  <button onClick={() => setConfirmDel(true)} title="Delete" style={{ ...iconBtn, color: T.hint }}>✕</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Reorder.Item>
  );
}

function FoodRow({ f }) {
  return (
    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
      <td style={{ padding: "6px 5px", fontSize: T.fs.meta, color: T.muted, verticalAlign: "top", wordBreak: "break-word" }}>{clean(f.meal)}</td>
      <td style={{ padding: "6px 5px", fontSize: T.fs.meta, color: T.ink, fontWeight: 600, verticalAlign: "top", wordBreak: "break-word" }}>{clean(f.name)}</td>
      <td style={{ padding: "6px 5px", fontSize: T.fs.meta, color: T.muted, verticalAlign: "top", wordBreak: "break-word" }}>{clean(f.order)}</td>
      <td style={{ padding: "6px 5px", fontSize: T.fs.meta, color: T.accent, fontWeight: 600, verticalAlign: "top", whiteSpace: "nowrap" }}>{clean(f.price)}</td>
    </tr>
  );
}

/* ── Buckets view ─────────────────────────────────────────────────────────
   Compact, read-only cards grouped by time-of-day. Tap a "→ Bucket" chip to
   re-time an activity into another bucket. Detailed edits live in Timeline. */
function BucketCard({ a, dayIdx, bucket, onMoveToBucket }) {
  return (
    <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: T.r.md, padding: "8px 10px", marginBottom: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <span style={{ fontSize: T.fs.label, color: T.accent, fontWeight: 700, flexShrink: 0, width: 54 }}>{displayTime(clean(a.time))}</span>
        <span style={{ fontSize: T.fs.body, color: T.ink, fontWeight: 700, lineHeight: 1.3 }}>{clean(a.title)}</span>
      </div>
      {a.details && <div style={{ marginTop: 3 }}><DetailsBlock details={a.details} indent={62} /></div>}
      <div style={{ display: "flex", gap: 5, marginTop: 6, marginLeft: 62, alignItems: "center" }}>
        <span style={{ fontSize: T.fs.label, color: T.hint }}>Move to:</span>
        {BUCKETS.filter(b => b !== bucket).map(b => (
          <button key={b} onClick={() => onMoveToBucket(dayIdx, a.id, b)}
            style={{ ...iconBtn, fontSize: T.fs.label, color: T.accent, border: `1px solid ${T.border2}`, padding: "2px 8px" }}>
            {b}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BucketView({ day, dayIdx, onMoveToBucket }) {
  return (
    <div>
      {BUCKETS.map(bucket => {
        const items = day.activities
          .filter(a => bucketOf(a.time) === bucket)
          .sort((x, y) => timeSortKey(x.time) - timeSortKey(y.time));
        return (
          <div key={bucket} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
              <span style={{ fontSize: T.fs.label, fontWeight: 800, color: T.hint, textTransform: "uppercase", letterSpacing: ".07em" }}>{bucket}</span>
              <span style={{ flex: 1, height: 1, background: T.border }} />
              <span style={{ fontSize: T.fs.label, color: T.hint }}>{items.length || ""}</span>
            </div>
            {items.length === 0 ? (
              <div style={{ fontSize: T.fs.meta, color: T.hint, fontStyle: "italic", paddingLeft: 2, marginBottom: 4 }}>Nothing planned.</div>
            ) : (
              items.map(a => <BucketCard key={a.id} a={a} dayIdx={dayIdx} bucket={bucket} onMoveToBucket={onMoveToBucket} />)
            )}
          </div>
        );
      })}
    </div>
  );
}

function DayCard({ day, dayIdx, days, viewMode, tweakingId, onEditActivity, onDeleteActivity, onReorderDay, onMoveActivity, onMoveToBucket, onTweakActivity }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: T.fs.ui, fontWeight: 800, color: T.ink, margin: "0 0 12px", paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>
        {clean(day.label)}
      </div>

      {day.activities.length === 0 ? (
        <div style={{ fontSize: T.fs.body, color: T.hint, fontStyle: "italic", padding: "8px 0", marginBottom: 8 }}>
          No activities left for this day.
        </div>
      ) : viewMode === "buckets" ? (
        <BucketView day={day} dayIdx={dayIdx} onMoveToBucket={onMoveToBucket} />
      ) : (
        <Reorder.Group axis="y" as="div" values={day.activities} onReorder={next => onReorderDay(dayIdx, next)}>
          {day.activities.map(a => (
            <ActivityBlock key={a.id} a={a} dayIdx={dayIdx} days={days} isTweaking={tweakingId === a.id}
              onEditActivity={onEditActivity} onDeleteActivity={onDeleteActivity} onMoveActivity={onMoveActivity} onTweakActivity={onTweakActivity} />
          ))}
        </Reorder.Group>
      )}

      {day.food.length > 0 && (
        <div style={{ marginTop: 12, marginBottom: 4 }}>
          <div style={{ fontSize: T.fs.label, fontWeight: 700, color: T.hint, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>Eat & Drink — suggestions only</div>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup><col style={{ width: "22%" }} /><col style={{ width: "28%" }} /><col style={{ width: "38%" }} /><col style={{ width: "12%" }} /></colgroup>
            <tbody>{day.food.map((f, i) => <FoodRow key={i} f={f} />)}</tbody>
          </table>
        </div>
      )}

      {day.tips.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {day.tips.map((tip, ti) => (
            <div key={ti} style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: T.r.sm, padding: "5px 10px", fontSize: T.fs.meta, color: T.muted, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.accent, display: "inline-block", flexShrink: 0 }} /> {tip}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const viewTab = active => ({
  ...iconBtn, fontSize: T.fs.meta, fontWeight: 700, padding: "5px 12px", borderRadius: T.r.sm,
  color: active ? T.white : T.muted, background: active ? T.accent : "transparent",
});

export default function ItineraryEditor({ model, tweakingId, onEditActivity, onDeleteActivity, onReorderDay, onMoveActivity, onMoveToBucket, onTweakActivity }) {
  const [viewMode, setViewMode] = useState("timeline"); // "timeline" | "buckets" — presentation only
  if (!model?.days?.length) return null;
  const days = model.days.map((d, idx) => ({ idx, label: d.label }));
  return (
    <div style={{ fontFamily: T.font }}>
      {/* View toggle — Timeline (drag/edit) vs Buckets (fast time-of-day rearrange) */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 2, padding: 2, background: T.bg2, border: `1px solid ${T.border}`, borderRadius: T.r.md }}>
          <button onClick={() => setViewMode("timeline")} style={viewTab(viewMode === "timeline")}>Timeline</button>
          <button onClick={() => setViewMode("buckets")}  style={viewTab(viewMode === "buckets")}>Buckets</button>
        </div>
      </div>
      {model.intro && (
        <div style={{ fontSize: T.fs.body, color: T.muted, lineHeight: 1.7, marginBottom: 18 }}>{model.intro}</div>
      )}
      {model.days.map((day, i) => (
        <DayCard key={i} day={day} dayIdx={i} days={days} viewMode={viewMode} tweakingId={tweakingId}
          onEditActivity={onEditActivity} onDeleteActivity={onDeleteActivity}
          onReorderDay={onReorderDay} onMoveActivity={onMoveActivity} onMoveToBucket={onMoveToBucket} onTweakActivity={onTweakActivity} />
      ))}
    </div>
  );
}
