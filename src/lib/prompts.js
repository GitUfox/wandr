import { arr, calcNights, parseISODate } from "./utils.js";
import { paceBand, INTERESTS_GROUPS } from "./constants.js";

// ── Activity priority helpers ───────────────────────────────────────────────
// Each built activity carries a "priority" tier (essential | recommended |
// optional) assigned during the trip-build ranking step. The plan prompts
// surface these so the itinerary schedules must-dos first and treats optionals
// as spare-capacity filler. Trips built before ranking existed have no priority
// field — those default to "recommended" so behaviour degrades gracefully
// (nothing is wrongly promoted or demoted).

const PRIORITY_RANK = { essential: 0, recommended: 1, optional: 2 };

// Trips built before food was removed from the schema may still carry these
// keys in localStorage. Excluded here so a resumed legacy trip never leaks
// old meal recs back in as generic "activities".
const LEGACY_FOOD_BINS = ["breakfast", "lunch", "dinner"];

function normalizePriority(p) {
  const v = String(p ?? "").toLowerCase().trim();
  return v === "essential" || v === "optional" ? v : "recommended";
}

// Flatten categories into a priority-tagged, essentials-first list.
function formatActivityItems(categories) {
  return Object.entries(categories || {})
    .filter(([cat]) => !LEGACY_FOOD_BINS.includes(cat))
    .flatMap(([cat, items]) =>
      (Array.isArray(items) ? items : []).map(it => ({ cat, it, prio: normalizePriority(it.priority) }))
    )
    .sort((a, b) => PRIORITY_RANK[a.prio] - PRIORITY_RANK[b.prio])
    .map(({ cat, it, prio }) =>
      `[${cat.toUpperCase()} · ${prio.toUpperCase()}] ${it.name}: ${it.description}${it.proTip ? ` | TIP: ${it.proTip}` : ""}`
    )
    .join("\n");
}

// Resolve what the traveler wants to avoid into a single instruction string.
// Sources, combined: the free-text "avoid" field (answers.avoid, new) and any
// legacy avoidChips from older trips (answers.interests.avoidChips). Returns
// "nothing" when neither is set so the AVOID instruction degrades cleanly.
function resolveAvoid(a) {
  const chips = Array.isArray(a.interests?.avoidChips) ? a.interests.avoidChips.join(", ") : "";
  const free  = typeof a.avoid === "string" ? a.avoid.trim() : "";
  return [chips, free].filter(Boolean).join(", ") || "nothing";
}

// ── Shared instruction builders ────────────────────────────────────────────────

function partyInstruction(a) {
  const chip = Array.isArray(a.party?.chips) ? a.party.chips[0] : arr(a.party);
  const extra = a.party?.text?.trim() ? ` Additional context: ${a.party.text.trim()}.` : "";
  const rules = {
    "Solo":
      "Traveler is solo. Prioritise activities that work comfortably alone — self-guided walks, museums, low-key solo-friendly experiences. Avoid awkward solo situations. Flag anything that's notably better with a companion.",
    "Couple":
      "Traveling as a couple. Lean romantic and intimate — shared experiences, quieter neighbourhoods over crowded tourist spots. Avoid large group-tour style activities.",
    "Friends":
      "Small group of friends. Prioritise social, shareable activities — group-friendly venues, experiences that generate shared memories. Energy and atmosphere matter.",
    "Group":
      "Larger group. Venues must accommodate groups — flag reservation requirements. Activities should be group-bookable. Communal, high-energy experiences.",
    "Family":
      "Family trip. All activity selections must be family-appropriate. Include child-friendly timing (morning activities, manageable pacing). Exclude nightlife, late-night venues, and adult-only experiences entirely.",
  };
  return (rules[chip] || `Tailor all selections to this group: ${arr(a.party)}.`) + extra;
}

