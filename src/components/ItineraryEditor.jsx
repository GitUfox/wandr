/**
 * ItineraryEditor — renders the structured plan model as editable blocks.
 *
 * Phase 1: inline-edit (time / title / details) + delete per activity.
 * Phase 2: drag to reorder within a day (framer Reorder + a drag handle so it
 * doesn't fight the tap controls), and a "Move" picker to send an activity to
 * another day. Food renders read-only; tips attach to the activity they name
 * (matchTipToActivity, same as the PDF) with the rest day-level read-only.
 * Phase 3 (design pick 3B, 2026-08-11): actions moved off the cramped corner
 * overlay — tap a card to select it and a labeled action bar (Tweak / Move /
 * Edit / Remove, 44px targets) reveals at its foot. One card selected at a
 * time; reading mode stays clean. Plain CSS transitions, no framer.
 *
 * All mutations lift to useGenerate, which re-serializes planText and persists,
 * so copy / PDF export / reload all stay in sync.
 */
import { useState, useEffect } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { T } from "../lib/constants.js";
import { useOnline } from "../hooks/useOnline.js";
import { BUCKETS, bucketOf, timeSortKey, formatTime, displayTime, splitDetails, matchTipToActivity } from "../lib/utils.js";
import Glyph from "./Glyphs.jsx";

const clean = s => (s || "").replace(/\*\*/g, "").trim();

/* ── Fact chips (design pick 4A, with the 4C legacy bridge) ──────────────────
   splitDetails() turns the stored Details string into a description line plus
   standardized fact tokens at RENDER TIME only — the string itself is never
   rewritten, so edit/copy/PDF/sync all keep carrying the raw cell. Grammar
   plans split on " · "; legacy sentence-blobs get chips derived from the
   prose (which keeps the facts too — a regex can miss). */
const FACT_GLYPH = { cost: "coin", duration: "clock", hours: "doors", booking: "bookmark", note: "info" };

function DetailsBlock({ details, tips, indent = 0 }) {
  const { desc, facts } = splitDetails(details);
  if (!desc && !facts.length && !tips?.length) return null;
  return (
    <>
      {desc && <div style={{ fontSize: T.fs.meta, color: T.muted, lineHeight: 1.55, marginLeft: indent }}>{desc}</div>}
      {/* Attached tip reads as part of the description, so it sits above the
          fact chips — chips close the card (Kraig, 2026-08-11). */}
      <TipLines tips={tips} indent={indent} />
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

/* 3B action-bar button: big labeled target — Kraig described the old overlay
   icons by shape ("the diamond, the arrow"), which means they never read as
   functions. Labels + 44px minimum height fix both complaints at once. */
function ActionBtn({ glyph, label, onClick, danger, active, disabled, title }) {
  const tone = danger ? "#f08070" : active ? T.accent : T.muted;
  return (
    <button onClick={onClick} disabled={disabled} title={title || label}
      style={{
        flex: 1, minHeight: 44, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 3, padding: "6px 4px",
        background: active ? "rgba(201,100,66,.08)" : T.bg2,
        border: `1px solid ${active ? T.accent : T.border}`, borderRadius: T.r.sm,
        cursor: disabled ? "not-allowed" : "pointer", fontFamily: T.font, opacity: disabled ? .4 : 1,
      }}>
      <Glyph name={glyph} size={15} color={tone} />
      <span style={{ fontSize: T.fs.micro, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: danger ? "#f08070" : T.hint }}>{label}</span>
    </button>
  );
}

/* Attached tip line — a tip that names this activity renders inside its card
   (same matcher as the PDF's 2B day cards, so the two surfaces agree). */
function TipLines({ tips, indent = 0 }) {
  if (!tips?.length) return null;
  return tips.map((tip, i) => (
    <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 6, marginLeft: indent, fontSize: T.fs.label, color: T.muted, lineHeight: 1.5 }}>
      <span style={{ flexShrink: 0, marginTop: 1 }}><Glyph name="info" size={11} color={T.accent} /></span>
      <span>{tip}</span>
    </div>
  ));
}

