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
 * Format an ISO date ("2026-08-02") as a short, friendly label ("Sun, Aug 2").
 * Returns the raw input unchanged if it isn't a valid date.
 */
export function formatShortDate(iso) {
  const d = parseISODate(iso);
  if (!d) return iso || "";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // parseISODate builds the Date at local midnight, so local getters return
  // the intended calendar day (UTC getters would drift by the tz offset).
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Time-of-day buckets for the alternate itinerary view. Morning < 12pm,
 * Afternoon 12–5pm, Evening ≥ 5pm. Anchors are the default clock time an
 * activity gets when it's moved into an otherwise-empty bucket.
 */
export const BUCKETS = ["Morning", "Afternoon", "Evening"];
const BUCKET_ANCHOR = { Morning: 540, Afternoon: 780, Evening: 1080 }; // 9am / 1pm / 6pm

/** Which time-of-day bucket an activity's time falls in. Falls back to keyword
 *  matching for non-clock times ("dinner" → Evening), else Morning. */
export function bucketOf(time) {
  const min = parseTime(time);
  if (min !== null) {
    if (min < 720)  return "Morning";
    if (min < 1020) return "Afternoon";
    return "Evening";
  }
  const s = (time || "").toLowerCase();
  if (s.includes("morning")) return "Morning";
  if (s.includes("afternoon") || s.includes("noon") || s.includes("lunch")) return "Afternoon";
  if (s.includes("evening") || s.includes("night") || s.includes("dinner")) return "Evening";
  return "Morning";
}

/** Sort key for a time — its parsed minutes, or its bucket's anchor when the
 *  time is non-clock text, so free-text activities still sort into the right region. */
export function timeSortKey(time) {
  const min = parseTime(time);
  return min !== null ? min : BUCKET_ANCHOR[bucketOf(time)];
}

/** Sort a day's activities ascending by time (stable — equal times keep order). */
export function sortDayByTime(activities) {
  if (!Array.isArray(activities)) return activities;
  return [...activities].sort((a, b) => timeSortKey(a?.time) - timeSortKey(b?.time));
}

/**
 * Pick a clock time for an activity being moved into a bucket: the bucket's
 * anchor if it's empty, else 60min after the bucket's current latest activity
 * (capped at 11:59pm) so the newcomer lands after what's already there.
 */
export function retimeIntoBucket(bucket, bucketActivities) {
  const anchor = BUCKET_ANCHOR[bucket];
  const existing = (bucketActivities || []).map(a => parseTime(a?.time)).filter(v => v !== null);
  const min = existing.length ? Math.min(1439, Math.max(anchor, Math.max(...existing) + 60)) : anchor;
  return formatTime(min);
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