function transportInstruction(transportLine) {
  const t = transportLine.toLowerCase();
  if (t.includes("walk") || t.includes("cycl"))
    return "Traveler is walking or cycling. Keep all same-day activities geographically tight — within walkable distance or short hops. Never suggest a location that requires a car or long transit.";
  if (t.includes("public") || t.includes("transit") || t.includes("rideshare") || t.includes("taxi"))
    return "Traveler is using public transit or rideshare. Ensure all activities are near transit stops. Group same-day activities along logical transit corridors. No driving-only outlying venues unless clearly worth the trip.";
  if (t.includes("car") || t.includes("rent") || t.includes("own") || t.includes("scoot") || t.includes("moto"))
    return "Traveler has personal transport. Outlying locations and driving excursions are fine — include them where they're worthwhile. Add parking or access notes where relevant.";
  return `Activities must be reachable by the traveler's transport: ${transportLine}.`;
}

function budgetInstruction(budget) {
  if (budget === 0)
    return "Staying with family/friends — no accommodation cost. Focus on free and low-cost activities. Flag any paid options as optional splurges.";
  if (budget <= 60)
    return "Low budget (~$30–50/day). Markets, free sights, budget-friendly experiences. Skip paid attractions where free alternatives exist.";
  if (budget <= 150)
    return "Comfortable budget (~$75–120/day). Standard paid attractions and experiences. Occasional premium experience is fine.";
  if (budget <= 300)
    return "Higher budget (~$200+/day). Quality, premium experiences. Skip budget-only options.";
  return "Luxury budget (~$450+/day). High-end throughout — private experiences, exclusive venues, top-tier access.";
}

function paceInstruction(pace) {
  const [lo, hi] = paceBand(pace);
  if (pace === "Slow")
    return `Set a relaxed pace — ${lo}\u2013${hi} activities per day with breathing room. Long lunches, spontaneous wandering, and quiet time are part of the plan.`;
  if (pace === "Fast")
    return `High-energy itinerary — ${lo}\u2013${hi} activities per day, efficient routing, minimal downtime. The traveler would rather be tired than bored.`;
  return `Balanced pace — ${lo}\u2013${hi} activities per day, mix of planned and unstructured time.`;
}

// Daily rhythm — when the day starts/ends, distinct from pace (how much per day).
// "Flexible" returns "" so no instruction is injected.
function rhythmInstruction(rhythm) {
  if (rhythm === "Early riser")
    return "Traveler is an early riser. Start days earlier (7–8am activities are welcome) and wind down evenings sooner — avoid stacking late-night activities as the plan's finale.";
  if (rhythm === "Night owl")
    return "Traveler is a night owl. Mornings can start later (skip early-AM activities); lean into evening and nightlife options where they match the traveler's interests.";
  return "";
}

function focusInstruction(dest, focus) {
  if (focus === "Famous sights")
    return `Traveler wants the famous sights of ${dest} — the iconic must-sees and classics that define the destination. Lead with these; treat hidden gems as secondary.`;
  if (focus === "Hidden gems")
    return `Traveler wants hidden gems in ${dest}. Deprioritise obvious tourist landmarks. Prioritise neighbourhood spots, local-only finds, and experiences most visitors miss.`;
  if (focus === "Mix of both")
    return `Traveler wants a mix in ${dest} — pair the essential iconic sights with local discoveries so the trip covers both the classics and the off-the-radar finds.`;
  return "";
}

function kidsInstruction(kids) {
  if (!kids || kids === "No kids") return "";
  const map = {
    "Under 5":  "Toddlers in the group (under 5). Stroller-accessible venues only. Short activity blocks. Nap-schedule-friendly timing. Avoid long waits and loud venues.",
    "5 to 12":  "School-age kids (5–12). Hands-on and interactive experiences. Keep pace manageable.",
    "Teens":    "Teenagers in the group. Skip anything 'too young'. Include culture and independence-friendly spots. Energy matters more than educational value.",
  };
  return map[kids] || "";
}

function stayInstruction(stayLine) {
  if (!stayLine || stayLine === "not specified")
    return "Group same-day activities geographically to minimise unnecessary travel.";
  return `Traveler is staying: "${stayLine}". Cluster each day's activities near this area or along a logical route from it. Minimise dead travel time within a single day. Reference this neighbourhood where relevant for nearby options.`;
}

// ── Traveler context — single source of truth ────────────────────────────────
//
// Every prompt builder derives its traveler values from here. Before this
// existed the same extraction-and-defaulting block was repeated in
// tripContext(), buildEditDayPrompt(), buildTweakActivityPrompt(), and
// buildPlanPrompt() — so each new answer field (rhythm, then priorityChips)
// was a 4× touch, and stay/transport had already drifted into two different
// default representations. Adding a field is now one edit here, plus one line
// at each site that should actually print it.