function ActivityBlock({ a, tips, dayIdx, days, isTweaking, selected, onToggleSelect, onEditActivity, onDeleteActivity, onMoveActivity, onTweakActivity }) {
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

  // Deselecting collapses the bar — any half-open sub-state (a pending delete
  // confirm, an open move picker) must not survive into the next selection.
  useEffect(() => {
    if (!selected) { setConfirmDel(false); setMoving(false); setTweakOpen(false); }
  }, [selected]);

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
      style={{ position: "relative", background: T.bg1, border: `1px solid ${editing || selected ? T.accent : T.border}`, borderRadius: T.r.md, padding: editing ? "11px 12px" : "10px 10px 10px 4px", marginBottom: 8, listStyle: "none", transition: "border-color .2s ease" }}>

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
        <>
          {/* Tap anywhere on the card to select it (3B) — inner controls stop
              propagation so acting never re-toggles the selection. */}
          <div onClick={() => onToggleSelect(a.id)} role="button" tabIndex={0} aria-expanded={selected}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleSelect(a.id); } }}
            style={{ display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer", outline: "none" }}>
            {/* Drag handle — the only drag trigger, so taps elsewhere stay clickable */}
            <span onPointerDown={e => controls.start(e)} onClick={e => e.stopPropagation()} title="Drag to reorder"
              style={{ cursor: "grab", touchAction: "none", color: T.hint, fontSize: T.fs.ui, padding: "2px 4px", flexShrink: 0, userSelect: "none", lineHeight: 1.2 }}>⠿</span>
            <div style={{ width: 58, flexShrink: 0, fontSize: T.fs.meta, color: T.accent, fontWeight: 700, paddingTop: 2 }}>{displayTime(clean(a.time))}</div>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
              <div style={{ fontSize: T.fs.body, color: T.ink, fontWeight: 700, lineHeight: 1.35, marginBottom: 2 }}>{clean(a.title)}</div>
              {(a.details || tips?.length > 0) && <DetailsBlock details={a.details} tips={tips} />}
              {/* Move picker — choose a destination day */}
              {moving && otherDays.length > 0 && (
                <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", marginTop: 8 }}>
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
                <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
                  <input value={tweakText} onChange={e => setTweakText(e.target.value)} autoFocus
                    onKeyDown={e => e.key === "Enter" && submitTweak()}
                    placeholder="e.g. make it more relaxed · something cheaper nearby"
                    style={{ flex: 1, minWidth: 0, padding: "6px 9px", border: `1px solid ${T.accent}`, borderRadius: T.r.sm, background: T.bg2, color: T.ink, outline: "none", fontSize: T.fs.meta, fontFamily: T.font }} />
                  <button onClick={submitTweak} style={{ ...iconBtn, fontSize: T.fs.meta, fontWeight: 700, color: T.white, background: T.accent, padding: "5px 11px" }}>Ask AI</button>
                  <button onClick={() => setTweakOpen(false)} style={{ ...iconBtn, fontSize: T.fs.meta, color: T.muted }}>✕</button>
                </div>
              )}
            </div>
          </div>

          {/* 3B action bar — reveals under the selected card; hidden while an
              AI tweak is in flight. max-height + opacity so the collapse is a
              plain CSS transition (no framer, works under VITE_NO_MOTION). */}
          <div onClick={e => e.stopPropagation()}
            style={{ maxHeight: selected && !isTweaking ? 96 : 0, opacity: selected && !isTweaking ? 1 : 0, overflow: "hidden", transition: "max-height .28s ease, opacity .22s ease" }}>
            {confirmDel ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, borderTop: `1px solid ${T.border}`, marginTop: 10, marginLeft: 6, paddingTop: 10 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: T.fs.body, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Remove <strong style={{ color: T.ink }}>{clean(a.title)}</strong>?
                </span>
                <button onClick={() => onDeleteActivity(dayIdx, a.id)}
                  style={{ ...iconBtn, fontSize: T.fs.meta, fontWeight: 700, color: T.white, background: T.accent, padding: "7px 14px" }}>Remove</button>
                <button onClick={() => setConfirmDel(false)}
                  style={{ ...iconBtn, fontSize: T.fs.meta, color: T.muted, border: `1px solid ${T.border}`, padding: "7px 12px" }}>Keep</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6, borderTop: `1px solid ${T.border}`, marginTop: 10, marginLeft: 6, paddingTop: 10 }}>
                <ActionBtn glyph="sparkle" label="Tweak" active={tweakOpen} disabled={!online}
                  title={online ? "Ask AI to tweak this" : "Tweaking needs a connection"}
                  onClick={() => setTweakOpen(o => !o)} />
                {otherDays.length > 0 && (
                  <ActionBtn glyph="move" label="Move" active={moving} title="Move to another day"
                    onClick={() => setMoving(m => !m)} />
                )}
                <ActionBtn glyph="pencil" label="Edit" title="Edit time and details" onClick={() => setEditing(true)} />
                <ActionBtn glyph="x" label="Remove" danger title="Remove from this day" onClick={() => setConfirmDel(true)} />
              </div>
            )}
          </div>
        </>
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
function BucketCard({ a, tips, dayIdx, bucket, onMoveToBucket }) {
  return (
    <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: T.r.md, padding: "8px 10px", marginBottom: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <span style={{ fontSize: T.fs.label, color: T.accent, fontWeight: 700, flexShrink: 0, width: 54 }}>{displayTime(clean(a.time))}</span>
        <span style={{ fontSize: T.fs.body, color: T.ink, fontWeight: 700, lineHeight: 1.3 }}>{clean(a.title)}</span>
      </div>
      {(a.details || tips?.length > 0) && <div style={{ marginTop: 3 }}><DetailsBlock details={a.details} tips={tips} indent={62} /></div>}
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

export function BucketView({ day, dayIdx, tipsFor, onMoveToBucket }) {
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
              items.map(a => <BucketCard key={a.id} a={a} tips={tipsFor?.get(a.id)} dayIdx={dayIdx} bucket={bucket} onMoveToBucket={onMoveToBucket} />)
            )}
          </div>
        );
      })}
    </div>
  );
}

