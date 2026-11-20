/**
 * ItineraryEditor — renders the structured plan model as editable blocks.
 *
 * Phase 1: inline-edit (time / title / details) + delete per activity.
 * Phase 2: drag to reorder within a day (framer Reorder + a drag handle so it
 * doesn't fight the tap controls), and a "Move" picker to send an activity to
 * another day. Food renders read-only; tips attach to the activity they name
 * (matchTipToActivity, same as the PDF) with the rest day-level read-only.
 * Phase 3 (design pick 3B, 2026-08-11): tap a stop to select it and a labeled
 * action bar (Tweak / Move / Edit / Remove) reveals at its foot. One stop
 * selected at a time; reading mode stays clean. Plain CSS transitions.
 *
 * TRANSIT DIAGRAM (redesign direction E, 2026-11-20): a day is a LINE and a
 * stop is a STATION. Each day takes one color from T.line, in day order. The
 * stops sit on a thick vertical line in that color. The station symbol says
 * what kind of stop it is: ring = stop, ring with a center = book ahead,
 * bar = the last stop of the day. Stops are rows, not cards.
 *
 * All mutations lift to useGenerate, which re-serializes planText and persists,
 * so copy / PDF export / reload all stay in sync.
 */
import { useState, useEffect } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { T, NO_MOTION } from "../lib/constants.js";
import { chipSt, fieldSt } from "../lib/styles.js";
import { useOnline } from "../hooks/useOnline.js";
import { BUCKETS, bucketOf, timeSortKey, formatTime, displayTime, splitDetails, matchTipToActivity, findGroundedVenue } from "../lib/utils.js";
import Glyph from "./Glyphs.jsx";
import StationSymbol from "./StationSymbol.jsx";

const clean = s => (s || "").replace(/\*\*/g, "").trim();

/** The line color for a day. Day 6 and later wrap. */
export const dayLineColor = dayIdx => T.line[dayIdx % T.line.length];

/** Which station symbol a stop gets. Booking wins over "last stop". */
export function stationKind(details, isLast) {
  if (splitDetails(details).facts.some(f => f.kind === "booking")) return "book";
  return isLast ? "end" : "stop";
}

// Station column: the symbol is 26px in a 30px column. LINE_LEFT centers the
// 10px day line under it. STATION_Y is the symbol's center from the top of a
// stop row (10 padding + 1 + half of 26). Keep these numbers in step.
const STATION = 26, STATION_COL = 30, LINE_W = 10;
const ROW_PAD_LEFT = 2, STATION_Y = 24;
const LINE_LEFT = ROW_PAD_LEFT + (STATION_COL - LINE_W) / 2;

/**
 * The day line is drawn per stop, one segment per row, so it starts at the
 * first station and ends at the last one for any row height. (One long bar
 * behind the list cannot know where the last station sits.)
 */
function lineSegmentSt(color, isFirst, isLast) {
  const top = isFirst ? STATION_Y : 0;
  return {
    position: "absolute", left: LINE_LEFT, width: LINE_W, background: color, top,
    ...(isLast ? { height: STATION_Y - top } : { bottom: 0 }),
  };
}

const timeSt = { fontFamily: T.fontMono, fontSize: T.fs.ui, fontWeight: 900, color: T.ink, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 };
const smallBtn = {
  minHeight: 40, padding: "0 14px", borderRadius: T.r.pill, cursor: "pointer",
  fontFamily: T.font, fontSize: T.fs.body, fontWeight: 700, lineHeight: 1,
};
const solidBtn   = { ...smallBtn, color: T.white, background: T.ink, border: `2px solid ${T.ink}` };
const outlineBtn = { ...smallBtn, color: T.ink, background: "transparent", border: `2px solid ${T.ink}` };
const dangerBtn  = { ...smallBtn, color: T.white, background: T.accent, border: `2px solid ${T.accent}` };
const smallField = { ...fieldSt, padding: "9px 12px", fontSize: T.fs.body };
const subhead    = { fontSize: T.fs.body, fontWeight: 900, color: T.ink };