function travelerContext(a) {
  const stayLine      = a.logistics?.stay || "not specified";
  // An empty transport array is truthy, so arr() can legitimately yield "" —
  // the trailing || is what makes "no chips selected" read as "not specified"
  // in every prompt. Previously it read as blank in the trip-build prompt and
  // "not specified" in the plan prompts.
  const transportLine = (a.logistics?.transport ? arr(a.logistics.transport) : "") || "not specified";
  const pace          = a.logistics?.pace   || "";
  const focus         = a.logistics?.focus  || "";
  const rhythm        = a.logistics?.rhythm || "";
  const kidsVal       = a.party?.kids       || "";
  const priorityLine  = arr(a.interests?.priorityChips);

  return {
    stayLine, transportLine, pace, focus, rhythm, kidsVal, priorityLine,
    partyLine:     arr(a.party),
    interestsLine: arr(a.interests),
    avoidLine:     resolveAvoid(a),

    // Two intentionally different budget phrasings — verbose for the trip-DB
    // context header, compact for the TRAVELER blocks. Not drift; keep both.
    budgetVerbose: a.budget === 0
      ? "Staying with family/friends — no accommodation cost"
      : `approx. USD ${a.budget}/day per person`,
    budgetLabel:   a.budget === 0 ? "staying with family/friends" : `~${a.budget} USD/day`,

    // Conditional fragments reused verbatim across builders.
    kidsSuffix:     kidsVal ? ` · Kids: ${kidsVal}` : "",
    prioritySuffix: priorityLine ? ` · priority: ${priorityLine}` : "",

    // Instruction texts.
    partyText:     partyInstruction(a),
    stayText:      stayInstruction(stayLine),
    transportText: transportInstruction(transportLine),
    budgetText:    budgetInstruction(a.budget),
    paceText:      pace    ? paceInstruction(pace)                  : "",
    focusText:     focus   ? focusInstruction(a.destination, focus) : "",
    rhythmText:    rhythm  ? rhythmInstruction(rhythm)              : "",
    kidsText:      kidsVal ? kidsInstruction(kidsVal)               : "",
  };
}

// The TRAVELER summary block shared by buildEditDayPrompt and buildPlanPrompt.
// buildPlanPrompt appends its own Notes/Season lines.
function travelerBlock(a, c) {
  return `TRAVELER
- Destination: ${a.destination}
- Party: ${c.partyLine}${c.kidsSuffix}
- Budget: ${c.budgetLabel}
- Staying: ${c.stayLine}
- Transport: ${c.transportLine}${c.pace ? `\n- Pace: ${c.pace}` : ""}${c.focus ? `\n- Focus: ${c.focus}` : ""}${c.rhythm ? `\n- Rhythm: ${c.rhythm}` : ""}
- Interests: ${c.interestsLine}${c.prioritySuffix}
- Avoid: ${c.avoidLine}`;
}

function buildDayLabels(startISO, nights) {
  const start = parseISODate(startISO);
  if (!start || !nights) return [];
  return Array.from({ length: nights }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  });
}

// ── Build trip database prompt ─────────────────────────────────────────────────

// ── Schema fragments ────────────────────────────────────────────────────────
//
// The trip database is built in two parallel calls so each finishes well under
// Vercel's 60s function limit (the single combined call generates >60s of JSON
// and gets killed mid-stream). CATEGORIES_SCHEMA is the heavy half (~44s);
// META_SCHEMA is the lighter half (~23s). useBuildTrip runs both concurrently
// and merges. FULL_SCHEMA is kept for buildTripPrompt (tests / single-call use).

// Nightlife is INTEREST-GATED (§8). The generic "omit categories with no match"
// instruction was too soft to rely on: a Scottsdale traveler who picked
// Golf/Hiking/ATV/Museums still got a wine bar scheduled — twice. Asking for the
// category at all is enough to get it filled, so the strict gate is to leave the
// key out of the requested schema entirely.
const NIGHTLIFE_TAGS =
  INTERESTS_GROUPS.find(g => g.label === "Nightlife")?.opts || [];

