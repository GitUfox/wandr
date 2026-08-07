import { getTimeFormat } from "./settings.js";

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

/**
 * Format minutes-since-midnight per the user's time-format setting —
 * "17:30" (default) or "5:30 PM". This is the single branch point the
 * 2026-07-29 backlog note reserved: prompts still request HH:MM from the
 * model, and parseTime accepts both forms forever, so plans saved under
 * either setting stay readable.
 */
export function formatTime(mins) {
  const h24 = Math.floor(mins / 60);
  const m = String(mins % 60).padStart(2, "0");
  if (getTimeFormat() === "12h") {
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${m} ${h24 >= 12 ? "PM" : "AM"}`;
  }
  return `${String(h24).padStart(2, "0")}:${m}`;
}

/**
 * Re-express a stored time string in the active display format. Stored plans
 * keep whatever format they were written with ("17:30", legacy "5:30 PM") —
 * this converts at render time only. Non-clock strings ("Morning") pass
 * through untouched.
 */
export function displayTime(str) {
  const min = parseTime(str);
  return min === null ? str : formatTime(min);
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
 * Format an ISO date as a boarding-pass stub label ("JUN 30").
 * Returns "" if it isn't a valid date — callers hide the row.
 */
export function ticketDate(iso) {
  const d = parseISODate(iso);
  if (!d) return "";
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Short season label derived from the trip's start date ("Late June").
 * Day 1–10 = Early, 11–20 = Mid, 21+ = Late. "" when the date is invalid,
 * so the ticket stub simply drops the Season column.
 */
export function seasonShort(iso) {
  const d = parseISODate(iso);
  if (!d) return "";
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const part = d.getDate() <= 10 ? "Early" : d.getDate() <= 20 ? "Mid" : "Late";
  return `${part} ${months[d.getMonth()]}`;
}

/**
 * Human relative timestamp for the itinerary status row ("just now",
 * "12 min ago", "3 hr ago", then a date). `now` injectable for tests.
 */
export function timeAgo(ts, now = Date.now()) {
  if (!ts || typeof ts !== "number") return "";
  const s = Math.round((now - ts) / 1000);
  if (s < 90) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = new Date(ts);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Every activity title in a plan — the bold cell of each table row.
 * Feeds the "Surprise me" avoid-list so a remix can't rebuild the same trip.
 */
export function extractActivityTitles(planText) {
  const titles = [];
  for (const line of (planText || "").split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|") || t.match(/^\|[-| :]+\|$/)) continue;
    const cells = t.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
    const title = (cells[1] || "").replace(/\*\*/g, "").trim();
    if (title && title.toLowerCase() !== "activity" && !titles.includes(title)) titles.push(title);
  }
  return titles;
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

// ── Activity details micro-grammar (design pick 4A + 4C bridge) ──────────────
//
// Generated plans write the Details cell as one sentence followed by fact
// tokens separated by " · ":  "Moorish citadel over Alfama. · ~€15 · 2h ·
// opens 09:00 · book ahead".  splitDetails() is RENDER-TIME ONLY: the stored
// string is the contract (parse↔serialize invariant, copy, PDF, sync all
// carry it verbatim) and nothing here ever writes back.
//
// Legacy plans have no separator — the 4C bridge derives fact-looking
// fragments from the prose instead. The prose keeps them too (redundancy
// accepted): a regex can miss, so the sentence must stay complete.

const FACT_KINDS = [
  { kind: "cost",     re: /(?:[€$£¥₺]|\bUSD\b|\bEUR\b|\bkr\b)\s?\d|\bfree\b/i },
  { kind: "duration", re: /^~?\s*\d+(?:[.,]\d+)?(?:\s?[–-]\s?\d+(?:[.,]\d+)?)?\s?(?:h(?:ours?|rs?)?|min(?:utes?|s)?)\b/i },
  { kind: "hours",    re: /\b(?:opens?|closes?|closed|open|until|last entry|daily)\b/i },
  { kind: "booking",  re: /\b(?:book|reserve|reservation|pre-?book|tickets? online)\b/i },
];

/** Which chip family a fact token belongs to — drives the glyph. */
export function classifyFact(text) {
  // Negated tokens ("no booking needed") must not light up as a hot booking
  // chip — the prompt tells the model to omit them, but a model that pads
  // anyway should degrade to a quiet note, not a false call-to-action.
  if (/^no\b/i.test(String(text).trim())) return "note";
  for (const { kind, re } of FACT_KINDS) if (re.test(text)) return kind;
  return "note";
}

const MAX_FACTS = 5; // bound the chip row — anything past this stays prose-only

/**
 * Split a Details string into { desc, facts:[{kind,text}] } for rendering.
 * Grammar plans split on " · "; legacy prose falls through to derivation.
 */
export function splitDetails(details) {
  const raw = String(details || "").replace(/\*\*/g, "").trim();
  if (!raw) return { desc: "", facts: [] };

  if (raw.includes(" · ")) {
    const parts = raw.split(" · ").map(s => s.trim()).filter(Boolean);
    const desc = parts.shift() || "";
    return {
      desc,
      facts: parts.slice(0, MAX_FACTS).map(t => ({ kind: classifyFact(t), text: t })),
    };
  }

  // 4C bridge — derive chips from legacy prose; desc stays the full sentence.
  const facts = [];
  const cost = raw.match(/~?\s?(?:[€$£¥₺]\s?\d+(?:[.,]\d+)?(?:\s?[–-]\s?\d+(?:[.,]\d+)?)?)|\bfree entry\b/i);
  if (cost) facts.push({ kind: "cost", text: cost[0].replace(/\s+/g, " ").trim() });
  const dur = raw.match(/\b\d+(?:[.,]\d+)?(?:\s?[–-]\s?\d+(?:[.,]\d+)?)?\s?(?:hours?|hrs?|h\b|minutes?|mins?)\b/i);
  if (dur) facts.push({ kind: "duration", text: dur[0].trim() });
  const hrs = raw.match(/\b(?:opens?|closes?|open)\s(?:at\s|daily\s)?\d{1,2}[:h.]?\d{0,2}(?:\s?[–-]\s?\d{1,2}[:h.]?\d{0,2})?/i);
  if (hrs) facts.push({ kind: "hours", text: hrs[0].trim() });
  if (/\b(?:book(?:ing)?\s?(?:ahead|online|in advance)|pre-?book|tickets? online|reservations? (?:required|recommended|essential))\b/i.test(raw)) {
    facts.push({ kind: "booking", text: "book ahead" });
  }
  return { desc: raw, facts };
}

// Words too generic to identify a venue — a tip saying "the museum" or "the
// park" must not attach to whichever activity happens to contain that word.
// City names can't be enumerated here; per-day scoping (a tip only competes
// against ITS day's 3-6 titles) is what keeps those from cross-matching.
const TIP_STOPWORDS = new Set([
  "with", "this", "that", "from", "tour", "walk", "walking", "park", "parks",
  "state", "street", "historic", "historical", "national", "district",
  "neighborhood", "avenue", "museum", "market", "library", "trail", "trails",
  "waterfront", "company", "brewing", "brewery", "point", "area", "game",
]);

const tokens = (s) =>
  String(s || "").toLowerCase().replace(/\*\*/g, "").replace(/[’']s\b/g, "")
    .split(/[^a-z0-9]+/).filter(w => w.length >= 4);

/**
 * Which of a day's activities does this tip belong to? (§15.6, design pick 2B)
 * Scores each title by distinctive-token overlap with the tip — prefix-tolerant
 * ("kayak" ↔ "Kayaking") — and returns the best index, or -1 when no title
 * scores. -1 is a fine answer: unmatched tips render in the day-level
 * "Before you go" block instead, so nothing is ever dropped.
 */
export function matchTipToActivity(tip, titles) {
  const tipWords = tokens(tip);
  if (!tipWords.length) return -1;
  let best = -1, bestScore = 0;
  (titles || []).forEach((title, i) => {
    const titleToks = tokens(title).filter(t => !TIP_STOPWORDS.has(t));
    let score = 0;
    for (const t of titleToks) {
      if (tipWords.some(w => w === t || w.startsWith(t) || t.startsWith(w))) score++;
    }
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return bestScore >= 1 ? best : -1;
}
