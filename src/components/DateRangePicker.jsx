/**
 * DateRangePicker — custom dark-themed inline calendar for Wandr.
 *
 * Props: d1, setD1, d2, setD2 (ISO date strings "YYYY-MM-DD")
 * Two-phase selection: first click sets arrival, second sets departure.
 */
import { useState } from "react";
import { T } from "../lib/constants.js";

const DAYS   = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function fromISO(s) {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function fmt(s) {
  const d = fromISO(s);
  if (!d) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function sameDay(a, b) {
  return a && b && toISO(a) === toISO(b);
}

function isBetween(day, start, end) {
  if (!start || !end) return false;
  const t = day.getTime();
  return t > start.getTime() && t < end.getTime();
}

export default function DateRangePicker({ d1, setD1, d2, setD2 }) {
  const today = new Date(); today.setHours(0,0,0,0);

  const [open, setOpen]       = useState(false);
  const [phase, setPhase]     = useState("start"); // "start" | "end"
  const [hovered, setHovered] = useState(null);
  const [view, setView]       = useState(() => {
    const ref = fromISO(d1) || today;
    return { year: ref.getFullYear(), month: ref.getMonth() };
  });

  const start = fromISO(d1);
  const end   = fromISO(d2);

  // Days grid for current view month
  function buildGrid() {
    const first = new Date(view.year, view.month, 1);
    const last  = new Date(view.year, view.month + 1, 0);
    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push(null);
    for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(view.year, view.month, d));
    return cells;
  }

  function prevMonth() {
    setView(v => {
      const m = v.month === 0 ? 11 : v.month - 1;
      const y = v.month === 0 ? v.year - 1 : v.year;
      return { year: y, month: m };
    });
  }

  function nextMonth() {
    setView(v => {
      const m = v.month === 11 ? 0 : v.month + 1;
      const y = v.month === 11 ? v.year + 1 : v.year;
      return { year: y, month: m };
    });
  }

  function handleDayClick(day) {
    if (!day) return;
    const iso = toISO(day);
    if (phase === "start") {
      setD1(iso);
      setD2("");
      setPhase("end");
    } else {
      if (start && day < start) {
        // Clicked before start — make it the new start
        setD1(iso);
        setD2("");
        setPhase("end");
      } else {
        setD2(iso);
        setPhase("start");
        setOpen(false);
        setHovered(null);
      }
    }
  }

  function openForPhase(p) {
    setPhase(p);
    setOpen(true);
    // Navigate to relevant month
    const ref = p === "start" ? (fromISO(d1) || today) : (fromISO(d2) || fromISO(d1) || today);
    setView({ year: ref.getFullYear(), month: ref.getMonth() });
  }

  // Determine range end for hover preview
  const previewEnd = phase === "end" && hovered ? hovered : null;
  const rangeStart = start;
  const rangeEnd   = end || previewEnd;

  const grid = buildGrid();
  const nights = start && end ? Math.round((end - start) / 86400000) : null;

  return (
    <div style={{ marginBottom: "1.25rem" }}>

      {/* Date display buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: open ? 12 : 0 }}>
        {[
          { label: "Arrival", iso: d1, ph: "Select date", phase: "start" },
          { label: "Departure", iso: d2, ph: "Select date", phase: "end" },
        ].map(({ label, iso, ph, phase: p }) => {
          const active = open && phase === p;
          return (
            <div key={label}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em", color: T.hint, marginBottom: 5 }}>{label}</div>
              <button
                onClick={() => open && phase === p ? setOpen(false) : openForPhase(p)}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8, background: active ? "#2a1a12" : T.bg3,
                  border: active ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                  color: iso ? T.ink : T.hint, fontSize: 13.5, fontFamily: T.font,
                  textAlign: "left", cursor: "pointer", transition: "all .15s",
                }}>
                {fmt(iso) || ph}
              </button>
            </div>
          );
        })}
      </div>

      {/* Nights badge */}
      {nights && nights > 0 && !open && (
        <div style={{ fontSize: 11, color: T.accent, marginBottom: 8 }}>
          {nights} night{nights !== 1 ? "s" : ""}
        </div>
      )}

      {/* Validation message */}
      {d1 && d2 && d2 <= d1 && (
        <div style={{ fontSize: 12, color: "#f08070", padding: "6px 10px", background: "rgba(200,80,60,.1)", border: "1px solid rgba(200,80,60,.25)", borderRadius: 7, marginTop: 6 }}>
          Departure must be after arrival
        </div>
      )}

      {/* Calendar */}
      {open && (
        <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px", userSelect: "none" }}>

          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <button onClick={prevMonth} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 18, padding: "0 8px", fontFamily: T.font, lineHeight: 1 }}>‹</button>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: ".01em" }}>
              {MONTHS[view.month]} {view.year}
            </div>
            <button onClick={nextMonth} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 18, padding: "0 8px", fontFamily: T.font, lineHeight: 1 }}>›</button>
          </div>

          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 6 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: T.hint, letterSpacing: ".06em", padding: "2px 0" }}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "2px 0" }}>
            {grid.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} />;

              const iso       = toISO(day);
              const isPast    = day < today;
              const isToday   = sameDay(day, today);
              const isStart   = sameDay(day, rangeStart);
              const isEnd     = sameDay(day, rangeEnd);
              const inRange   = rangeStart && rangeEnd && isBetween(day, rangeStart, rangeEnd);
              const isHovered = hovered && sameDay(day, hovered);
              const isSelected = isStart || isEnd;

              let bg = "transparent";
              let color = isPast ? T.hint : T.ink;
              let fontWeight = 400;
              let borderRadius = "8px";

              if (isSelected) {
                bg = T.accent;
                color = "#fff";
                fontWeight = 700;
              } else if (inRange) {
                bg = "rgba(201,100,66,.18)";
                color = T.ink;
                borderRadius = "0";
              } else if (isHovered && phase === "end" && rangeStart && !isPast) {
                bg = "rgba(201,100,66,.12)";
              }

              // Rounded ends of range
              if (isStart && (rangeEnd || previewEnd)) borderRadius = "8px 0 0 8px";
              if (isEnd && rangeStart) borderRadius = "0 8px 8px 0";
              if (isStart && isEnd) borderRadius = "8px";

              return (
                <div
                  key={iso}
                  onClick={() => !isPast && handleDayClick(day)}
                  onMouseEnter={() => phase === "end" && !isPast && setHovered(day)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    position: "relative", textAlign: "center", padding: "7px 0",
                    background: bg, borderRadius, cursor: isPast ? "default" : "pointer",
                    transition: "background .1s",
                  }}
                >
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 28, height: 28, borderRadius: "50%",
                    fontSize: 12.5, color, fontWeight, fontFamily: T.font,
                    border: isToday && !isSelected ? `1px solid ${T.border2}` : "none",
                  }}>
                    {day.getDate()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 11, color: T.hint }}>
              {phase === "start" ? "Pick your arrival date" : "Now pick your departure"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {(d1 || d2) && (
                <button onClick={() => { setD1(""); setD2(""); setPhase("start"); }}
                  style={{ fontSize: 11, color: T.muted, background: "none", border: "none", cursor: "pointer", fontFamily: T.font }}>
                  Clear
                </button>
              )}
              <button onClick={() => { setOpen(false); setHovered(null); }}
                style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: T.font, fontWeight: 700 }}>
                Done
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