export function wantsNightlife(a) {
  const chips = a?.interests?.chips;
  if (!Array.isArray(chips)) return false;
  return chips.some(c => NIGHTLIFE_TAGS.includes(c));
}

const NIGHTLIFE_LINE =
`"nightlife":[{"name":"","description":"","vibe":"","proTip":"","priority":"essential|recommended|optional"}],
`;

const categoriesBody = (nightlife) =>
`"categories":{
"nature":[{"name":"","description":"","duration":"","difficulty":"","proTip":"","priority":"essential|recommended|optional"}],
"culture":[{"name":"","description":"","duration":"","admission":"","proTip":"","priority":"essential|recommended|optional"}],
${nightlife ? NIGHTLIFE_LINE : ""}"exploration":[{"name":"","description":"","bestTime":"","proTip":"","priority":"essential|recommended|optional"}],
"experiences":[{"name":"","description":"","duration":"","price":"","bookAhead":true,"proTip":"","priority":"essential|recommended|optional"}]
}`;

const META_BODY = (n) =>
`"destination":"City, Country","tagline":"8-word trip description","nights":${n},"season":"one sentence","highlights":["h1","h2","h3"]`;

const CATEGORIES_SCHEMA      = (nl) => `{${categoriesBody(nl)}}`;
const META_SCHEMA            = (n) => `{${META_BODY(n)}}`;
const FULL_SCHEMA            = (n, nl) => `{${META_BODY(n)},\n${categoriesBody(nl)}}`;

/**
 * Build the shared instruction context (everything except the JSON schema)
 * plus the image blocks and computed dates. Used by every trip-build variant.
 */
function tripContext(answers, uploadedFiles) {
  const a = answers;
  const c = travelerContext(a);
  const d1 = parseISODate(a.dates?.start);
  const d2 = parseISODate(a.dates?.end);
  const n  = calcNights(a.dates?.start, a.dates?.end);

  const safeStart = (d1 ? d1.toISOString().slice(0, 10) : a.dates?.start) || "?";
  const safeEnd   = (d2 ? d2.toISOString().slice(0, 10) : a.dates?.end)   || "?";

  const textFileContext = (uploadedFiles || [])
    .filter(f => !f.isImage)
    .map(f => `--- FILE: ${f.name} ---\n${f.content}`)
    .join("\n\n");

  const imageBlocks = (uploadedFiles || [])
    .filter(f => f.isImage)
    .map(f => ({ type: "image", source: { type: "base64", media_type: f.type, data: f.content } }));

  const contextText = `Return ONLY a valid JSON object. No markdown, no explanation, nothing else.

DESTINATION: ${a.destination}
DATES: ${safeStart} → ${safeEnd} (${n} nights)
PARTY: ${c.partyLine}${c.kidsSuffix}
STAYING: ${c.stayLine}
TRANSPORT: ${c.transportLine}
BUDGET: ${c.budgetVerbose}
INTERESTS (listed most-important-first): ${c.interestsLine}
PRIORITY INTERESTS (resolve any conflict in favour of these over other interests): ${c.priorityLine || "none specified — use the interests order above as priority"}
AVOID: ${c.avoidLine}
NOTES: ${a.notes || "none"}${c.pace ? `\nPACE: ${c.pace}` : ""}${c.focus ? `\nFOCUS: ${c.focus}` : ""}${c.rhythm ? `\nRHYTHM: ${c.rhythm}` : ""}
${textFileContext ? `\nUPLOADED CONTEXT:\n${textFileContext}` : ""}

INSTRUCTIONS — apply these to every selection you make:

PARTY: ${c.partyText}

LOCATION: ${c.stayText}

TRANSPORT: ${c.transportText}

BUDGET: ${c.budgetText}
${c.paceText ? `\nPACE: ${c.paceText}` : ""}
${c.focusText ? `FOCUS: ${c.focusText}` : ""}
${c.rhythmText ? `RHYTHM: ${c.rhythmText}` : ""}
${c.kidsText ? `KIDS: ${c.kidsText}` : ""}
INTERESTS: Only include categories that genuinely match the traveler's stated interests. If an interest category has no relevant match, omit it entirely rather than filling it with generic picks. The interests are listed most-important-first — weight earlier interests more heavily when deciding what to include and how to rank it.

RANKING: Give every item a "priority" of exactly "essential", "recommended", or "optional", reflecting how strongly it matches the traveler's top interests and stated focus. Reserve "essential" for genuine must-dos — at most one per category, and never mark everything essential. The tiers exist to prioritise a limited daily schedule, so be discerning.${c.focus === "Famous sights" ? " The traveler wants famous sights, so iconic must-sees that define the destination should rank essential." : c.focus === "Hidden gems" ? " The traveler wants hidden gems, so distinctive local-only spots should rank essential over obvious landmarks." : ""}

CONFLICTS: When two candidate activities within the same category compete and only one can reasonably become essential, prefer whichever matches a PRIORITY INTEREST over one that doesn't. If both or neither match a priority interest, fall back to whichever interest is listed first in INTERESTS.

AVOID: Never include anything related to: ${c.avoidLine}. If a category would only contain avoided items, leave it empty.

Rules: 3 items max per category. All strings concise (1 sentence max). Use local currency equivalents for prices.

ACCURACY: Only include venues and services you have high confidence are currently operating. Do not suggest bike-share programs, municipal transit apps, or any service that may have shut down. If a venue's current status is uncertain, omit it entirely — a shorter list of reliable options is better than a longer list with stale picks.`;

  return { contextText, imageBlocks, n, safeStart, safeEnd };
}

