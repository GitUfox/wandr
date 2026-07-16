/**
 * Flatten an answer value to a plain string for use in prompts.
 * Handles arrays, chip+text objects, and primitives.
 */
export function arr(v) {
  if (!v) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object" && v.chips !== undefined) {
    const parts = [];
    if (v.chips.length > 0) parts.push(v.chips.join(", "));
    if (v.text && v.text.trim()) parts.push(v.text.trim());
    return parts.join(" — also: ") || "";
  }
  return String(v);
}

/**
 * Safely parse an ISO date string.
 * Returns a Date object or null — never throws, never returns Invalid Date.
 */
export function parseISODate(s) {
  if (!s || typeof s !== "string") return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Calculate trip length in nights from two ISO date strings.
 * Falls back to defaultNights if either date is missing/invalid.
 */
export function calcNights(start, end, defaultNights = 5) {
  const d1 = parseISODate(start);
  const d2 = parseISODate(end);
  if (!d1 || !d2) return defaultNights;
  return Math.max(1, Math.round((d2 - d1) / 86400000));
}

/**
 * Attempt to recover a truncated or malformed JSON string.
 * Tries to close unclosed brackets/braces before re-parsing.
 */
export function recoverJSON(raw) {
  let clean = raw.trim()
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  // First attempt — direct parse
  try { return JSON.parse(clean); } catch { /* continue */ }

  // Second attempt — close unclosed brackets
  let fixed = clean;
  let braces = 0, brackets = 0, inStr = false, esc = false;
  for (const ch of fixed) {
    if (esc) { esc = false; continue; }
    if (ch === "\\" && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") braces++;
    if (ch === "}") braces--;
    if (ch === "[") brackets++;
    if (ch === "]") brackets--;
  }
  fixed = fixed
    .replace(/,\s*"[^"]*"\s*:\s*[^,}\]]*$/, "")
    .replace(/,\s*"[^"]*"\s*$/, "")
    .replace(/,\s*\{[^}]*$/, "")
    .replace(/,\s*\[[^\]]*$/, "");
  while (brackets > 0) { fixed += "]"; brackets--; }
  while (braces > 0)   { fixed += "}"; braces--; }

  try { return JSON.parse(fixed); } catch { /* continue */ }

  // Third attempt — extract outermost JSON object
  const m = clean.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch { /* continue */ }
  }

  throw new Error("Couldn't read the trip data. You can still generate a plan below.");
}

/**
 * Parse a free-text time cell ("9:00 AM", "2 PM", "14:00") to minutes since
 * midnight. Returns null for anything without a clock time ("Morning",
 * "Evening", blank) so callers can leave those untouched.
 */
export function parseTime(str) {
  if (!str || typeof str !== "string") return null;
  const s = str.replace(/\*\*/g, "").trim().toLowerCase();
  const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const mer = m[3];
  if (mer === "pm" && hour < 12) hour += 12;
  if (mer === "am" && hour === 12) hour = 0;
  if (hour > 23 || min > 59) return null;
  return hour * 60 + min;
}

/** Format minutes-since-midnight back to a "9:00 AM" style clock string. */
export function formatTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const mer = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${mer}`;
}

/**
 * Re-time a reordered list of activities so their clock times stay ascending.
 * Reuses the day's own existing times as a sorted slot pool — position i gets
 * the i-th earliest time — so nothing is invented and the day's span is
 * preserved. Activities with non-clock times ("Morning") keep their text and
 * hold their position. Returns new activity objects (id/title/details intact).
 */
export function resequenceTimes(activities) {
  if (!Array.isArray(activities)) return activities;
  const mins = activities.map(a => parseTime(a?.time));
  const slots = mins.filter(v => v !== null).sort((x, y) => x - y);
  let s = 0;
  return activities.map((a, i) =>
    mins[i] === null ? a : { ...a, time: formatTime(slots[s++]) }
  );
}

/**
 * Extract day headers from a generated full-itinerary plan string.
 * Returns [{ index, label, pos }, ...] where label = "Day 1 — Wednesday, June 11, 2025".
 */
export function extractDayHeaders(planText) {
  if (!planText) return [];
  const re = /^## (Day \d+ — .+)$/gm;
  const results = [];
  let m;
  while ((m = re.exec(planText)) !== null) {
    results.push({ index: results.length, label: m[1], pos: m.index });
  }
  return results;
}

/**
 * Replace a single day block in a plan string with new content.
 * dayIndex is 0-based (0 = Day 1).
 * newContent should begin with the ## Day N — … header.
 */
export function spliceDayInPlan(planText, dayIndex, newContent) {
  const re = /^## Day \d+ —/gm;
  const positions = [];
  let m;
  while ((m = re.exec(planText)) !== null) positions.push(m.index);
  if (dayIndex >= positions.length) return planText;
  const start = positions[dayIndex];
  const end = dayIndex + 1 < positions.length ? positions[dayIndex + 1] : planText.length;
  return planText.slice(0, start) + newContent.trimEnd() + "\n\n" + planText.slice(end);
}