/* ── Facts (design pick 4A, with the 4C legacy bridge) ───────────────────────
   splitDetails() turns the stored Details string into a description line plus
   standardized fact tokens at RENDER TIME only — the string itself is never
   rewritten, so edit/copy/PDF/sync all keep carrying the raw cell. Grammar
   plans split on " · "; legacy sentence-blobs get facts derived from the
   prose (which keeps the facts too — a regex can miss).
   Transit Diagram: facts are one plain text line with a glyph each, not
   boxed chips. A booking fact takes the accent ink. */
const FACT_GLYPH = { cost: "coin", duration: "clock", hours: "doors", booking: "bookmark", note: "info" };

function DetailsBlock({ details, tips, mapUrl, indent = 0 }) {
  const { desc, facts } = splitDetails(details);
  if (!desc && !facts.length && !tips?.length && !mapUrl) return null;
  return (
    <>
      {desc && <div style={{ fontFamily: T.fontProse, fontWeight: 400, fontSize: T.fs.body, color: T.muted, lineHeight: 1.5, marginLeft: indent }}>{desc}</div>}
      {/* Attached tip reads as part of the description, so it sits above the
          facts — facts close the stop (Kraig, 2026-08-11). */}
      <TipLines tips={tips} indent={indent} />
      {(facts.length > 0 || mapUrl) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 6, marginLeft: indent }}>
          {facts.map((f, i) => (
            <span key={i} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: T.fs.meta, fontWeight: 700, lineHeight: 1.4, fontVariantNumeric: "tabular-nums",
              color: f.kind === "booking" ? T.accentInk : T.muted,
            }}>
              <Glyph name={FACT_GLYPH[f.kind] || "info"} size={12} color="currentColor" />
              {f.text}
            </span>
          ))}
          {/* Map link (pick A) — verified venues only, pinned to Google's own
              Place ID. An <a>, not a button: long-press/cmd-click must work.
              stopPropagation keeps the stop's tap-to-select untouched. */}
          {mapUrl && (
            <a href={mapUrl} target="_blank" rel="noopener noreferrer"
              aria-label="Open in Google Maps"
              onClick={e => e.stopPropagation()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: T.fs.meta, fontWeight: 900, lineHeight: 1.4,
                color: T.accentInk, textDecoration: "underline", textUnderlineOffset: 3,
              }}>
              <Glyph name="pin" size={12} color="currentColor" />
              Map
            </a>
          )}
        </div>
      )}
    </>
  );
}

/* ── Slot time picker (design pick 3A) ───────────────────────────────────────
   Tap a slot instead of typing. 30-minute grain grouped by daypart — the
   grain an itinerary actually uses. Slots are 24-hour (the app-wide format).
   An off-grid value ("09:15", a legacy "9:15 AM", a range) keeps showing on
   the trigger and survives Save untouched unless a slot is picked, so
   AI-written times are never mangled. */
const DAYPARTS = [
  { label: "Morning",   from: 6 * 60,  to: 11 * 60 + 30 },
  { label: "Afternoon", from: 12 * 60, to: 17 * 60 + 30 },
  { label: "Evening",   from: 18 * 60, to: 23 * 60 + 30 },
];