// Combine context + schema into a final message (text, or image blocks + text).
function assembleTripMessage(contextText, schema, imageBlocks) {
  const promptText = `${contextText}\n\n${schema}`;
  return imageBlocks.length > 0
    ? [...imageBlocks, { type: "text", text: promptText }]
    : promptText;
}

/**
 * Single-call trip prompt (full schema). Kept for tests and any non-split use.
 * Returns { messageContent, n, safeStart, safeEnd }.
 */
export function buildTripPrompt(answers, uploadedFiles) {
  const { contextText, imageBlocks, n, safeStart, safeEnd } = tripContext(answers, uploadedFiles);
  return { messageContent: assembleTripMessage(contextText, FULL_SCHEMA(n, wantsNightlife(answers)), imageBlocks), n, safeStart, safeEnd };
}

/**
 * Heavy half of the split build — the 5 activity categories.
 * Returns { messageContent, n }.
 */
export function buildTripCategoriesPrompt(answers, uploadedFiles) {
  const { contextText, imageBlocks, n } = tripContext(answers, uploadedFiles);
  return { messageContent: assembleTripMessage(contextText, CATEGORIES_SCHEMA(wantsNightlife(answers)), imageBlocks), n };
}

/**
 * Light half of the split build — destination, tagline, nights, season, highlights.
 * Returns { messageContent, n }.
 */
export function buildTripMetaPrompt(answers, uploadedFiles) {
  const { contextText, imageBlocks, n } = tripContext(answers, uploadedFiles);
  // The shared context is full of day-planning instructions, and without an
  // explicit pin the model volunteers a day-by-day "itinerary" this schema
  // never asked for — output that grows with trip length and pushed 6-night
  // builds past Vercel's 60s ceiling (the 2026-07-28 Bangkok 500s).
  const schema = `${META_SCHEMA(n)}\n\nReturn ONLY the fields in this schema. Do NOT include categories, itinerary, days, activities, or any other keys.`;
  return { messageContent: assembleTripMessage(contextText, schema, imageBlocks), n };
}

// ── Plan generation prompt ─────────────────────────────────────────────────────

/**
 * Build a prompt to regenerate a single day of an existing itinerary.
 * Uses complete() (not streaming) — response is spliced back into the plan.
 */
