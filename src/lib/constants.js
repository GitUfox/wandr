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
    sub:"Select all that apply",
    type:"chips+text",
    opts:["Solo","Partner / couple","Friends (small group)","Group (4+)","Family"],
    ph:"e.g. Me, my partner, and one other couple",
  },
  {
    id:"logistics",
    q:"Where are you staying & how are you getting around?",
    sub:"Accommodation and transport — both help us plan realistic days",
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
      { label:"Food & Drink",      opts:["Fine dining","Street food & markets","Coffee culture","Craft cocktails & wine","Cooking / food experiences"] },
      { label:"Outdoors & Active", opts:["Hiking & nature","Beaches & water","Adventure sports"] },
      { label:"Culture & Arts",    opts:["History & museums","Contemporary art","Architecture","Music & live shows","Festivals & events"] },
      { label:"Local Life",        opts:["Local neighbourhoods","Photography","Shopping","Nightlife","Wellness & spas"] },
      { label:"Sports & Events",   opts:["Live sports"] },
    ],
  },
  {
    id:"notes",
    q:"Anything else we should know?",
    sub:"Must-dos, sporting events, special occasions, dietary needs, vibe — anything",
    type:"textarea+upload",
    ph:"e.g. Want to catch a live match · Anniversary trip · Vegetarian · Love slow mornings · First time abroad",
  },
];

// ── Activity category config ──────────────────────────────────────────────────
export const CATS = {
  breakfast:   { label:"Breakfast spots",  col:"#f4a86a", bg:"#2a1f15", border:"#4a3020" },
  lunch:       { label:"Lunch spots",       col:"#7dd87a", bg:"#152015", border:"#254025" },
  dinner:      { label:"Dinner spots",      col:"#e89be8", bg:"#221525", border:"#402040" },
  nature:      { label:"Nature & hiking",   col:"#5ecfbe", bg:"#0d2420", border:"#1a4038" },
  culture:     { label:"Culture",            col:"#b89cf5", bg:"#1e1a30", border:"#352a50" },
  nightlife:   { label:"Music & nightlife", col:"#7ab8f0", bg:"#141e2e", border:"#243448" },
  exploration: { label:"Exploration",       col:"#f0d060", bg:"#242010", border:"#404020" },
  experiences: { label:"Experiences",        col:"#f08080", bg:"#251515", border:"#402020" },
};

// ── Plan generation modes ─────────────────────────────────────────────────────
export const MODES = [
  { id:"full",   label:"Full itinerary",     desc:"Every day planned, morning to night" },
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
