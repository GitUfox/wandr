/**
 * Plan quality scoring — mechanical checks on a generated itinerary.
 *
 * "Output quality" is the one spine gap with no obvious finish line, which is
 * how a prompt pass turns into endless re-tweaking. These are the defects that
 * can be judged WITHOUT taste: filler prose the prompt already bans, activities
 * that name no actual place, pace/rhythm the traveler asked for and didn't get,
 * the same venue scheduled twice, essentials dropped for optionals.
 *
 * Deliberately NOT scored: whether a venue is real (that's venue grounding —
 * needs the Places key) and whether the picks are *good* (that's Kraig's taste,
 * and a scorer that pretended to judge it would be lying).
 *
 * Pure and dependency-light so it's unit-testable, and so it could later drive
 * an in-app warning rather than living only in a dev script.
 */

import { parseTime, bucketOf } from "./utils.js";
import { paceBand } from "./constants.js";

// Phrases the plan prompt explicitly bans ("no filler phrases like 'soak in the
// views'"). Kept as a list so a violation is countable, not a vibe.
export const FILLER_PHRASES = [
  "soak in", "soak up", "immerse yourself", "immerse in", "nestled",
  "hidden gem", "bustling", "vibrant", "picturesque", "breathtaking",
  "stunning views", "charming", "quaint", "must-see", "world-class",
  "feast your eyes", "wander through", "stroll through", "take in the",
  "atmosphere is", "vibe is", "heart of the city", "something for everyone",
  "no trip is complete", "step back in time",
];

// An activity title should name a place. These are the generic stand-ins that
// show up when the model has no specific venue in mind — the same failure the
// Poul card principle names: describe a place, don't describe an activity.
const GENERIC_TITLE_PATTERNS = [
  /^(breakfast|lunch|dinner|brunch|coffee|drinks??)$/i,
  /^(free time|downtime|rest|relax|leisure|explore|wander|walk around)\b/i,
  /^(local (cafe|caf|restaurant|market|bar)|a local\b)/i,
  /^(optional|suggested|recommended)\b/i,
  /^(travel|transit|transfer|check[- ]?in|check[- ]?out|departure|arrival)\b/i,
  /^(morning|afternoon|evening|night)\b.*\b(activity|options?|free)\b/i,
];