export function buildEditDayPrompt(dayLabel, dayContent, instruction, trip) {
  const a = trip.answers;
  const c = travelerContext(a);
  const [lo, hi] = paceBand(c.pace);

  const allItems = formatActivityItems(trip.categories);

  const TABLE_BLOCK = `TABLE:\n| Time | Activity | Details |\n|------|----------|----------|\n| [HH:MM] | **Place** | facts only, duration |\nENDTABLE`;

  return `You are a travel planner. Regenerate ONE day of an itinerary for ${trip.destination}.

CHANGE INSTRUCTION: ${instruction || "Refresh with new activity ideas — keep the same spirit but swap out the specific activities"}

CURRENT DAY (replace this entirely):
${dayContent}

${travelerBlock(a, c)}

APPLY THESE RULES:
PARTY: ${c.partyText}
ROUTING: ${c.stayText} ${c.transportText}
BUDGET: ${c.budgetText}${c.paceText ? `\nPACE: ${c.paceText}` : ""}${c.focusText ? `\nFOCUS: ${c.focusText}` : ""}${c.rhythmText ? `\nRHYTHM: ${c.rhythmText}` : ""}${c.kidsText ? `\nKIDS: ${c.kidsText}` : ""}
AVOID: Never suggest anything related to: ${c.avoidLine}.
PRIORITY: Activities are tagged ESSENTIAL, RECOMMENDED, or OPTIONAL (listed essentials-first). Favour ESSENTIAL items for this day; use OPTIONAL only if there is spare time. Never drop an essential in favour of an optional.

ACTIVITIES TO USE (tagged by priority, essentials first):
${allItems || `Use your knowledge of ${a.destination}`}

STRICT OUTPUT RULES:
- Return ONLY the replacement day content. Nothing before or after.
- Start with the exact day header: ## ${dayLabel}
- Use the same format as the original:

## ${dayLabel}

${TABLE_BLOCK}

TIPS: [practical tip] | [logistics tip]

- ${lo} to ${hi} activities. No filler phrases. Facts only.
- Do not schedule a venue that already appears on another day of this trip.
- Bold place names inside table cells using **Name**
- ACCURACY: Only recommend venues you are confident are currently operating.`;
}

/**
 * Build a prompt to tweak ONE activity in place (Phase 3 per-activity AI edit).
 * Returns a single replacement activity as a one-row TABLE block, which the
 * caller parses via parsePlan. Uses complete() (not streaming).
 */
export function buildTweakActivityPrompt(trip, dayLabel, activity, instruction) {
  const a = trip.answers;
  const c = travelerContext(a);

  return `You are a travel planner editing ONE activity in a ${trip.destination} itinerary (${dayLabel}).

CURRENT ACTIVITY:
| ${activity.time} | ${activity.title} | ${activity.details} |

CHANGE REQUEST: ${instruction}

TRAVELER CONTEXT (respect these):
- Party: ${c.partyLine}${c.kidsSuffix}
- Budget: ${c.budgetLabel}
- Interests: ${c.interestsLine}${c.prioritySuffix}
- Avoid: ${c.avoidLine}

Apply the change request. Keep the same time slot unless the request implies otherwise.
Write for someone who wants facts, not atmosphere — what it is, where, how long, how much.
Use local currency. Times in 24-hour HH:MM format (e.g. 09:00, 17:30). Only suggest venues you are confident are currently operating.

STRICT OUTPUT — return ONLY this block, nothing before or after:
TABLE:
| Time | Activity | Details |
|------|----------|----------|
| [HH:MM] | **Place** | facts only, duration, price |
ENDTABLE`;
}

// ── Verified local events (§15.2 C) ─────────────────────────────────────────
//
// The app has always fetched the real MLB schedule (useLocalEvents) and shown
// it on the dashboard — but it never reached the prompt, so the model filled the
// silence with a guess. A Baltimore itinerary scheduled a Camden Yards home game
// at 15:30 on a Sunday the Orioles were away in Tampa.
//
// The NEGATIVE matters as much as the positive: "the Orioles have no home games
// on these dates" is the sentence that stops the invention. A block listing only
// real games still leaves the untouched dates ambiguous.

const MAX_LISTED_GAMES = 10;

/** "Tuesday, August 18" — short label for an event date. */
function eventDateLabel(iso) {
  const d = parseISODate(iso);
  return d
    ? d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : iso;
}

/**
 * Render the verified-events block, or "" when there is nothing trustworthy to
 * say. Returning "" is the fail-safe: no block means the prompt behaves exactly
 * as it did before this existed.
 *
 * events — { teams: string[], games: [{date, home, away, venue}], interested: bool }
 *          Omit entirely (or pass resolved:false) while the fetch is still in
 *          flight — an empty games array from an unfinished fetch would assert a
 *          false negative, which is worse than saying nothing.
 */
