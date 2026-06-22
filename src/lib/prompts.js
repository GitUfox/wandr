import { arr, calcNights, parseISODate } from "./utils.js";

// ── Shared instruction builders ────────────────────────────────────────────────

function partyInstruction(a) {
  const chip = Array.isArray(a.party?.chips) ? a.party.chips[0] : arr(a.party);
  const extra = a.party?.text?.trim() ? ` Additional context: ${a.party.text.trim()}.` : "";
  const rules = {
    "Solo":
      "Traveler is solo. Prioritise activities that work comfortably alone — communal cafés, street food, self-guided walks, local bars with counter seating. Avoid awkward solo situations. Flag anything that's notably better with a companion.",
    "Partner / couple":
      "Traveling as a couple. Lean romantic and intimate — shared experiences, candlelit dining, quieter neighbourhoods over crowded tourist spots. Avoid large group-tour style activities.",
    "Friends (small group)":
      "Small group of friends. Prioritise social, shareable activities — lively restaurants, group-friendly bars, experiences that generate shared memories. Energy and atmosphere matter.",
    "Group (4+)":
      "Large group (4+). Restaurants and venues must accommodate groups — flag reservation requirements. Activities should be group-bookable. Communal, high-energy experiences.",
    "Family":
      "Family trip. All activity and dining selections must be family-appropriate. Include child-friendly timing (early dinners, morning activities). Exclude nightlife, late-night venues, and adult-only experiences entirely.",
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
    return "Staying with family/friends — no accommodation cost. Focus on free and low-cost activities. Street food and casual local dining. Flag any paid options as optional splurges.";
  if (budget <= 60)
    return "Low budget (~$30–50/day). Street food, markets, free sights. Skip paid attractions where free alternatives exist.";
  if (budget <= 150)
    return "Comfortable budget (~$75–120/day). Sit-down restaurants, standard paid attractions. Occasional premium experience is fine.";
  if (budget <= 300)
    return "Higher budget (~$200+/day). Quality dining and premium experiences. Skip budget-only options.";
  return "Luxury budget (~$450+/day). High-end throughout — tasting menus, private experiences, exclusive venues.";
}

function paceInstruction(pace) {
  if (pace === "Slow & wandering")
    return "Set a relaxed pace — max 2–3 activities per day with breathing room. Long lunches, spontaneous wandering, and quiet time are part of the plan.";
  if (pace === "Pack it in")
    return "High-energy itinerary — 4–6 activities per day, efficient routing, minimal downtime. The traveler would rather be tired than bored.";
  return "Balanced pace — 3–4 activities per day, mix of planned and unstructured time.";
}

function firstTimeInstruction(dest, firstTime) {
  if (firstTime === "First visit")
    return `First-time visitor to ${dest}. Include essential classics and iconic must-sees alongside hidden gems.`;
  if (firstTime === "Been before")
    return `Returning visitor to ${dest}. Deprioritise obvious tourist landmarks. Prioritise neighbourhood gems, local-only spots, and experiences that reward repeat visitors.`;
  return "";
}

function kidsInstruction(kids) {
  if (!kids || kids === "No kids") return "";
  const map = {
    "Yes — under 5":  "Toddlers in the group (under 5). Stroller-accessible venues only. Short activity blocks. Nap-schedule-friendly timing. Avoid long waits and loud venues.",
    "Yes — 5 to 12":  "School-age kids (5–12). Hands-on and interactive experiences. Kid-friendly dining with familiar options. Keep pace manageable.",
    "Yes — teens":    "Teenagers in the group. Skip anything 'too young'. Include culture, food, and independence-friendly spots. Energy matters more than educational value.",
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

/**
 * Build the trip database prompt — returns { messageContent, n, safeStart, safeEnd }
 */
export function buildTripPrompt(answers, uploadedFiles) {
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
  const firstTime     = a.logistics?.firstTime || "";
  const kidsVal       = a.party?.kids         || "";

  const interestsLine   = arr(a.interests);
  const avoidFromChips  = Array.isArray(a.interests?.avoidChips)
    ? a.interests.avoidChips.join(", ")
    : "";
  const avoidLine = avoidFromChips || arr(a.avoid) || "nothing";

  const paceText      = pace      ? paceInstruction(pace)                          : "";
  const firstTimeText = firstTime ? firstTimeInstruction(a.destination, firstTime) : "";
  const kidsText      = kidsVal   ? kidsInstruction(kidsVal)                       : "";

  const textFileContext = (uploadedFiles || [])
    .filter(f => !f.isImage)
    .map(f => `--- FILE: ${f.name} ---\n${f.content}`)
    .join("\n\n");

  const imageBlocks = (uploadedFiles || [])
    .filter(f => f.isImage)
    .map(f => ({ type: "image", source: { type: "base64", media_type: f.type, data: f.content } }));

  const promptText = `Return ONLY a valid JSON object. No markdown, no explanation, nothing else.

DESTINATION: ${a.destination}
DATES: ${safeStart} → ${safeEnd} (${n} nights)
PARTY: ${arr(a.party)}${kidsVal ? ` · Kids: ${kidsVal}` : ""}
STAYING: ${stayLine}
TRANSPORT: ${transportLine}
BUDGET: ${budgetLine}
INTERESTS: ${interestsLine}
AVOID: ${avoidLine}
NOTES: ${a.notes || "none"}${pace ? `\nPACE: ${pace}` : ""}${firstTime ? `\nFIRST VISIT: ${firstTime}` : ""}
${textFileContext ? `\nUPLOADED CONTEXT:\n${textFileContext}` : ""}

INSTRUCTIONS — apply these to every selection you make:

PARTY: ${partyInstruction(a)}

LOCATION: ${stayInstruction(stayLine)}

TRANSPORT: ${transportInstruction(transportLine)}

BUDGET: ${budgetInstruction(a.budget)}
${paceText ? `\nPACE: ${paceText}` : ""}
${firstTimeText ? `VISIT HISTORY: ${firstTimeText}` : ""}
${kidsText ? `KIDS: ${kidsText}` : ""}
INTERESTS: Only include categories that genuinely match the traveler's stated interests. If an interest category has no relevant match, omit it entirely rather than filling it with generic picks.

AVOID: Never include anything related to: ${avoidLine}. If a category would only contain avoided items, leave it empty.

Rules: 3 items max per category. All strings concise (1 sentence max). Use local currency equivalents for prices.

ACCURACY: Only include venues, restaurants, and services you have high confidence are currently operating. Do not suggest bike-share programs, municipal transit apps, or any service that may have shut down. If a venue's current status is uncertain, omit it entirely — a shorter list of reliable options is better than a longer list with stale picks.

{"destination":"City, Country","tagline":"8-word trip description","nights":${n},"season":"one sentence","highlights":["h1","h2","h3"],
"categories":{
"breakfast":[{"name":"","description":"","price":"$","mustOrder":"","neighborhood":"","proTip":""}],
"lunch":[{"name":"","description":"","price":"$$","mustOrder":"","neighborhood":"","proTip":""}],
"dinner":[{"name":"","description":"","price":"$$$","mustOrder":"","neighborhood":"","proTip":""}],
"nature":[{"name":"","description":"","duration":"","difficulty":"","proTip":""}],
"culture":[{"name":"","description":"","duration":"","admission":"","proTip":""}],
"nightlife":[{"name":"","description":"","vibe":"","proTip":""}],
"exploration":[{"name":"","description":"","bestTime":"","proTip":""}],
"experiences":[{"name":"","description":"","duration":"","price":"","bookAhead":true,"proTip":""}]
},
"practical":{"gettingAround":"","bestAreas":"","timing":"","budgetTips":"","localTips":"","weatherNote":"","bookAhead":""},
"photoSpots":[{"name":"","neighborhood":"","gps":"lat,lon","what":"","bestLight":"golden hour","goldenHourWindow":"","lens":"","proTip":""}],
"avoidList":["","",""]}`;

  const messageContent = imageBlocks.length > 0
    ? [...imageBlocks, { type: "text", text: promptText }]
    : promptText;

  return { messageContent, n, safeStart, safeEnd };
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
  const avoidText     = Array.isArray(a.interests?.avoidChips) && a.interests.avoidChips.length > 0
    ? a.interests.avoidChips.join(", ") : "nothing";
  const pace          = a.logistics?.pace     || "";
  const firstTime     = a.logistics?.firstTime || "";
  const kidsVal       = a.party?.kids         || "";
  const paceText      = pace      ? paceInstruction(pace)                          : "";
  const firstTimeText = firstTime ? firstTimeInstruction(a.destination, firstTime) : "";
  const kidsText      = kidsVal   ? kidsInstruction(kidsVal)                       : "";

  const allItems = Object.entries(trip.categories || {})
    .filter(([cat]) => !["breakfast","lunch","dinner"].includes(cat))
    .flatMap(([cat, items]) =>
      (Array.isArray(items) ? items : []).map(
        it => `[${cat.toUpperCase()}] ${it.name}: ${it.description}${it.proTip ? ` | TIP: ${it.proTip}` : ""}`
      )
    ).join("\n");

  const restaurantIdeas = ["breakfast","lunch","dinner"]
    .flatMap(meal => {
      const items = trip.categories?.[meal];
      if (!Array.isArray(items) || items.length === 0) return [];
      return items.map(it =>
        `[${meal.toUpperCase()}] ${it.name}: ${it.description}${it.mustOrder ? ` — order ${it.mustOrder}` : ""}`
      );
    }).join("\n");

  const TABLE_BLOCK = `TABLE:\n| Time | Activity | Details |\n|------|----------|----------|\n| [time] | **Place** | facts only, duration |\nENDTABLE`;
  const FOOD_BLOCK  = `FOOD:\n| Meal | Name | Order | Price |\n|------|------|-------|-------|\n| Breakfast | **Name** | what to order | $ |\n| Lunch | **Name** | what to order | $$ |\n| Dinner | **Name** | what to order | $$$ |\nENDFOOD`;

  return `You are a travel planner. Regenerate ONE day of an itinerary for ${trip.destination}.

CHANGE INSTRUCTION: ${instruction || "Refresh with new activity ideas — keep the same spirit but swap out the specific activities"}

CURRENT DAY (replace this entirely):
${dayContent}

TRAVELER
- Destination: ${a.destination}
- Party: ${arr(a.party)}${kidsVal ? ` · Kids: ${kidsVal}` : ""}
- Budget: ${budgetLabel}
- Staying: ${stayLine || "not specified"}
- Transport: ${transportLine || "not specified"}${pace ? `\n- Pace: ${pace}` : ""}${firstTime ? `\n- First visit: ${firstTime}` : ""}
- Interests: ${arr(a.interests)}
- Avoid: ${avoidText}

APPLY THESE RULES:
PARTY: ${partyInstruction(a)}
ROUTING: ${stayInstruction(stayLine || "not specified")} ${transportInstruction(transportLine || "not specified")}
BUDGET: ${budgetInstruction(a.budget)}${paceText ? `\nPACE: ${paceText}` : ""}${firstTimeText ? `\nVISIT HISTORY: ${firstTimeText}` : ""}${kidsText ? `\nKIDS: ${kidsText}` : ""}
AVOID: Never suggest anything related to: ${avoidText}.

ACTIVITIES TO USE:
${allItems || `Use your knowledge of ${a.destination}`}

RESTAURANT IDEAS:
${restaurantIdeas || `Use your knowledge of restaurants in ${a.destination}`}

STRICT OUTPUT RULES:
- Return ONLY the replacement day content. Nothing before or after.
- Start with the exact day header: ## ${dayLabel}
- Use the same format as the original:

## ${dayLabel}

${TABLE_BLOCK}

${FOOD_BLOCK}

TIPS: [practical tip] | [logistics tip]

- 3 to 5 activities max. No filler phrases. Facts only.
- Bold place names inside table cells using **Name**
- ACCURACY: Only recommend venues you are confident are currently operating.`;
}

/**
 * Build the plan generation prompt for a given mode.
 * editInstruction — optional free-text change instruction (for Full Itinerary / Specific Activities edits)
 * editType        — "activities" | null  (controls how the instruction is framed)
 */
export function buildPlanPrompt(mode, trip, editInstruction = null, editType = null) {
  const a = trip.answers;
  const restaurantBins = ["breakfast", "lunch", "dinner"];

  const allItems = Object.entries(trip.categories || {})
    .filter(([cat]) => !restaurantBins.includes(cat))
    .flatMap(([cat, items]) =>
      (Array.isArray(items) ? items : []).map(
        it => `[${cat.toUpperCase()}] ${it.name}: ${it.description}${it.proTip ? ` | TIP: ${it.proTip}` : ""}`
      )
    )
    .join("\n");

  const restaurantIdeas = restaurantBins
    .flatMap(meal => {
      const items = trip.categories?.[meal];
      if (!Array.isArray(items) || items.length === 0) return [];
      return items.map(it =>
        `[${meal.toUpperCase()}] ${it.name}: ${it.description}${it.mustOrder ? ` — order ${it.mustOrder}` : ""}`
      );
    })
    .join("\n");

  const stayLine      = a.logistics?.stay || "";
  const transportLine = a.logistics?.transport ? arr(a.logistics.transport) : "";
  const budgetLabel   = a.budget === 0 ? "staying with family/friends" : `~${a.budget} USD/day`;
  const avoidText     = Array.isArray(a.interests?.avoidChips) && a.interests.avoidChips.length > 0
    ? a.interests.avoidChips.join(", ")
    : "nothing";
  const pace          = a.logistics?.pace     || "";
  const firstTime     = a.logistics?.firstTime || "";
  const kidsVal       = a.party?.kids         || "";
  const paceText      = pace      ? paceInstruction(pace)                          : "";
  const firstTimeText = firstTime ? firstTimeInstruction(a.destination, firstTime) : "";
  const kidsText      = kidsVal   ? kidsInstruction(kidsVal)                       : "";

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
  const FOOD_BLOCK  = `FOOD:\n| Meal | Name | Order | Price |\n|------|------|-------|-------|\n| Breakfast | **Name** | what to order | $ |\n| Lunch | **Name** | what to order | $$ |\n| Dinner | **Name** | what to order | $$$ |\nENDFOOD`;

  const modeInstructions = {
    full:   `Create a ${trip.nights}-night itinerary. Use the DAY HEADERS list for exact day labels. For each day:\n\n## Day N — [exact label from DAY HEADERS]\n\n${TABLE_BLOCK}\n\n${FOOD_BLOCK}\n\nTIPS: [practical tip] | [logistics tip]\n\nRules: 3–5 activities max per day. Food is suggestions only. Times realistic for ${a.destination}.`,
    day:    `Design the single best day possible in ${a.destination}. Output EXACTLY ONE day — no other days, no multi-day structure.\n\n## The Ideal Day — [Weekday, Month Date]\n\n${TABLE_BLOCK}\n\n${FOOD_BLOCK}\n\nTIPS: [practical tip] | [logistics tip]`,
    combo:  `Create 3 themed day combinations. For each:\n\n## [Theme name]\n[One sentence — what type of day this is]\n\n${TABLE_BLOCK}\n\n${FOOD_BLOCK}`,
    foodie: `Build a full restaurant reference.\n\n## Breakfast\n${TABLE_BLOCK}\n\n## Lunch\n${TABLE_BLOCK}\n\n## Dinner\n${TABLE_BLOCK}\n\n## Drinks\n${TABLE_BLOCK}`,
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
- Transport: ${transportLine || "not specified"}${pace ? `\n- Pace: ${pace}` : ""}${firstTime ? `\n- First visit: ${firstTime}` : ""}
- Interests: ${arr(a.interests)}
- Avoid: ${avoidText}
- Notes: ${a.notes || "none"}
- Season: ${trip.season || ""}

APPLY THESE RULES TO THE ITINERARY:

PARTY: ${partyInstruction(a)}

ROUTING: ${stayInstruction(stayLine || "not specified")} ${transportInstruction(transportLine || "not specified")}
${paceText ? `\nPACE: ${paceText}` : ""}
${firstTimeText ? `VISIT HISTORY: ${firstTimeText}` : ""}
${kidsText ? `KIDS: ${kidsText}` : ""}
TEMPORAL GROUNDING: Today is ${today}. Trip dates: ${safeStart} → ${safeEnd}.${mode === "full" && dayHeaderBlock ? `\n${dayHeaderBlock}` : ""} Always use these exact day labels — never guess or infer day-of-week independently.

ACCURACY RULES:
- OPERATING HOURS: Before placing a venue in a time slot, verify it is open on that specific day of week and at that time. Many restaurants do not serve dinner on Sundays; museums are often closed Mondays or Tuesdays; brunch-only spots cannot fill a dinner slot. If a venue's hours make a slot implausible, substitute a different option from the same category.
- LIVE EVENTS: Never assert that a specific sports game, concert, or ticketed event is scheduled on a particular date — team schedules, touring dates, and event lineups change. Instead write: "Check schedule: [venue or team name]" as an optional add-on.
- CLOSED VENUES: Do not recommend any bike-share program, transit app, or dining establishment you cannot confidently confirm is currently operating. Omit uncertain venues entirely rather than risk sending the traveler somewhere that no longer exists.

BUDGET: ${budgetInstruction(a.budget)}

AVOID: Never suggest anything related to: ${avoidText}.

ACTIVITIES TO USE:
${allItems || `Use your knowledge of ${a.destination}`}

RESTAURANT IDEAS:
${restaurantIdeas || `Use your knowledge of restaurants in ${a.destination}`}

STRICT OUTPUT RULES:
- Tables exactly as shown with TABLE/ENDTABLE and FOOD/ENDFOOD markers
- 3 to 5 activities per day max
- Bold place names inside table cells using **Name**
- TIPS line format: TIPS: tip one | tip two${editInstruction ? `

${editType === "activities"
  ? `ACTIVITY EDIT: ${editInstruction}\nAdjust ONLY the activities described. Keep all other days and activities unchanged. If an exact match cannot be found, replace the closest activity in the same time slot.`
  : `EDIT INSTRUCTION: ${editInstruction}\nApply this change throughout the itinerary while keeping the same structure, format, and day count.`
}` : ""}`;
}