/** A title "names a place" if it has a capitalised proper noun or a digit. */
export function namesAPlace(title) {
  if (typeof title !== "string") return false;
  const clean = title.replace(/\*\*/g, "").trim();
  if (!clean) return false;
  if (GENERIC_TITLE_PATTERNS.some(re => re.test(clean))) return false;
  // Drop the leading word (often a verb like "Visit"/"Explore") then look for a
  // capitalised token — a proper noun — anywhere in what remains.
  const tokens = clean.split(/\s+/);
  const rest = tokens.length > 1 ? tokens.slice(1) : tokens;
  return rest.some(t => /^[A-Z][A-Za-z'’\-]/.test(t) || /\d/.test(t));
}

/** Count banned filler phrases across the whole plan text. */
export function countFiller(planText) {
  const lower = String(planText || "").toLowerCase();
  const hits = [];
  for (const p of FILLER_PHRASES) {
    // Count occurrences without regex-escaping surprises.
    let idx = 0, n = 0;
    while ((idx = lower.indexOf(p, idx)) !== -1) { n++; idx += p.length; }
    if (n) hits.push({ phrase: p, count: n });
  }
  return { total: hits.reduce((s, h) => s + h.count, 0), hits };
}

// Scored against the SAME band the prompt instructs with (constants.js), so the
// scorer can never quietly disagree with what the traveler was promised.
export { paceBand };

/** Earliest acceptable first-activity time (minutes) for a rhythm. */
function rhythmExpectation(rhythm) {
  if (rhythm === "Early riser") return { maxFirstStart: 9 * 60,  label: "start by 9am" };
  if (rhythm === "Night owl")   return { minFirstStart: 10 * 60, label: "start no earlier than 10am" };
  return null;
}

/**
 * Score a parsed plan against the answers that produced it.
 * Returns { score (0-100), issues: [{code, detail}], stats }.
 * Every issue is a concrete, checkable defect — no aesthetic judgements.
 */
export function scorePlan(model, planText, answers = {}) {
  const issues = [];
  const days = model?.days || [];
  const allActs = days.flatMap(d => d.activities || []);

  // 1. Filler prose the prompt already forbids.
  const filler = countFiller(planText);
  if (filler.total > 0) {
    issues.push({
      code: "filler",
      detail: `${filler.total} banned filler phrase(s): ${filler.hits.map(h => `"${h.phrase}"×${h.count}`).join(", ")}`,
      weight: Math.min(filler.total * 3, 20),
    });
  }

  // 2. Activities that don't name an actual place.
  const generic = allActs.filter(a => !namesAPlace(a.title));
  if (generic.length) {
    issues.push({
      code: "generic-activity",
      detail: `${generic.length}/${allActs.length} activities name no specific place: ${generic.slice(0, 5).map(a => `"${a.title}"`).join(", ")}`,
      weight: Math.min(generic.length * 5, 25),
    });
  }

  // 3. Pace: activities per day vs what the traveler asked for.
  const [lo, hi] = paceBand(answers.logistics?.pace);
  const offPace = days.filter(d => (d.activities?.length || 0) < lo || (d.activities?.length || 0) > hi);
  if (offPace.length) {
    issues.push({
      code: "off-pace",
      detail: `${offPace.length}/${days.length} days outside the ${answers.logistics?.pace || "Balanced"} band (${lo}-${hi}/day): ${offPace.map(d => d.activities?.length ?? 0).join(", ")}`,
      weight: Math.min(offPace.length * 4, 16),
    });
  }

  // 4. Rhythm: does the day actually start when they said it would.
  const rx = rhythmExpectation(answers.logistics?.rhythm);
  if (rx) {
    const bad = days.filter(d => {
      const first = parseTime(d.activities?.[0]?.time);
      if (first === null) return false;
      if (rx.maxFirstStart !== undefined) return first > rx.maxFirstStart;
      if (rx.minFirstStart !== undefined) return first < rx.minFirstStart;
      return false;
    });
    if (bad.length) {
      issues.push({
        code: "off-rhythm",
        detail: `${bad.length}/${days.length} days ignore "${answers.logistics.rhythm}" (${rx.label})`,
        weight: Math.min(bad.length * 4, 16),
      });
    }
  }

  // 5. The same venue scheduled more than once.
  const seen = new Map();
  for (const a of allActs) {
    const k = String(a.title || "").replace(/\*\*/g, "").toLowerCase().trim();
    if (k) seen.set(k, (seen.get(k) || 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  if (dupes.length) {
    issues.push({
      code: "duplicate-venue",
      detail: `repeated: ${dupes.map(([k, n]) => `"${k}"×${n}`).join(", ")}`,
      weight: Math.min(dupes.length * 6, 18),
    });
  }

  // 6. Times must run forward within a day.
  const unordered = days.filter(d => {
    const mins = (d.activities || []).map(a => parseTime(a.time)).filter(m => m !== null);
    return mins.some((m, i) => i > 0 && m < mins[i - 1]);
  });
  if (unordered.length) {
    issues.push({
      code: "times-out-of-order",
      detail: `${unordered.length} day(s) have times running backwards`,
      weight: unordered.length * 5,
    });
  }

  // 7. Every day should carry its TIPS line (the prompt asks for one).
  const noTips = days.filter(d => !(d.tips || []).length);
  if (noTips.length) {
    issues.push({
      code: "missing-tips",
      detail: `${noTips.length}/${days.length} days have no TIPS line`,
      weight: Math.min(noTips.length * 2, 10),
    });
  }

  const penalty = issues.reduce((s, i) => s + i.weight, 0);
  return {
    score: Math.max(0, 100 - penalty),
    issues,
    stats: {
      days: days.length,
      activities: allActs.length,
      perDay: days.map(d => d.activities?.length || 0),
      buckets: allActs.reduce((acc, a) => {
        const b = bucketOf(a.time); acc[b] = (acc[b] || 0) + 1; return acc;
      }, {}),
    },
  };
}