export function buildEventsBlock(events) {
  const teams = Array.isArray(events?.teams) ? events.teams.filter(Boolean) : [];
  if (!events || events.resolved === false || !teams.length) return "";

  const games = (Array.isArray(events.games) ? events.games : []).slice(0, MAX_LISTED_GAMES);
  const teamList = teams.join(" / ");
  const lines = [];

  if (games.length) {
    lines.push(`- ${teamList} home games during this trip:`);
    for (const g of games) {
      const vs = g.away ? ` vs ${g.away}` : "";
      const at = g.venue ? ` — ${g.venue}` : "";
      lines.push(`    · ${eventDateLabel(g.date)}${vs}${at}`);
    }
    lines.push(`- There is NO home game on ANY other date of this trip. The stadium is dark on those dates.`);
  } else {
    lines.push(`- ${teamList}: NO home games at any point during this trip. The stadium is dark for the entire stay.`);
  }

  lines.push(`- The list above is complete. Never schedule, mention, or hedge about a game on a date not listed.`);
  lines.push(`- Never put a "check the schedule" placeholder in a time slot. A slot holds a real verified activity or nothing.`);
  lines.push(events.interested
    ? `- The traveler follows baseball — you MAY schedule a listed game, at its real date.`
    : `- The traveler did not list sports as an interest, so do NOT add a game. This block exists so you cannot invent one.`);

  return `VERIFIED LOCAL EVENTS — checked against the live league schedule for these exact dates. This is fact, not inference. It overrides the LIVE EVENTS rule above:\n${lines.join("\n")}`;
}

/**
 * Build the plan generation prompt for a given mode.
 * editInstruction — optional free-text change instruction (for Full Itinerary / Specific Activities edits)
 * editType        — "activities" | null  (controls how the instruction is framed)
 * events          — verified local events (see buildEventsBlock); omit when unresolved
 */
