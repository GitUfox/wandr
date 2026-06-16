/**
 * Md — Markdown renderer for Wandr plan output.
 *
 * Handles the custom TABLE/ENDTABLE and FOOD/ENDFOOD block markers that the
 * plan generation prompts produce, plus standard headings, bullet points,
 * bold text, and TIPS lines.
 */
import { T } from "../lib/constants.js";

function cleanCell(str) {
  if (!str) return "";
  return str.replace(/#+\s*/g, "").replace(/\s{2,}/g, " ").trim();
}

function boldify(str) {
  if (!str) return str;
  const cleaned = cleanCell(str);
  return cleaned.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={j} style={{ fontWeight: 700, color: T.ink }}>{p.slice(2, -2)}</strong>
      : <span key={j}>{p}</span>
  );
}

function parseTableRows(lines, maxCols) {
  return lines
    .filter(l => l.trim().startsWith("|") && !l.match(/^\|[-| :]+\|$/))
    .map(l => {
      const raw = l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      if (maxCols && raw.length > maxCols) {
        const kept = raw.slice(0, maxCols - 1);
        kept.push(raw.slice(maxCols - 1).join(" "));
        return kept;
      }
      return raw;
    });
}

function ActivityTable({ rows }) {
  const isHeader = rows[0]?.[0]?.toLowerCase() === "time";
  const dataRows = isHeader ? rows.slice(1) : rows;
  return (
    <div style={{ marginBottom: 16, overflowX: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "64px" }} />
          <col style={{ width: "30%" }} />
          <col />
        </colgroup>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.border2}` }}>
            {["Time", "Activity", "Details"].map(h => (
              <th key={h} style={{ padding: "6px 5px", textAlign: "left", fontFamily: T.font, fontSize: 9, fontWeight: 700, color: T.hint, textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? "transparent" : T.bg2 }}>
              <td style={{ padding: "8px 5px", fontFamily: T.font, fontSize: 10.5, color: T.accent, fontWeight: 700, verticalAlign: "top", wordBreak: "break-word", whiteSpace: "normal" }}>{cleanCell(row[0])}</td>
              <td style={{ padding: "8px 5px", fontFamily: T.font, fontSize: 11.5, color: T.ink, fontWeight: 600, lineHeight: 1.4, verticalAlign: "top", wordBreak: "break-word", whiteSpace: "normal" }}>{boldify(row[1])}</td>
              <td style={{ padding: "8px 5px", fontFamily: T.font, fontSize: 11, color: T.muted, lineHeight: 1.55, verticalAlign: "top", wordBreak: "break-word", whiteSpace: "normal" }}>{boldify(row[2])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FoodTable({ rows }) {
  const dataRows = rows.filter(r => r[0] && !r[0].toLowerCase().match(/^meal$/));
  return (
    <div style={{ marginBottom: 16, overflowX: "hidden" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.hint, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>Eat & Drink — suggestions only</div>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "22%" }} />
          <col style={{ width: "28%" }} />
          <col style={{ width: "38%" }} />
          <col style={{ width: "12%" }} />
        </colgroup>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.border2}` }}>
            {["Meal", "Name", "Order", "$"].map(h => (
              <th key={h} style={{ padding: "5px 5px", textAlign: "left", fontFamily: T.font, fontSize: 9, fontWeight: 700, color: T.hint, textTransform: "uppercase", letterSpacing: ".08em" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, i) => {
            const cells = [...row];
            while (cells.length < 4) cells.push("");
            const [meal, name, order, price] = cells;
            const safePrice = price && price.length < 15 ? price : "";
            return (
              <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: "7px 5px", fontFamily: T.font, fontSize: 11, color: T.muted, verticalAlign: "top", wordBreak: "break-word" }}>{cleanCell(meal)}</td>
                <td style={{ padding: "7px 5px", fontFamily: T.font, fontSize: 11.5, color: T.ink, fontWeight: 600, verticalAlign: "top", wordBreak: "break-word" }}>{boldify(name)}</td>
                <td style={{ padding: "7px 5px", fontFamily: T.font, fontSize: 11, color: T.muted, verticalAlign: "top", wordBreak: "break-word" }}>{cleanCell(order)}</td>
                <td style={{ padding: "7px 5px", fontFamily: T.font, fontSize: 11, color: T.accent, fontWeight: 600, verticalAlign: "top", whiteSpace: "nowrap" }}>{safePrice}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GenericTable({ rows }) {
  if (rows.length === 0) return null;
  const isHeader = rows[0]?.some(c => c.match(/^[A-Z]/));
  const headers  = isHeader ? rows[0] : null;
  const dataRows = isHeader ? rows.slice(1) : rows;
  return (
    <div style={{ marginBottom: 16, overflowX: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        {headers && (
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border2}` }}>
              {headers.map((h, i) => <th key={i} style={{ padding: "6px 6px", textAlign: "left", fontFamily: T.font, fontSize: 9, fontWeight: 700, color: T.hint, textTransform: "uppercase", letterSpacing: ".08em" }}>{h}</th>)}
            </tr>
          </thead>
        )}
        <tbody>
          {dataRows.map((row, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? "transparent" : T.bg2 }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: "7px 6px", fontFamily: T.font, fontSize: 11, color: j === 0 ? T.ink : T.muted, fontWeight: j === 0 ? 600 : 400, lineHeight: 1.5, verticalAlign: "top", wordBreak: "break-word", whiteSpace: "normal" }}>{boldify(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SKIP_LINES = new Set(["ENDTABLE", "ENDFOOD", "TABLE:", "FOOD:", "---", "–––", "***"]);

export default function Md({ text }) {
  if (!text) return null;

  // Parse text into typed segments
  const segments = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line    = lines[i];
    const trimmed = line.trim();

    if (SKIP_LINES.has(trimmed) || trimmed.match(/^-{3,}$/) || trimmed.match(/^\*{3,}$/)) {
      i++; continue;
    }
    if (trimmed === "TABLE:") {
      const tableLines = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "ENDTABLE") { tableLines.push(lines[i]); i++; }
      i++;
      segments.push({ type: "table", lines: tableLines });
      continue;
    }
    if (trimmed === "FOOD:") {
      const foodLines = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "ENDFOOD") { foodLines.push(lines[i]); i++; }
      i++;
      segments.push({ type: "food", lines: foodLines });
      continue;
    }
    if (trimmed.startsWith("TIPS:")) {
      const tips = trimmed.replace("TIPS:", "").split("|").map(t => t.trim()).filter(Boolean);
      segments.push({ type: "tips", tips });
      i++; continue;
    }
    if (trimmed.startsWith("|") && !trimmed.match(/^\|[-| :]+\|$/)) {
      const tableLines = [];
      while (i < lines.length && (lines[i].trim().startsWith("|") || lines[i].trim().match(/^\|[-| :]+\|$/))) {
        tableLines.push(lines[i]); i++;
      }
      segments.push({ type: "generic", lines: tableLines });
      continue;
    }
    segments.push({ type: "text", line });
    i++;
  }

  return (
    <div style={{ fontFamily: T.font }}>
      {segments.map((seg, idx) => {
        if (seg.type === "table")   return <ActivityTable key={idx} rows={parseTableRows(seg.lines, 3)} />;
        if (seg.type === "food")    return <FoodTable     key={idx} rows={parseTableRows(seg.lines, 4)} />;
        if (seg.type === "generic") {
          const generic = parseTableRows(seg.lines);
          // A Time/Activity/Details table rendered as plain markdown should
          // still get the activity-table column widths, not equal thirds.
          if (generic[0]?.[0]?.toLowerCase() === "time")
            return <ActivityTable key={idx} rows={parseTableRows(seg.lines, 3)} />;
          return <GenericTable key={idx} rows={generic} />;
        }
        if (seg.type === "tips") return (
          <div key={idx} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {seg.tips.map((tip, ti) => (
              <div key={ti} style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 10px", fontSize: 11.5, color: T.muted, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width:4, height:4, borderRadius:"50%", background:T.accent, display:"inline-block", flexShrink:0 }} /> {tip}
              </div>
            ))}
          </div>
        );

        const line = seg.line;
        if (!line) return null;
        if (line.startsWith("## "))  return <div key={idx} style={{ fontSize: 15, fontWeight: 800, color: T.ink, margin: "1.4rem 0 .75rem", paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>{line.slice(3).replace(/^[,\s]+/, "")}</div>;
        if (line.startsWith("### ")) return <div key={idx} style={{ fontSize: 12, fontWeight: 700, color: T.accent, margin: ".75rem 0 .3rem", textTransform: "uppercase", letterSpacing: ".06em" }}>{line.slice(4).replace(/^[,\s]+/, "")}</div>;
        if (line.startsWith("# "))   return <div key={idx} style={{ fontSize: 18, fontWeight: 800, color: T.ink, margin: "0 0 .75rem" }}>{line.slice(2)}</div>;
        if (line.match(/^[-•]\s/)) return (
          <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "flex-start" }}>
            <span style={{ color: T.accent, flexShrink: 0, fontSize: 12, marginTop: 2 }}>›</span>
            <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>{boldify(line.replace(/^[-•]\s/, ""))}</div>
          </div>
        );
        if (!line.trim()) return <div key={idx} style={{ height: 4 }} />;
        return <div key={idx} style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.7, marginBottom: 2 }}>{boldify(line)}</div>;
      })}
    </div>
  );
}
