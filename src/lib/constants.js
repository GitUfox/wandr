// ── Feature flags ─────────────────────────────────────────────────────────────
// Kill switches for in-progress features. Flip to false to fall back instantly.
export const FEATURES = {
  editableItinerary: true, // render the Full itinerary as editable blocks (else read-only Md)
  venueGrounding:    true, // verify venues via /api/places after build (no-op until the server key exists)
  planCheck:         true, // show the traveler-facing plan check strip (§15 #13/#14)
};

// ── Activities per day, by pace ──────────────────────────────────────────────
// Single source of truth. These numbers used to be written in four places —
// paceInstruction() said "max 2–3" for Slow while the mode rules, the strict
// output rules, and the day-edit rules all said a flat "3 to 5". The model
// averaged the contradiction and returned 4 activities on a Slow trip.
// prompts.js interpolates these; planQuality.js scores against them.
export const PACE_BANDS = {
  Slow:     [2, 3],
  Balanced: [3, 4],
  Fast:     [4, 6],
};
export const DEFAULT_PACE = "Balanced";

/** [min, max] activities per day for a pace label (unknown → Balanced). */
export function paceBand(pace) {
  return PACE_BANDS[pace] || PACE_BANDS[DEFAULT_PACE];
}

// ── Venue grounding (PHASE2_PLANNING §12, phase 1) ───────────────────────────
export const GROUNDING = {
  // Which trip-DB categories get verified. Phase 1 grounded culture only so a
  // miss meant our matching was wrong, not Google's coverage — that bet paid
  // out 2026-08-13 (two matcher bugs found+fixed on the first live run), so
  // phase 2 grounds every category the build can emit. Quota math at the slim
  // schema's "3 items max per category": ≤15 lookups/build, ≤90/day at the
  // 6-builds/IP/day limit ≈ 2.7K/month worst case vs 5K/month free (Text
  // Search Pro SKU), before the 30-day venue cache. Effectively $0.
  categories: ["nature", "culture", "nightlife", "exploration", "experiences"],
  // Client-side mirror of MAX_VENUES_PER_REQUEST in api/places-shared.js —
  // keep the two in sync. Over-limit requests 400 and lose ALL grounding for
  // the build, so collectVenues trims to this (essentials first) instead.
  maxPerRequest: 40,
  // Hard ceiling on how long verification may delay a build. It runs inside
  // the ~44s build await (blocking on purpose — single state write, no race
  // with navigation); on timeout the trip proceeds ungrounded.
  timeoutMs: 8000,
};

// ── Bucket List mode (2026-08-15, fork pick 1F) ──────────────────────────────
// A bucket trip is a place + a curated activity list — zero date DNA. The
// canonical category order for the bucket board. Deliberately NOT merged with
// GROUNDING.categories: that list is "what gets verified" (quota config, may
// shrink), this one is "how the board reads" (presentation, stable).
export const BUCKET_CATS = [
  ["culture",     "Culture"],
  ["nature",      "Nature"],
  ["exploration", "Exploration"],
  ["experiences", "Experiences"],
  ["nightlife",   "Nightlife"],
];

// ── Design tokens ────────────────────────────────────────────────────────────
export const T = {
  bg0:"#0d0d0d", bg1:"#171717", bg2:"#1f1f1f", bg3:"#2a2a2a",
  border:"#333333", border2:"#444444",
  accent:"#c96442", accentHover:"#e07050",
  ink:"#efefef", muted:"#a0a0a0", hint:"#555555",
  white:"#ffffff", font:"'Manrope',sans-serif",

  // Type ramp (design-sweep S1). The app once had 25 distinct font sizes;
  // new/edited styles must pick from this ramp — no ad-hoc sizes.
  //   micro  — letterspaced uppercase kickers/stubs ONLY (never body text)
  //   label  — section labels, chips
  //   meta   — timestamps, hints, captions
  //   body   — default reading size
  //   ui     — buttons, card titles
  //   title  — screen/section titles
  //   hero   — the destination reveal
  // 2026-08-10 readability pass (Kraig: "the font is so small… bring it up"):
  // whole ramp stepped +1, hero untouched. Bump here, never per-component.
  fs: { micro:10, label:11.5, meta:12.5, body:13.5, ui:15, title:18, hero:28 },

  // Radius tokens (S2): control 6 · card/input 12 · sheet/ticket 16 · pill 100.
  r: { sm:6, md:12, lg:16, pill:100 },
};