function TimeSlotPicker({ value, onPick }) {
  return (
    <div style={{ background: T.bg1, border: `2px solid ${T.ink}`, borderRadius: T.r.md, padding: "12px 12px 4px", marginBottom: 8 }}>
      {DAYPARTS.map(p => {
        const slots = [];
        for (let m = p.from; m <= p.to; m += 30) slots.push(formatTime(m));
        return (
          <div key={p.label} style={{ marginBottom: 10 }}>
            <div style={{ ...subhead, marginBottom: 6 }}>{p.label}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {slots.map(t => {
                const on = t === value;
                return (
                  <button key={t} aria-pressed={on} onClick={() => onPick(t)}
                    style={{ ...chipSt(on, { small: true }), width: 66, padding: 0, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
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

/* 3B action-bar button: a labeled target. Kraig described the old overlay
   icons by shape ("the diamond, the arrow"), which means they never read as
   functions. Labels + a 48px height fix both complaints at once. */
function ActionBtn({ glyph, label, onClick, danger, active, disabled, title }) {
  const tone = active ? T.white : danger ? T.danger : T.ink;
  return (
    <button onClick={onClick} disabled={disabled} title={title || label} aria-pressed={active || undefined}
      style={{
        flex: 1, minHeight: 48, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 3, padding: "6px 4px",
        background: active ? T.ink : T.bg1,
        border: `2px solid ${T.ink}`, borderRadius: T.r.md,
        cursor: disabled ? "not-allowed" : "pointer", fontFamily: T.font, opacity: disabled ? .4 : 1,
      }}>
      <Glyph name={glyph} size={15} color={tone} />
      <span style={{ fontSize: T.fs.meta, fontWeight: 700, color: tone }}>{label}</span>
    </button>
  );
}

/* Attached tip line — a tip that names this stop renders inside it (same
   matcher as the PDF's 2B day cards, so the two surfaces agree). */
function TipLines({ tips, indent = 0 }) {
  if (!tips?.length) return null;
  return tips.map((tip, i) => (
    <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 6, marginLeft: indent, fontFamily: T.fontProse, fontWeight: 400, fontSize: T.fs.meta, color: T.muted, lineHeight: 1.5 }}>
      <span style={{ flexShrink: 0, marginTop: 2 }}><Glyph name="info" size={12} color={T.ink} /></span>
      <span>{tip}</span>
    </div>
  ));
}

function ActivityBlock({ a, tips, mapUrl, dayIdx, days, isFirst, isLast, isTweaking, selected, onToggleSelect, onEditActivity, onDeleteActivity, onMoveActivity, onTweakActivity }) {
  // The AI tweak is the only per-activity action that calls the AI; inline
  // edit, move and delete are all local, so they stay available offline.
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

  const otherDays = days.filter(d => d.idx !== dayIdx);
  const barOpen = selected && !isTweaking;

  return (
    <Reorder.Item value={a} as="div" dragListener={false} dragControls={controls}
      style={{
        position: "relative", listStyle: "none", borderRadius: T.r.md,
        // Editing: an opaque panel (it covers the day line on purpose).
        // Selected: an inset ring with NO fill, so the day line stays visible.
        ...(editing
          ? { background: T.bg1, border: `2px solid ${T.ink}`, padding: 12, margin: "6px 0" }
          : { padding: `10px 8px 10px ${ROW_PAD_LEFT}px`, boxShadow: selected ? `inset 0 0 0 2px ${T.ink}` : "none" }),
      }}>
      {!editing && <span aria-hidden="true" data-line-segment="" style={lineSegmentSt(dayLineColor(dayIdx), isFirst, isLast)} />}

      {editing ? (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button onClick={() => setPickerOpen(v => !v)}
              title="Pick a time"
              style={{ ...smallField, width: 116, flexShrink: 0, fontWeight: 900, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clean(time) || "Set time"}</span>
              <span style={{ color: T.muted, fontSize: T.fs.label, flexShrink: 0 }}>{pickerOpen ? "▴" : "▾"}</span>
            </button>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Place / activity" autoFocus
              aria-label="Place or activity" style={{ ...smallField, fontWeight: 700 }} />
          </div>
          {pickerOpen && (
            <TimeSlotPicker value={clean(time)} onPick={t => { setTime(t); setPickerOpen(false); }} />
          )}
          <textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="Details — what it is · ~€15 · 2h · opens 09:00 · book ahead" rows={3}
            aria-label="Details" style={{ ...smallField, lineHeight: 1.5, resize: "vertical", marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={cancel} style={outlineBtn}>Cancel</button>
            <button onClick={save} style={solidBtn}>Save</button>
          </div>
        </>
      ) : (
        <>
          {/* Tap anywhere on the stop to select it (3B) — inner controls stop
              propagation so acting never re-toggles the selection. */}
          <div onClick={() => onToggleSelect(a.id)} role="button" tabIndex={0} aria-expanded={selected}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleSelect(a.id); } }}
            style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer", outline: "none" }}>
            <span style={{ position: "relative", width: STATION_COL, flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: 1 }}>
              <StationSymbol kind={stationKind(a.details, isLast)} size={STATION} />
            </span>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
              <div style={{ fontSize: T.fs.ui, color: T.ink, fontWeight: 700, lineHeight: 1.3, marginBottom: 2 }}>{clean(a.title)}</div>
              {(a.details || tips?.length > 0 || mapUrl) && <DetailsBlock details={a.details} tips={tips} mapUrl={mapUrl} />}
              {/* Move picker — choose a destination day */}
              {moving && otherDays.length > 0 && (
                <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 10 }}>
                  <span style={{ fontSize: T.fs.body, fontWeight: 700, color: T.ink }}>Move to:</span>
                  {otherDays.map(d => (
                    <button key={d.idx} onClick={() => { onMoveActivity(dayIdx, a.id, d.idx); setMoving(false); }}
                      style={{ ...chipSt(false, { small: true }), borderBottom: `6px solid ${dayLineColor(d.idx)}` }}>
                      Day {d.idx + 1}
                    </button>
                  ))}
                  <button onClick={() => setMoving(false)} style={{ ...smallBtn, color: T.muted, background: "none", border: "none" }}>Cancel</button>
                </div>
              )}
              {/* AI tweak — free-text instruction for just this activity */}
              {isTweaking ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: T.fs.body, fontWeight: 700, color: T.ink }}>
                  <span style={{ width: 13, height: 13, border: `2px solid ${T.border}`, borderTopColor: T.ink, borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
                  Tweaking this activity…
                </div>
              ) : tweakOpen && (
                <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10 }}>
                  <input value={tweakText} onChange={e => setTweakText(e.target.value)} autoFocus
                    onKeyDown={e => e.key === "Enter" && submitTweak()}
                    aria-label="What to change"
                    placeholder="e.g. make it more relaxed · something cheaper nearby"
                    style={{ ...smallField, flex: 1, minWidth: 0 }} />
                  <button onClick={submitTweak} style={solidBtn}>Ask AI</button>
                  <button onClick={() => setTweakOpen(false)} aria-label="Close" style={{ ...smallBtn, padding: "0 8px", color: T.muted, background: "none", border: "none" }}>✕</button>
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, paddingTop: 2 }}>
              <span style={timeSt}>{displayTime(clean(a.time))}</span>
              {/* Drag handle — the only drag trigger, so taps elsewhere stay clickable */}
              <span onPointerDown={e => controls.start(e)} onClick={e => e.stopPropagation()} title="Drag to reorder"
                style={{ cursor: "grab", touchAction: "none", color: T.hint, fontSize: T.fs.ui, padding: "4px 0 4px 10px", userSelect: "none", lineHeight: 1 }}>⠿</span>
            </div>
          </div>

          {/* 3B action bar — reveals under the selected stop; hidden while an
              AI tweak is in flight. max-height + opacity so the collapse is a
              plain CSS transition (no framer). Off under VITE_NO_MOTION: the
              pane freezes transitions mid-flight. */}
          <div onClick={e => e.stopPropagation()}
            style={{ maxHeight: barOpen ? 96 : 0, opacity: barOpen ? 1 : 0, overflow: "hidden", transition: NO_MOTION ? "none" : "max-height .28s ease, opacity .22s ease" }}>
            {confirmDel ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 2px 2px 42px" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: T.fs.body, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Remove <strong style={{ color: T.ink }}>{clean(a.title)}</strong>?
                </span>
                <button onClick={() => onDeleteActivity(dayIdx, a.id)} style={dangerBtn}>Remove</button>
                <button onClick={() => setConfirmDel(false)} style={outlineBtn}>Keep</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6, margin: "10px 2px 2px 42px" }}>
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
      <td style={{ padding: "6px 5px", fontSize: T.fs.meta, color: T.ink, fontWeight: 700, verticalAlign: "top", wordBreak: "break-word" }}>{clean(f.name)}</td>
      <td style={{ padding: "6px 5px", fontSize: T.fs.meta, color: T.muted, verticalAlign: "top", wordBreak: "break-word" }}>{clean(f.order)}</td>
      <td style={{ padding: "6px 5px", fontSize: T.fs.meta, color: T.ink, fontWeight: 700, verticalAlign: "top", whiteSpace: "nowrap" }}>{clean(f.price)}</td>
    </tr>
  );
}

/* ── Buckets view ─────────────────────────────────────────────────────────
   Compact, read-only rows grouped by time-of-day. Tap a bucket name to
   re-time an activity into that bucket. Detailed edits live in Timeline. */
const BUCKET_INDENT = STATION_COL + 12;

function BucketCard({ a, tips, mapUrl, dayIdx, bucket, isLast, onMoveToBucket }) {
  return (
    <div style={{ padding: "10px 0", borderTop: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span style={{ width: STATION_COL, flexShrink: 0, display: "flex", justifyContent: "center" }}>
          <StationSymbol kind={stationKind(a.details, isLast)} size={22} />
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: T.fs.ui, color: T.ink, fontWeight: 700, lineHeight: 1.3 }}>{clean(a.title)}</span>
        <span style={timeSt}>{displayTime(clean(a.time))}</span>
      </div>
      {(a.details || tips?.length > 0 || mapUrl) && <div style={{ marginTop: 3 }}><DetailsBlock details={a.details} tips={tips} mapUrl={mapUrl} indent={BUCKET_INDENT} /></div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, marginLeft: BUCKET_INDENT, alignItems: "center" }}>
        <span style={{ fontSize: T.fs.body, fontWeight: 700, color: T.ink }}>Move to:</span>
        {BUCKETS.filter(b => b !== bucket).map(b => (
          <button key={b} onClick={() => onMoveToBucket(dayIdx, a.id, b)} style={chipSt(false, { small: true })}>
            {b}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BucketView({ day, dayIdx, tipsFor, mapUrlFor, onMoveToBucket }) {
  const lastId = day.activities[day.activities.length - 1]?.id;
  return (
    <div>
      {BUCKETS.map(bucket => {
        const items = day.activities
          .filter(a => bucketOf(a.time) === bucket)
          .sort((x, y) => timeSortKey(x.time) - timeSortKey(y.time));
        return (
          <div key={bucket} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={subhead}>{bucket}</span>
              <span style={{ fontSize: T.fs.body, fontWeight: 700, color: T.muted }}>{items.length || ""}</span>
            </div>
            {items.length === 0 ? (
              <div style={{ fontSize: T.fs.body, color: T.muted, padding: "10px 0", borderTop: `1px solid ${T.border}` }}>Nothing planned.</div>
            ) : (
              items.map(a => <BucketCard key={a.id} a={a} tips={tipsFor?.get(a.id)} mapUrl={mapUrlFor?.(a)} dayIdx={dayIdx} bucket={bucket} isLast={a.id === lastId} onMoveToBucket={onMoveToBucket} />)
            )}
          </div>
        );
      })}
    </div>
  );
}

function DayCard({ day, dayIdx, days, viewMode, categories, tweakingId, selectedId, onToggleSelect, onEditActivity, onDeleteActivity, onReorderDay, onMoveActivity, onMoveToBucket, onTweakActivity }) {
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

  // Map link (pick A): a row whose title names a grounded venue links to
  // Google's exact pin. Render-time only — nothing is stored on the plan.
  const mapUrlFor = (a) => findGroundedVenue(clean(a.title), categories)?.mapUrl;
  const color = dayLineColor(dayIdx);
  const count = day.activities.length;

  return (
    <div data-day-line={dayIdx} style={{ marginBottom: 30 }}>
      {/* Day header: the line color opens the day. */}
      <h2 style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 0 8px", fontFamily: T.fontDay, fontSize: T.fs.title, fontWeight: 900, letterSpacing: "-.02em", color: T.ink, lineHeight: 1.2 }}>
        <span aria-hidden="true" style={{ width: STATION_COL + 2, height: 12, background: color, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>{clean(day.label)}</span>
        {count > 0 && <span style={{ fontFamily: T.font, fontSize: T.fs.body, fontWeight: 500, letterSpacing: 0, color: T.muted, flexShrink: 0 }}>{count} {count === 1 ? "stop" : "stops"}</span>}
      </h2>

      {count === 0 ? (
        <div style={{ fontSize: T.fs.body, color: T.muted, padding: "8px 0", marginBottom: 8 }}>
          No activities left for this day.
        </div>
      ) : viewMode === "buckets" ? (
        <BucketView day={day} dayIdx={dayIdx} tipsFor={tipsFor} mapUrlFor={mapUrlFor} onMoveToBucket={onMoveToBucket} />
      ) : (
        <div>
          <Reorder.Group axis="y" as="div" values={day.activities} onReorder={next => onReorderDay(dayIdx, next)} style={{ margin: 0, padding: 0 }}>
            {day.activities.map((a, i) => (
              <ActivityBlock key={a.id} a={a} tips={tipsFor.get(a.id)} mapUrl={mapUrlFor(a)} dayIdx={dayIdx} days={days} isFirst={i === 0} isLast={i === count - 1} isTweaking={tweakingId === a.id}
                selected={selectedId === a.id} onToggleSelect={onToggleSelect}
                onEditActivity={onEditActivity} onDeleteActivity={onDeleteActivity} onMoveActivity={onMoveActivity} onTweakActivity={onTweakActivity} />
            ))}
          </Reorder.Group>
        </div>
      )}

      {day.food.length > 0 && (
        <div style={{ marginTop: 14, marginBottom: 4 }}>
          <div style={{ ...subhead, marginBottom: 6 }}>Eat & Drink — suggestions only</div>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup><col style={{ width: "22%" }} /><col style={{ width: "28%" }} /><col style={{ width: "38%" }} /><col style={{ width: "12%" }} /></colgroup>
            <tbody>{day.food.map((f, i) => <FoodRow key={i} f={f} />)}</tbody>
          </table>
        </div>
      )}

      {dayTips.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ ...subhead, marginBottom: 4 }}>Before you go</div>
          {dayTips.map((tip, ti) => (
            <div key={ti} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderTop: `1px solid ${T.border}`, fontFamily: T.fontProse, fontSize: T.fs.body, color: T.muted, lineHeight: 1.5 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, background: color, flexShrink: 0, marginTop: 7 }} />
              <span>{tip}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ItineraryEditor({ model, categories, tweakingId, onEditActivity, onDeleteActivity, onReorderDay, onMoveActivity, onMoveToBucket, onTweakActivity }) {
  const [viewMode, setViewMode] = useState("timeline"); // "timeline" | "buckets" — presentation only
  // 3B: one selected stop at a time — tap to open its action bar, tap again
  // (or tap another stop) to close. Presentation state only, never persisted.
  const [selectedId, setSelectedId] = useState(null);
  const toggleSelect = id => setSelectedId(s => (s === id ? null : id));
  if (!model?.days?.length) return null;
  const days = model.days.map((d, idx) => ({ idx, label: d.label }));
  return (
    <div style={{ fontFamily: T.font }}>
      {/* View toggle — Timeline (drag/edit) vs Buckets (fast time-of-day rearrange) */}
      <div role="group" aria-label="Itinerary view" style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 16 }}>
        <button aria-pressed={viewMode === "timeline"} onClick={() => setViewMode("timeline")} style={chipSt(viewMode === "timeline", { small: true })}>Timeline</button>
        <button aria-pressed={viewMode === "buckets"}  onClick={() => setViewMode("buckets")}  style={chipSt(viewMode === "buckets", { small: true })}>Buckets</button>
      </div>
      {model.intro && (
        <div style={{ fontFamily: T.fontProse, fontSize: T.fs.body, color: T.muted, lineHeight: 1.7, marginBottom: 20 }}>{model.intro}</div>
      )}
      {model.days.map((day, i) => (
        <DayCard key={i} day={day} dayIdx={i} days={days} viewMode={viewMode} categories={categories} tweakingId={tweakingId}
          selectedId={selectedId} onToggleSelect={toggleSelect}
          onEditActivity={onEditActivity} onDeleteActivity={onDeleteActivity}
          onReorderDay={onReorderDay} onMoveActivity={onMoveActivity} onMoveToBucket={onMoveToBucket} onTweakActivity={onTweakActivity} />
      ))}
    </div>
  );
}