export function buildPlanPrompt(mode, trip, editInstruction = null, editType = null, events = null) {
  const a = trip.answers;

  const c = travelerContext(a);
  const [lo, hi] = paceBand(c.pace);

  const allItems = formatActivityItems(trip.categories);

  const today       = new Date().toISOString().slice(0, 10);
  const startDate   = parseISODate(a.dates?.start);
  const endDate     = parseISODate(a.dates?.end);
  const safeStart   = (startDate ? startDate.toISOString().slice(0, 10) : a.dates?.start) || "?";
  const safeEnd     = (endDate   ? endDate.toISOString().slice(0, 10)   : a.dates?.end)   || "?";
  const dayLabels   = buildDayLabels(a.dates?.start, trip.nights);
  const dayHeaderBlock = dayLabels.length > 0
    ? `DAY HEADERS — use these exact labels in order:\n${dayLabels.map((l, i) => `  Day ${i + 1}: ${l}`).join("\n")}`
    : "";

  const TABLE_BLOCK = `TABLE:\n| Time | Activity | Details |\n|------|----------|----------|\n| [HH:MM] | **Place** | facts only, duration |\nENDTABLE`;

  const eventsBlock = buildEventsBlock(events);

  const modeInstructions = {
    full:   `Create a ${trip.nights}-night itinerary. Use the DAY HEADERS list for exact day labels. For each day:\n\n## Day N — [exact label from DAY HEADERS]\n\n${TABLE_BLOCK}\n\nTIPS: [practical tip] | [logistics tip]\n\nRules: ${lo}\u2013${hi} activities per day. Times realistic for ${a.destination}, in 24-hour HH:MM format (e.g. 09:00, 17:30).`,
    day:    `Design the single best day possible in ${a.destination}. Output EXACTLY ONE day — no other days, no multi-day structure.\n\n## The Ideal Day — [Weekday, Month Date]\n\n${TABLE_BLOCK}\n\nTIPS: [practical tip] | [logistics tip]`,
    combo:  `Create 3 themed day combinations. For each:\n\n## [Theme name]\n[One sentence — what type of day this is]\n\n${TABLE_BLOCK}`,
    hidden: `List 5 local spots most visitors miss.\n\n${TABLE_BLOCK}`,
  };

  return `You are a travel planner. Write for someone who wants facts, not atmosphere. No filler phrases like "soak in the views" or "immerse yourself". Just: what it is, where, how long, how much.

Use local currency for all price references. Avoid US-centric assumptions.
All times in 24-hour HH:MM format (e.g. 09:00, 17:30) — never AM/PM.

${modeInstructions[mode]}

${travelerBlock(a, c)}
- Notes: ${a.notes || "none"}
- Season: ${trip.season || ""}

APPLY THESE RULES TO THE ITINERARY:

PARTY: ${c.partyText}

ROUTING: ${c.stayText} ${c.transportText}
${c.paceText ? `\nPACE: ${c.paceText}` : ""}
${c.focusText ? `FOCUS: ${c.focusText}` : ""}
${c.rhythmText ? `RHYTHM: ${c.rhythmText}` : ""}
${c.kidsText ? `KIDS: ${c.kidsText}` : ""}
TEMPORAL GROUNDING: Today is ${today}. Trip dates: ${safeStart} → ${safeEnd}.${mode === "full" && dayHeaderBlock ? `\n${dayHeaderBlock}` : ""} Always use these exact day labels — never guess or infer day-of-week independently.

ACCURACY RULES:
- OPERATING HOURS: Before placing a venue in a time slot, verify it is open on that specific day of week and at that time. Museums are often closed Mondays or Tuesdays; some attractions have seasonal or day-specific hours. If a venue's hours make a slot implausible, substitute a different option from the same category.
- LIVE EVENTS: Never assert that a specific sports game, concert, or ticketed event is scheduled on a particular date unless it appears in a VERIFIED LOCAL EVENTS block below — team schedules, touring dates, and event lineups change. With no verified listing, OMIT the event entirely. Do not write "Check schedule: [team]" into a time slot: a hedge that still occupies a slot is the same error as a wrong booking, because the traveler has now lost that hour.
- CLOSED VENUES: Do not recommend any bike-share program or transit app you cannot confidently confirm is currently operating. Omit uncertain venues entirely rather than risk sending the traveler somewhere that no longer exists.
- SELF-CONSISTENCY: The Details you write must agree with the Time you assigned. If the details say a venue opens at 11:30, do not schedule it at 10:30; if they name a best window of 11:00–13:00, schedule it inside that window. Fix the time or pick a different venue — never ship a row that argues with itself.
${eventsBlock ? `\n${eventsBlock}\n` : ""}
BUDGET: ${c.budgetText}

AVOID: Never suggest anything related to: ${c.avoidLine}.

PRIORITY: Activities are tagged ESSENTIAL, RECOMMENDED, or OPTIONAL (listed essentials-first). Schedule ESSENTIAL items before RECOMMENDED, and use OPTIONAL only when there is genuine spare capacity (a relaxed pace or extra days). In a multi-day itinerary, every ESSENTIAL should appear at least once before any OPTIONAL is added. Never drop an essential in favour of an optional.

ACTIVITIES TO USE (tagged by priority, essentials first):
${allItems || `Use your knowledge of ${a.destination}`}

STRICT OUTPUT RULES:
- Tables exactly as shown with TABLE/ENDTABLE markers
- ${lo} to ${hi} activities per day — match this to the stated pace, do not average it with any other number
- Never schedule the same venue twice across the itinerary. Each activity must be a distinct place. If you catch yourself repeating one, REPLACE THE ROW — put the new venue's name in the Activity column. Never leave the repeated name in Activity and describe a substitute in Details ("already visited Day 1 — substitute: ..."); that ships the traveler a duplicate.
- Bold place names inside table cells using **Name**
- TIPS line format: TIPS: tip one | tip two${editInstruction ? `

${editType === "activities"
  ? `ACTIVITY EDIT: ${editInstruction}\nAdjust ONLY the activities described. Keep all other days and activities unchanged. If an exact match cannot be found, replace the closest activity in the same time slot.`
  : `EDIT INSTRUCTION: ${editInstruction}\nApply this change throughout the itinerary while keeping the same structure, format, and day count.`
}` : ""}`;
}
