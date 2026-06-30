// ── Feature flags ─────────────────────────────────────────────────────────────
// Kill switches for in-progress features. Flip to false to fall back instantly.
export const FEATURES = {
  editableItinerary: true, // render the Full itinerary as editable blocks (else read-only Md)
};

// ── Design tokens ────────────────────────────────────────────────────────────
export const T = {
  bg0:"#0d0d0d", bg1:"#171717", bg2:"#1f1f1f", bg3:"#2a2a2a",
  border:"#333333", border2:"#444444",
  accent:"#c96442", accentHover:"#e07050",
  ink:"#efefef", muted:"#a0a0a0", hint:"#555555",
  white:"#ffffff", font:"'Manrope',sans-serif",
};

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
    sub:"Per person, per day — food, activities, and drinks",
    type:"budget",
  },
  {
    id:"interests",
    q:"What do you enjoy?",
    type:"chips+text",
    ph:"e.g. Love craft beer bars, record shops, live football",
    groups:[
      { label:"Food & Drink",      opts:["Street food & markets","Sit-down dining","Cafés & coffee","Cocktails & wine","Cooking experiences"] },
      { label:"Outdoors & Active", opts:["Hiking & nature","Beaches & water","Adventure sports","Day trips"] },
      { label:"Culture & Arts",    opts:["History & museums","Architecture","Art & galleries","Live music & theatre","Festivals & events","Sports"] },
      { label:"Local Life",        opts:["Scenic views","Nightlife","Shopping","Wellness"] },
    ],
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
  { id:"foodie", label:"Food & drink guide", desc:"Every meal and drink, mapped out" },
  { id:"hidden", label:"Off the beaten path",desc:"Local secrets most visitors miss" },
];

// ── Budget tiers ──────────────────────────────────────────────────────────────
// Single source of truth for the budget selector — shared by the intake
// interview (step 4) and the rebuild sheet (Trip Details) so the two can
// never drift. `value` is the per-person daily USD figure stored on the trip.
export const BUDGET_TIERS = [
  { value: 40,  label: "Local",       price: "~$30–50 / day",  desc: "Street food, free sights, local spots" },
  { value: 120, label: "Comfortable", price: "~$75–120 / day", desc: "Sit-down restaurants, paid attractions" },
  { value: 300, label: "Splurge",     price: "~$200+ / day",   desc: "Fine dining, premium experiences" },
];

// Snap an arbitrary stored budget (incl. legacy slider values) to the nearest
// tier, so a card is always selected. Defaults to Comfortable when unset.
export function nearestBudgetTier(budget) {
  if (typeof budget !== "number") return 120;
  return BUDGET_TIERS.reduce((best, t) =>
    Math.abs(t.value - budget) < Math.abs(best - budget) ? t.value : best,
    BUDGET_TIERS[0].value);
}

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