// ── Interest taxonomy ────────────────────────────────────────────────────────
// One home for the 9-group tag list. Both the interview step and the Trip
// Details edit sheet render it through InterestsPicker, so a taxonomy change
// reaches every surface at once.
export const INTERESTS_GROUPS = [
  { label:"Active",    defaultCount:5, opts:["Golf","Pickleball","Tennis","Rock climbing","Cycling","Volleyball","Batting cages","Bowling","Kayaking"] },
  { label:"Spectate",  defaultCount:4, opts:["Baseball","Basketball","Football","Spring training","Hockey","Soccer","College sports"] },
  { label:"Outdoors",  defaultCount:4, opts:["Hiking","Desert","Trails","Lake","Beach","Camping","Stargazing","Water park","Tubing"] },
  { label:"Tours",     defaultCount:4, opts:["ATV","Horseback","Ghost tour","Jeep tour","Segway","Helicopter","Boat tour","Historic tour"] },
  { label:"Arts",      defaultCount:4, opts:["Museums","Theater","Live music","Galleries","Architecture","Public art","Festivals"] },
  { label:"Nightlife", defaultCount:4, opts:["Bars","Breweries","Clubs","Cocktails","Wineries","Casino","Pool club"] },
  { label:"Wellness",  defaultCount:4, opts:["Spa","Yoga","Hot springs","Meditation"] },
  { label:"Games",     defaultCount:2, opts:["Escape room","Mini golf","Axe throwing","Comedy","Arcade"] },
  { label:"Local",     defaultCount:3, opts:["Shopping","Markets","Scenic views","Neighborhoods","Zoo"] },
];

// ── Interview steps ───────────────────────────────────────────────────────────
export const STEPS = [
  {
    id:"dates",
    q:"When are you going?",
    type:"daterange",
  },
  {
    id:"party",
    q:"Who's going?",
    type:"chips+text",
    singleSelect:true,
    opts:["Solo","Couple","Friends","Group","Family"],
    ph:"Add any details",
  },
  {
    id:"logistics",
    q:"How do you like to travel?",
    type:"logistics",
  },
  {
    id:"budget",
    q:"What's your daily budget?",
    sub:"Per person, per day — activities and experiences",
    type:"budget",
  },
  {
    id:"interests",
    q:"What do you enjoy?",
    type:"chips+text",
    ph:"e.g. Love record shops, live football, architecture",
    // Groups are UI navigation only — a selected chip is stored as a bare tag
    // string (see App.jsx `chips`), same as before this taxonomy expanded.
    // `defaultCount` = how many of `opts` (ordered default-first) render
    // before the "Show N more" toggle in InterviewFlow.jsx.
    groups: INTERESTS_GROUPS,
  },
  {
    id:"notes",
    q:"Anything else?",
    type:"textarea+upload",
    ph:"e.g. Want to catch a live match · Anniversary trip · Love slow mornings",
  },
];

// ── Plan generation modes ─────────────────────────────────────────────────────
// Only "full" ships today — it's the core experience. The other modes are
// back-burnered on the roadmap (see FUTURE_MODES). Their prompt logic still
// lives in prompts.js (modeInstructions), so reviving any of them is just a
// matter of moving the entry back into MODES — no prompt work required.
export const MODES = [
  { id:"full",   label:"Full itinerary",     desc:"Every day planned, morning to night" },
];

// Back-burner roadmap — not surfaced in the UI. Do not delete: the matching
// prompt branches in prompts.js (modeInstructions) are kept in sync with these.
export const FUTURE_MODES = [
  { id:"day",    label:"Perfect single day", desc:"The one ideal day, hour by hour" },
  { id:"combo",  label:"Activity combos",    desc:"3 themed days or standout picks" },
  { id:"hidden", label:"Off the beaten path",desc:"Local secrets most visitors miss" },
];

// ── Budget tiers ──────────────────────────────────────────────────────────────
// Single source of truth for the budget selector — shared by the intake
// interview (step 4) and the rebuild sheet (Trip Details) so the two can
// never drift. `value` is the per-person daily USD figure stored on the trip.
export const BUDGET_TIERS = [
  { value: 40,  label: "Local",       price: "~$30–50 / day",  desc: "Free sights, local spots" },
  { value: 120, label: "Comfortable", price: "~$75–120 / day", desc: "Standard paid attractions" },
  { value: 300, label: "Splurge",     price: "~$200+ / day",   desc: "Premium experiences, no expense spared" },
];

// Snap an arbitrary stored budget (incl. legacy slider values) to the nearest
// tier, so a card is always selected. Defaults to Comfortable when unset.
export function nearestBudgetTier(budget) {
  if (typeof budget !== "number") return 120;
  return BUDGET_TIERS.reduce((best, t) =>
    Math.abs(t.value - budget) < Math.abs(best - budget) ? t.value : best,
    BUDGET_TIERS[0].value);
}

// ── AI disclaimer ─────────────────────────────────────────────────────────────
// ONE string for every surface (itinerary footer, PDF footer). Two hand-typed
// copies of this sentence had already drifted apart once — never inline it.
export const AI_DISCLAIMER =
  "AI-planned — always verify opening hours, prices, and details with venues before your trip.";

// ── Loading messages ──────────────────────────────────────────────────────────
export const LOAD_MSGS = [
  "Researching your destination…",
  "Curating local gems…",
  "Building activity database…",
  "Personalising to your interests…",
  "Filtering out the noise…",
  "Crafting insider tips…",
  "Putting it all together…",
];

// ── Welcome screen destination placeholders ───────────────────────────────────
export const DEST_PLACEHOLDERS = [
  "Los Angeles","Mexico City","Miami","London","Oslo",
  "Lisbon","Istanbul","Bangkok","Sydney","Hong Kong",
];