function DayCard({ day, dayIdx, days, viewMode, tweakingId, selectedId, onToggleSelect, onEditActivity, onDeleteActivity, onReorderDay, onMoveActivity, onMoveToBucket, onTweakActivity }) {
  // Tips attach to the activity they name (same matcher as the PDF's 2B day
  // cards); the rest stay day-level under "Before you go". Render-time only.
  const titles = day.activities.map(x => clean(x.title));
  const tipsFor = new Map();
  const dayTips = [];
  for (const tip of day.tips) {
    const ti = matchTipToActivity(tip, titles);
    if (ti >= 0) {
      const id = day.activities[ti].id;
      tipsFor.set(id, [...(tipsFor.get(id) || []), tip]);
    } else dayTips.push(tip);
  }

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
        <BucketView day={day} dayIdx={dayIdx} tipsFor={tipsFor} onMoveToBucket={onMoveToBucket} />
      ) : (
        <Reorder.Group axis="y" as="div" values={day.activities} onReorder={next => onReorderDay(dayIdx, next)}>
          {day.activities.map(a => (
            <ActivityBlock key={a.id} a={a} tips={tipsFor.get(a.id)} dayIdx={dayIdx} days={days} isTweaking={tweakingId === a.id}
              selected={selectedId === a.id} onToggleSelect={onToggleSelect}
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

      {dayTips.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: T.fs.micro, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: T.accent, marginBottom: 6 }}>Before you go</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {dayTips.map((tip, ti) => (
              <div key={ti} style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: T.r.sm, padding: "5px 10px", fontSize: T.fs.meta, color: T.muted, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.accent, display: "inline-block", flexShrink: 0 }} /> {tip}
              </div>
            ))}
          </div>
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
  // 3B: one selected card at a time — tap to open its action bar, tap again
  // (or tap another card) to close. Presentation state only, never persisted.
  const [selectedId, setSelectedId] = useState(null);
  const toggleSelect = id => setSelectedId(s => (s === id ? null : id));
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
          selectedId={selectedId} onToggleSelect={toggleSelect}
          onEditActivity={onEditActivity} onDeleteActivity={onDeleteActivity}
          onReorderDay={onReorderDay} onMoveActivity={onMoveActivity} onMoveToBucket={onMoveToBucket} onTweakActivity={onTweakActivity} />
      ))}
    </div>
  );
}
