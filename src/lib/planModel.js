/**
 * planModel — structured model for an editable itinerary.
 *
 * The plan is generated (and streamed) as markdown using the custom
 * TABLE/ENDTABLE + FOOD/ENDFOOD + TIPS markers (see prompts.js / Md.jsx).
 * That string stays the source of truth during streaming. The moment a plan
 * is complete, `parsePlan` turns it into a structured model so the UI can
 * treat each activity as a discrete, movable block. `serializePlan` turns the
 * model back into the exact same marker format for rendering, copy, and print.
 *
 * Invariant (see planModel.test.js): parse → serialize → parse is stable.
 * Editing the model can therefore never silently corrupt the itinerary —
 * any change round-trips back to valid markdown.
 *
 * The parser is deliberately tolerant: any `## ` line starts a new
 * day/section (so it also handles single-day and themed modes), and any
 * content it doesn't recognise inside a day is preserved verbatim in
 * `extras` so nothing is ever dropped.
 */

let _idCounter = 0;
function nextId() {
  _idCounter += 1;
  return `act-${_idCounter}`;
}

const DAY_HEADER = /^##\s+(.+?)\s*$/;
const SEP_ROW = /^\|[-| :]+\|$/;

/** Split markdown table lines into trimmed cell arrays, capping at maxCols. */
function parseRows(lines, maxCols) {
  return lines
    .filter(l => l.trim().startsWith("|") && !SEP_ROW.test(l.trim()))
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

function pad(arr, n) {
  const out = [...arr];
  while (out.length < n) out.push("");
  return out;
}

/**
 * Parse a generated itinerary string into a structured model.
 * Returns { intro, days: [{ label, activities, food, tips, extras }] }.
 *   activities — [{ id, time, title, details }]
 *   food       — [{ meal, name, order, price }]
 *   tips       — [string]
 *   extras     — [string]  (raw lines we didn't recognise, preserved)
 */
export function parsePlan(text) {
  const model = { intro: "", days: [] };
  if (!text || !text.trim()) return model;

  const lines = text.split("\n");
  const introLines = [];
  let day = null;
  let i = 0;

  const startDay = label => {
    day = { label, activities: [], food: [], tips: [], extras: [] };
    model.days.push(day);
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const header = trimmed.match(DAY_HEADER);

    if (header) {
      startDay(header[1].replace(/^[,\s]+/, ""));
      i++;
      continue;
    }

    // Before the first day header: collect as intro.
    if (!day) {
      if (trimmed) introLines.push(line);
      i++;
      continue;
    }

    if (trimmed === "TABLE:") {
      const block = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "ENDTABLE") { block.push(lines[i]); i++; }
      i++; // skip ENDTABLE
      const rows = parseRows(block, 3);
      const dataRows = rows[0]?.[0]?.toLowerCase() === "time" ? rows.slice(1) : rows;
      for (const r of dataRows) {
        const [time, title, details] = pad(r, 3);
        day.activities.push({ id: nextId(), time, title, details });
      }
      continue;
    }

    if (trimmed === "FOOD:") {
      const block = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "ENDFOOD") { block.push(lines[i]); i++; }
      i++; // skip ENDFOOD
      const rows = parseRows(block, 4);
      const dataRows = rows[0]?.[0]?.toLowerCase() === "meal" ? rows.slice(1) : rows;
      for (const r of dataRows) {
        const [meal, name, order, price] = pad(r, 4);
        day.food.push({ meal, name, order, price });
      }
      continue;
    }

    if (trimmed.startsWith("TIPS:")) {
      day.tips = trimmed.slice(5).split("|").map(t => t.trim()).filter(Boolean);
      i++;
      continue;
    }

    // Unrecognised non-empty content inside a day — preserve it verbatim.
    if (trimmed) day.extras.push(line);
    i++;
  }

  model.intro = introLines.join("\n").trim();
  return model;
}

const TABLE_HEADER = "| Time | Activity | Details |\n|------|----------|----------|";
const FOOD_HEADER = "| Meal | Name | Order | Price |\n|------|------|-------|-------|";

/** Serialize a structured model back into the TABLE/FOOD/TIPS marker format. */
export function serializePlan(model) {
  if (!model || !model.days) return "";
  const blocks = [];
  if (model.intro && model.intro.trim()) blocks.push(model.intro.trim());

  for (const day of model.days) {
    const parts = [`## ${day.label}`];

    if (day.activities?.length) {
      const rows = day.activities
        .map(a => `| ${a.time} | ${a.title} | ${a.details} |`)
        .join("\n");
      parts.push(`TABLE:\n${TABLE_HEADER}\n${rows}\nENDTABLE`);
    }

    if (day.food?.length) {
      const rows = day.food
        .map(f => `| ${f.meal} | ${f.name} | ${f.order} | ${f.price} |`)
        .join("\n");
      parts.push(`FOOD:\n${FOOD_HEADER}\n${rows}\nENDFOOD`);
    }

    if (day.tips?.length) parts.push(`TIPS: ${day.tips.join(" | ")}`);
    if (day.extras?.length) parts.push(day.extras.join("\n"));

    blocks.push(parts.join("\n\n"));
  }

  return blocks.join("\n\n") + "\n";
}

/** Total activity count across all days — handy for the UI. */
export function activityCount(model) {
  return (model?.days || []).reduce((sum, d) => sum + (d.activities?.length || 0), 0);
}
