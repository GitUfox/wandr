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
    sub:"We'll build an itinerary that fits your exact window",
    type:"daterange",
  },
  {
    id:"party",
    q:"Who's on this trip?",
    sub:"Pick the one that best describes your group",
    type:"chips+text",
    singleSelect:true,
    opts:["Solo","Partner / couple","Friends (small group)","Group (4+)","Family"],
    ph:"e.g. Me, my partner, and one other couple",
  },
  {
    id:"logistics",
    q:"How do you like to travel?",
    sub:"Getting around, pace, and accommodation shape every day",
    type:"logistics",
  },
  {
    id:"budget",
    q:"Daily spend per person?",
    sub:"Food, activities, drinks — accommodation is separate unless you're paying for it",
    type:"budget",
  },
  {
    id:"interests",
    q:"What lights you up?",
    sub:"Pick your categories — or describe below",
    type:"chips+text",
    ph:"e.g. Love craft beer bars, record shops, live football",
    groups:[
      { label:"Food & Drink",      opts:["Street food & markets","Sit-down dining","Coffee culture","Cocktails & wine","Cooking experiences"] },
      { label:"Outdoors & Active", opts:["Hiking & nature","Beaches & water","Adventure sports","Day trips & excursions"] },
      { label:"Culture & Arts",    opts:["History & museums","Architecture","Contemporary art","Music & live shows","Festivals & events","Live sports"] },
      { label:"Local Life",        opts:["Photo spots & scenic routes","Nightlife","Shopping","Wellness & spas"] },
    ],
  },
  {
    id:"notes",
    q:"Anything else we should know?",
    sub:"Must-dos, dietary needs, special occasions, vibe — anything",
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
  "Oslo","Kyoto","Lisbon","Istanbul","Bangkok",
  "Buenos Aires","Cape Town","Marrakech","Reykjavik","Porto",
];
