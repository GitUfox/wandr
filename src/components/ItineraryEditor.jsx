/**
 * ItineraryEditor — renders the structured plan model as editable blocks.
 *
 * Phase 1: each activity is a card you can inline-edit (time / title / details)
 * or delete. Food and tips render read-only (food is "suggestions only" per the
 * product). Drag-to-move between days and per-activity AI tweaks come next.
 *
 * Edits are lifted to useGenerate via onEditActivity / onDeleteActivity, which
 * keep planText in sync so copy / PDF export stay correct.
 */
import { useState } from "react";
import { T } from "../lib/constants.js";

const clean = s => (s || "").replace(/\*\*/g, "").trim();

const iconBtn = {
  background: "transparent", border: "none", cursor: "pointer",
  fontFamily: T.font, fontSize: 12, padding: "3px 6px", borderRadius: 6, lineHeight: 1,
};

function ActivityBlock({ a, dayIdx, onEditActivity, onDeleteActivity }) {
  const [editing, setEditing]       = useState(false);
  const [time, setTime]             = useState(a.time);
  const [title, setTitle]           = useState(clean(a.title));
  const [details, setDetails]       = useState(a.details);
  const [confirmDel, setConfirmDel] = useState(false);

  function save() {
    onEditActivity(dayIdx, a.id, {
      time: time.trim(),
      title: title.trim() ? `**${title.trim()}**` : "",
      details: details.trim(),
    });
    setEditing(false);
  }
  function cancel() {
    setTime(a.time); setTitle(clean(a.title)); setDetails(a.details);
    setEditing(false);
  }

  const inputSt = {
    width: "100%", padding: "7px 10px", border: `1px solid ${T.border2}`, borderRadius: 7,
    background: T.bg2, color: T.ink, outline: "none", fontSize: 12.5, fontFamily: T.font,
    boxSizing: "border-box",
  };

  if (editing) {
    return (
      <div style={{ background: T.bg2, border: `1.5px solid ${T.accent}`, borderRadius: 10, padding: "11px 12px", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input value={time} onChange={e => setTime(e.target.value)} placeholder="Time"
            style={{ ...inputSt, width: 110, flexShrink: 0, color: T.accent, fontWeight: 700 }} />
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Place / activity" autoFocus
            style={{ ...inputSt, fontWeight: 700 }} />
        </div>
        <textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="Details — what it is, how long, how much" rows={3}
          style={{ ...inputSt, lineHeight: 1.5, resize: "vertical", marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 7, justifyContent: "flex-end" }}>
          <button onClick={cancel} style={{ ...iconBtn, fontSize: 12, color: T.muted, padding: "6px 12px", border: `1px solid ${T.border}` }}>Cancel</button>
          <button onClick={save} style={{ ...iconBtn, fontSize: 12, fontWeight: 700, color: T.white, background: T.accent, padding: "6px 14px" }}>Save</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", display: "flex", gap: 12, background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ width: 64, flexShrink: 0, fontSize: 11, color: T.accent, fontWeight: 700, paddingTop: 1 }}>{clean(a.time)}</div>
      <div style={{ flex: 1, minWidth: 0, paddingRight: 56 }}>
        <div style={{ fontSize: 12.5, color: T.ink, fontWeight: 700, lineHeight: 1.35, marginBottom: 2 }}>{clean(a.title)}</div>
        {a.details && <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.55 }}>{clean(a.details)}</div>}
      </div>
      {/* Actions */}
      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 2 }}>
        {confirmDel ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: T.bg3, borderRadius: 7, padding: "2px 4px" }}>
            <span style={{ fontSize: 10.5, color: T.muted, paddingLeft: 4 }}>Delete?</span>
            <button onClick={() => onDeleteActivity(dayIdx, a.id)} title="Confirm delete" style={{ ...iconBtn, color: "#f08070", fontWeight: 700 }}>Yes</button>
            <button onClick={() => setConfirmDel(false)} title="Keep" style={{ ...iconBtn, color: T.muted }}>No</button>
          </div>
        ) : (
          <>
            <button onClick={() => setEditing(true)} title="Edit" style={{ ...iconBtn, color: T.muted }}>✎</button>
            <button onClick={() => setConfirmDel(true)} title="Delete" style={{ ...iconBtn, color: T.hint }}>✕</button>
          </>
        )}
      </div>
    </div>
  );
}

function FoodRow({ f }) {
  return (
    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
      <td style={{ padding: "6px 5px", fontSize: 11, color: T.muted, verticalAlign: "top", wordBreak: "break-word" }}>{clean(f.meal)}</td>
      <td style={{ padding: "6px 5px", fontSize: 11.5, color: T.ink, fontWeight: 600, verticalAlign: "top", wordBreak: "break-word" }}>{clean(f.name)}</td>
      <td style={{ padding: "6px 5px", fontSize: 11, color: T.muted, verticalAlign: "top", wordBreak: "break-word" }}>{clean(f.order)}</td>
      <td style={{ padding: "6px 5px", fontSize: 11, color: T.accent, fontWeight: 600, verticalAlign: "top", whiteSpace: "nowrap" }}>{clean(f.price)}</td>
    </tr>
  );
}

function DayCard({ day, dayIdx, onEditActivity, onDeleteActivity }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, margin: "0 0 12px", paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>
        {clean(day.label)}
      </div>

      {day.activities.length === 0 ? (
        <div style={{ fontSize: 12, color: T.hint, fontStyle: "italic", padding: "8px 0", marginBottom: 8 }}>
          No activities left for this day.
        </div>
      ) : (
        day.activities.map(a => (
          <ActivityBlock key={a.id} a={a} dayIdx={dayIdx} onEditActivity={onEditActivity} onDeleteActivity={onDeleteActivity} />
        ))
      )}

      {day.food.length > 0 && (
        <div style={{ marginTop: 12, marginBottom: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.hint, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>Eat & Drink — suggestions only</div>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup><col style={{ width: "22%" }} /><col style={{ width: "28%" }} /><col style={{ width: "38%" }} /><col style={{ width: "12%" }} /></colgroup>
            <tbody>{day.food.map((f, i) => <FoodRow key={i} f={f} />)}</tbody>
          </table>
        </div>
      )}

      {day.tips.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {day.tips.map((tip, ti) => (
            <div key={ti} style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 10px", fontSize: 11.5, color: T.muted, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.accent, display: "inline-block", flexShrink: 0 }} /> {tip}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ItineraryEditor({ model, onEditActivity, onDeleteActivity }) {
  if (!model?.days?.length) return null;
  return (
    <div style={{ fontFamily: T.font }}>
      {model.intro && (
        <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.7, marginBottom: 18 }}>{model.intro}</div>
      )}
      {model.days.map((day, i) => (
        <DayCard key={i} day={day} dayIdx={i} onEditActivity={onEditActivity} onDeleteActivity={onDeleteActivity} />
      ))}
    </div>
  );
}
