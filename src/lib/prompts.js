import { arr, calcNights, parseISODate } from "./utils.js";

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
  if (pace === "Slow")
    return "Set a relaxed pace — max 2–3 activities per day with breathing room. Long lunches, spontaneous wandering, and quiet time are part of the plan.";
  if (pace === "Fast")
    return "High-energy itinerary — 4–6 activities per day, efficient routing, minimal downtime. The traveler would rather be tired than bored.";
  return "Balanced pace — 3–4 activities per day, mix of planned and unstructured time.";
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

const CATEGORIES_BODY =
`"categories":{
"nature":[{"name":"","description":"","duration":"","difficulty":"","proTip":"","priority":"essential|recommended|optional"}],
"culture":[{"name":"","description":"","duration":"","admission":"","proTip":"","priority":"essential|recommended|optional"}],
"nightlife":[{"name":"","description":"","vibe":"","proTip":"","priority":"essential|recommended|optional"}],
"exploration":[{"name":"","description":"","bestTime":"","proTip":"","priority":"essential|recommended|optional"}],
"experiences":[{"name":"","description":"","duration":"","price":"","bookAhead":true,"proTip":"","priority":"essential|recommended|optional"}]
}`;

const META_BODY = (n) =>
`"destination":"City, Country","tagline":"8-word trip description","nights":${n},"season":"one sentence","highlights":["h1","h2","h3"]`;

const CATEGORIES_SCHEMA      = `{${CATEGORIES_BODY}}`;
const META_SCHEMA            = (n) => `{${META_BODY(n)}}`;
const FULL_SCHEMA            = (n) => `{${META_BODY(n)},\n${CATEGORIES_BODY}}`;

/**
 * Build the shared instruction context (everything except the JSON schema)
 * plus the image blocks and computed dates. Used by every trip-build variant.
 */
function tripContext(answers, uploadedFiles) {
  const a = answers;
  const d1 = parseISODate(a.dates?.start);
  const d2 = parseISODate(a.dates?.end);
  const n  = calcNights(a.dates?.start, a.dates?.end);

  const safeStart = (d1 ? d1.toISOString().slice(0, 10) : a.dates?.start) || "?";
  const safeEnd   = (d2 ? d2.toISOString().slice(0, 10) : a.dates?.end)   || "?";

  const budgetLine    = a.budget === 0
    ? "Staying with family/friends — no accommodation cost"
    : `approx. USD ${a.budget}/day per person`;

  const stayLine      = a.logistics?.stay || "not specified";
  const transportLine = a.logistics?.transport ? arr(a.logistics.transport) : "not specified";
  const pace          = a.logistics?.pace     || "";
  const focus         = a.logistics?.focus    || "";
  const rhythm        = a.logistics?.rhythm   || "";
  const kidsVal       = a.party?.kids         || "";

  const interestsLine   = arr(a.interests);
  const avoidLine       = resolveAvoid(a);

  const paceText      = pace  ? paceInstruction(pace)                   : "";
  const focusText     = focus ? focusInstruction(a.destination, focus)  : "";
  const rhythmText    = rhythm ? rhythmInstruction(rhythm)              : "";
  const kidsText      = kidsVal ? kidsInstruction(kidsVal)              : "";

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
PARTY: ${arr(a.party)}${kidsVal ? ` · Kids: ${kidsVal}` : ""}
STAYING: ${stayLine}
TRANSPORT: ${transportLine}
BUDGET: ${budgetLine}
INTERESTS (listed most-important-first): ${interestsLine}
AVOID: ${avoidLine}
NOTES: ${a.notes || "none"}${pace ? `\nPACE: ${pace}` : ""}${focus ? `\nFOCUS: ${focus}` : ""}${rhythm ? `\nRHYTHM: ${rhythm}` : ""}
${textFileContext ? `\nUPLOADED CONTEXT:\n${textFileContext}` : ""}

INSTRUCTIONS — apply these to every selection you make:

PARTY: ${partyInstruction(a)}

LOCATION: ${stayInstruction(stayLine)}

TRANSPORT: ${transportInstruction(transportLine)}

BUDGET: ${budgetInstruction(a.budget)}
${paceText ? `\nPACE: ${paceText}` : ""}
${focusText ? `FOCUS: ${focusText}` : ""}
${rhythmText ? `RHYTHM: ${rhythmText}` : ""}
${kidsText ? `KIDS: ${kidsText}` : ""}
INTERESTS: Only include categories that genuinely match the traveler's stated interests. If an interest category has no relevant match, omit it entirely rather than filling it with generic picks. The interests are listed most-important-first — weight earlier interests more heavily when deciding what to include and how to rank it.

RANKING: Give every item a "priority" of exactly "essential", "recommended", or "optional", reflecting how strongly it matches the traveler's top interests and stated focus. Reserve "essential" for genuine must-dos — at most one per category, and never mark everything essential. The tiers exist to prioritise a limited daily schedule, so be discerning.${focus === "Famous sights" ? " The traveler wants famous sights, so iconic must-sees that define the destination should rank essential." : focus === "Hidden gems" ? " The traveler wants hidden gems, so distinctive local-only spots should rank essential over obvious landmarks." : ""}

AVOID: Never include anything related to: ${avoidLine}. If a category would only contain avoided items, leave it empty.

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
  return { messageContent: assembleTripMessage(contextText, FULL_SCHEMA(n), imageBlocks), n, safeStart, safeEnd };
}

/**
 * Heavy half of the split build — the 5 activity categories.
 * Returns { messageContent, n }.
 */
export function buildTripCategoriesPrompt(answers, uploadedFiles) {
  const { contextText, imageBlocks, n } = tripContext(answers, uploadedFiles);
  return { messageContent: assembleTripMessage(contextText, CATEGORIES_SCHEMA, imageBlocks), n };
}

/**
 * Light half of the split build — destination, tagline, nights, season, highlights.
 * Returns { messageContent, n }.
 */
export function buildTripMetaPrompt(answers, uploadedFiles) {
  const { contextText, imageBlocks, n } = tripContext(answers, uploadedFiles);
  return { messageContent: assembleTripMessage(contextText, META_SCHEMA(n), imageBlocks), n };
}

// ── Plan generation prompt ─────────────────────────────────────────────────────

/**
 * Build a prompt to regenerate a single day of an existing itinerary.
 * Uses complete() (not streaming) — response is spliced back into the plan.
 */
export function buildEditDayPrompt(dayLabel, dayContent, instruction, trip) {
  const a = trip.answers;
  const stayLine      = a.logistics?.stay || "";
  const transportLine = a.logistics?.transport ? arr(a.logistics.transport) : "";
  const budgetLabel   = a.budget === 0 ? "staying with family/friends" : `~${a.budget} USD/day`;
  const avoidText     = resolveAvoid(a);
  const pace          = a.logistics?.pace     || "";
  const focus         = a.logistics?.focus    || "";
  const rhythm        = a.logistics?.rhythm   || "";
  const kidsVal       = a.party?.kids         || "";
  const paceText      = pace  ? paceInstruction(pace)                   : "";
  const focusText     = focus ? focusInstruction(a.destination, focus)  : "";
  const rhythmText    = rhythm ? rhythmInstruction(rhythm)              : "";
  const kidsText      = kidsVal ? kidsInstruction(kidsVal)              : "";

  const allItems = formatActivityItems(trip.categories);

  const TABLE_BLOCK = `TABLE:\n| Time | Activity | Details |\n|------|----------|----------|\n| [time] | **Place** | facts only, duration |\nENDTABLE`;

  return `You are a travel planner. Regenerate ONE day of an itinerary for ${trip.destination}.

CHANGE INSTRUCTION: ${instruction || "Refresh with new activity ideas — keep the same spirit but swap out the specific activities"}

CURRENT DAY (replace this entirely):
${dayContent}

TRAVELER
- Destination: ${a.destination}
- Party: ${arr(a.party)}${kidsVal ? ` · Kids: ${kidsVal}` : ""}
- Budget: ${budgetLabel}
- Staying: ${stayLine || "not specified"}
- Transport: ${transportLine || "not specified"}${pace ? `\n- Pace: ${pace}` : ""}${focus ? `\n- Focus: ${focus}` : ""}${rhythm ? `\n- Rhythm: ${rhythm}` : ""}
- Interests: ${arr(a.interests)}
- Avoid: ${avoidText}

APPLY THESE RULES:
PARTY: ${partyInstruction(a)}
ROUTING: ${stayInstruction(stayLine || "not specified")} ${transportInstruction(transportLine || "not specified")}
BUDGET: ${budgetInstruction(a.budget)}${paceText ? `\nPACE: ${paceText}` : ""}${focusText ? `\nFOCUS: ${focusText}` : ""}${rhythmText ? `\nRHYTHM: ${rhythmText}` : ""}${kidsText ? `\nKIDS: ${kidsText}` : ""}
AVOID: Never suggest anything related to: ${avoidText}.
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

- 3 to 5 activities max. No filler phrases. Facts only.
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
  const budgetLabel = a.budget === 0 ? "staying with family/friends" : `~${a.budget} USD/day`;
  const avoidText   = resolveAvoid(a);
  const kidsVal     = a.party?.kids || "";

  return `You are a travel planner editing ONE activity in a ${trip.destination} itinerary (${dayLabel}).

CURRENT ACTIVITY:
| ${activity.time} | ${activity.title} | ${activity.details} |

CHANGE REQUEST: ${instruction}

TRAVELER CONTEXT (respect these):
- Party: ${arr(a.party)}${kidsVal ? ` · Kids: ${kidsVal}` : ""}
- Budget: ${budgetLabel}
- Interests: ${arr(a.interests)}
- Avoid: ${avoidText}

Apply the change request. Keep the same time slot unless the request implies otherwise.
Write for someone who wants facts, not atmosphere — what it is, where, how long, how much.
Use local currency. Only suggest venues you are confident are currently operating.

STRICT OUTPUT — return ONLY this block, nothing before or after:
TABLE:
| Time | Activity | Details |
|------|----------|----------|
| [time] | **Place** | facts only, duration, price |
ENDTABLE`;
}

/**
 * Build the plan generation prompt for a given mode.
 * editInstruction — optional free-text change instruction (for Full Itinerary / Specific Activities edits)
 * editType        — "activities" | null  (controls how the instruction is framed)
 */
export function buildPlanPrompt(mode, trip, editInstruction = null, editType = null) {
  const a = trip.answers;

  const allItems = formatActivityItems(trip.categories);

  const stayLine      = a.logistics?.stay || "";
  const transportLine = a.logistics?.transport ? arr(a.logistics.transport) : "";
  const budgetLabel   = a.budget === 0 ? "staying with family/friends" : `~${a.budget} USD/day`;
  const avoidText     = resolveAvoid(a);
  const pace          = a.logistics?.pace     || "";
  const focus         = a.logistics?.focus    || "";
  const rhythm        = a.logistics?.rhythm   || "";
  const kidsVal       = a.party?.kids         || "";
  const paceText      = pace  ? paceInstruction(pace)                   : "";
  const focusText     = focus ? focusInstruction(a.destination, focus)  : "";
  const rhythmText    = rhythm ? rhythmInstruction(rhythm)              : "";
  const kidsText      = kidsVal ? kidsInstruction(kidsVal)              : "";

  const today       = new Date().toISOString().slice(0, 10);
  const startDate   = parseISODate(a.dates?.start);
  const endDate     = parseISODate(a.dates?.end);
  const safeStart   = (startDate ? startDate.toISOString().slice(0, 10) : a.dates?.start) || "?";
  const safeEnd     = (endDate   ? endDate.toISOString().slice(0, 10)   : a.dates?.end)   || "?";
  const dayLabels   = buildDayLabels(a.dates?.start, trip.nights);
  const dayHeaderBlock = dayLabels.length > 0
    ? `DAY HEADERS — use these exact labels in order:\n${dayLabels.map((l, i) => `  Day ${i + 1}: ${l}`).join("\n")}`
    : "";

  const TABLE_BLOCK = `TABLE:\n| Time | Activity | Details |\n|------|----------|----------|\n| [time] | **Place** | facts only, duration |\nENDTABLE`;

  const modeInstructions = {
    full:   `Create a ${trip.nights}-night itinerary. Use the DAY HEADERS list for exact day labels. For each day:\n\n## Day N — [exact label from DAY HEADERS]\n\n${TABLE_BLOCK}\n\nTIPS: [practical tip] | [logistics tip]\n\nRules: 3–5 activities max per day. Times realistic for ${a.destination}.`,
    day:    `Design the single best day possible in ${a.destination}. Output EXACTLY ONE day — no other days, no multi-day structure.\n\n## The Ideal Day — [Weekday, Month Date]\n\n${TABLE_BLOCK}\n\nTIPS: [practical tip] | [logistics tip]`,
    combo:  `Create 3 themed day combinations. For each:\n\n## [Theme name]\n[One sentence — what type of day this is]\n\n${TABLE_BLOCK}`,
    hidden: `List 5 local spots most visitors miss.\n\n${TABLE_BLOCK}`,
  };

  return `You are a travel planner. Write for someone who wants facts, not atmosphere. No filler phrases like "soak in the views" or "immerse yourself". Just: what it is, where, how long, how much.

Use local currency for all price references. Avoid US-centric assumptions.

${modeInstructions[mode]}

TRAVELER
- Destination: ${a.destination}
- Party: ${arr(a.party)}${kidsVal ? ` · Kids: ${kidsVal}` : ""}
- Budget: ${budgetLabel}
- Staying: ${stayLine || "not specified"}
- Transport: ${transportLine || "not specified"}${pace ? `\n- Pace: ${pace}` : ""}${focus ? `\n- Focus: ${focus}` : ""}${rhythm ? `\n- Rhythm: ${rhythm}` : ""}
- Interests: ${arr(a.interests)}
- Avoid: ${avoidText}
- Notes: ${a.notes || "none"}
- Season: ${trip.season || ""}

APPLY THESE RULES TO THE ITINERARY:

PARTY: ${partyInstruction(a)}

ROUTING: ${stayInstruction(stayLine || "not specified")} ${transportInstruction(transportLine || "not specified")}
${paceText ? `\nPACE: ${paceText}` : ""}
${focusText ? `FOCUS: ${focusText}` : ""}
${rhythmText ? `RHYTHM: ${rhythmText}` : ""}
${kidsText ? `KIDS: ${kidsText}` : ""}
TEMPORAL GROUNDING: Today is ${today}. Trip dates: ${safeStart} → ${safeEnd}.${mode === "full" && dayHeaderBlock ? `\n${dayHeaderBlock}` : ""} Always use these exact day labels — never guess or infer day-of-week independently.

ACCURACY RULES:
- OPERATING HOURS: Before placing a venue in a time slot, verify it is open on that specific day of week and at that time. Museums are often closed Mondays or Tuesdays; some attractions have seasonal or day-specific hours. If a venue's hours make a slot implausible, substitute a different option from the same category.
- LIVE EVENTS: Never assert that a specific sports game, concert, or ticketed event is scheduled on a particular date — team schedules, touring dates, and event lineups change. Instead write: "Check schedule: [venue or team name]" as an optional add-on.
- CLOSED VENUES: Do not recommend any bike-share program or transit app you cannot confidently confirm is currently operating. Omit uncertain venues entirely rather than risk sending the traveler somewhere that no longer exists.

BUDGET: ${budgetInstruction(a.budget)}

AVOID: Never suggest anything related to: ${avoidText}.

PRIORITY: Activities are tagged ESSENTIAL, RECOMMENDED, or OPTIONAL (listed essentials-first). Schedule ESSENTIAL items before RECOMMENDED, and use OPTIONAL only when there is genuine spare capacity (a relaxed pace or extra days). In a multi-day itinerary, every ESSENTIAL should appear at least once before any OPTIONAL is added. Never drop an essential in favour of an optional.

ACTIVITIES TO USE (tagged by priority, essentials first):
${allItems || `Use your knowledge of ${a.destination}`}

STRICT OUTPUT RULES:
- Tables exactly as shown with TABLE/ENDTABLE markers
- 3 to 5 activities per day max
- Bold place names inside table cells using **Name**
- TIPS line format: TIPS: tip one | tip two${editInstruction ? `

${editType === "activities"
  ? `ACTIVITY EDIT: ${editInstruction}\nAdjust ONLY the activities described. Keep all other days and activities unchanged. If an exact match cannot be found, replace the closest activity in the same time slot.`
  : `EDIT INSTRUCTION: ${editInstruction}\nApply this change throughout the itinerary while keeping the same structure, format, and day count.`
}` : ""}`;
}
