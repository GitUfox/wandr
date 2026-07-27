# Wandr — Copy / Scripting Library

Every user-facing word in the app, grouped by surface, with where it lives.
Use this to review tone and wording. Edit freely — this is a working doc.

> ⚠️ **Partly stale as of 2026-07-21.** Verified against the app during the
> phase-6 polish pass: the entries below for `Dining for every meal` and
> `A complete day-by-day itinerary…` describe copy that no longer exists — food
> was removed in `f9ddd76` and the value line in `775cf3a`. **The app is
> correct; this doc lagged.** Surfaces added since (trip switcher, offline
> notices, PWA install, Trip Details interests) are not captured here yet.
> Treat it as a partial snapshot, not a source of truth.

Legend for "Source": file where the string is defined.

---

## 1. Welcome screen
Source: `src/components/WelcomeScreen.jsx`, placeholders from `src/lib/constants.js` (`DEST_PLACEHOLDERS`)

| Phrase | Where shown |
|--------|-------------|
| `Make it your trip.` | Tagline under logo |
| `Where to?` | Destination field label |
| `Oslo · Kyoto · Lisbon · Istanbul · Bangkok · Buenos Aires · Cape Town · Marrakech · Reykjavik · Porto` | Cycling placeholder in destination field |
| `Let's go →` | Primary CTA (appears once a destination is typed) |
| `Resume: [destination]` | Resume-last-trip button |
| `A complete day-by-day itinerary, built around how you actually travel.` | Value line under CTA |
| `?` | Help button (top-right) → opens About panel |
| `What Wandr does` | About panel title |
| `Answer a few quick questions and Wandr builds you a personal trip — tailored to your pace, budget, and what you actually care about.` | About panel intro |
| `A day-by-day itinerary` / `Every day planned, morning to night` | About panel item 1 |
| `Dining for every meal` / `Where to eat and what to order, to your budget` | About panel item 2 |
| `Tips built into each day` / `Timing, getting around, and what to skip` | About panel item 3 |

---

## 2. Interview — shared chrome
Source: `src/components/InterviewFlow.jsx`

| Phrase | Where shown |
|--------|-------------|
| `Wandr` | Breadcrumb (top-left, returns to welcome) |
| `N / 6` | Step counter |
| `← Back` | Back button |
| `Continue →` | Advance button (steps 1–5) |
| `Build my trip →` | Advance button (step 6) |
| `Optional — tap Continue to skip` | Hint under step 6 |

---

## 3. Interview steps
Source: `src/lib/constants.js` (`STEPS`), rendered by `InterviewFlow.jsx`

### Step 1 — Dates
| Phrase | Role |
|--------|------|
| `When are you going?` | Question |
| `We'll build an itinerary that fits your exact window` | Subtitle |
| `ARRIVAL` / `DEPARTURE` | Field labels |
| `Select date` | Empty date button |
| `Pick your arrival date` / `Now pick your departure` | Calendar hint |
| `Clear` / `Done` | Calendar actions |
| `N nights` | Computed nights readout |

### Step 2 — Party
| Phrase | Role |
|--------|------|
| `Who's on this trip?` | Question |
| `Pick the one that best describes your group` | Subtitle |
| `Solo` · `Partner / couple` · `Friends (small group)` · `Group (4+)` · `Family` | Options |
| `e.g. Me, my partner, and one other couple` | Free-text placeholder |
| `Any kids in the group?` | Sub-question (non-Solo) |
| `No kids` · `Yes — under 5` · `Yes — 5 to 12` · `Yes — teens` | Kids options |

### Step 3 — Logistics
| Phrase | Role |
|--------|------|
| `How do you like to travel?` | Question |
| `Getting around, pace, and accommodation shape every day` | Subtitle |
| `GETTING AROUND` → `Got a car` · `Transit & rideshare` · `Walking & cycling` | Group + options |
| `PACE` → `Slow & wandering` · `Balanced` · `Pack it in` | Group + options |
| `FIRST TIME THERE?` → `First visit` · `Been before` | Group + options |
| `HOME BASE · optional` | Field label |
| `Airbnb in Trastevere · Hotel near city centre · Staying with family` | Placeholder |

### Step 4 — Budget
| Phrase | Role |
|--------|------|
| `Daily spend per person?` | Question |
| `Food, activities, drinks — accommodation is separate unless you're paying for it` | Subtitle |
| `Local` · `~$30–50 / day` · `Street food, free sights, local spots` | Tier 1 |
| `Comfortable` · `~$75–120 / day` · `Sit-down restaurants, paid attractions` | Tier 2 (default) |
| `Splurge` · `~$200+ / day` · `Fine dining, premium & private experiences` | Tier 3 |
| `Hosted` · `Staying with locals, flexible spend` | Tier 4 |

### Step 5 — Interests
| Phrase | Role |
|--------|------|
| `What lights you up?` | Question |
| `Pick your categories — or describe below` | Subtitle |
| `Food & Drink` → Street food & markets · Sit-down dining · Coffee culture · Cocktails & wine · Cooking experiences | Group |
| `Outdoors & Active` → Hiking & nature · Beaches & water · Adventure sports · Day trips & excursions | Group |
| `Culture & Arts` → History & museums · Architecture · Contemporary art · Music & live shows · Festivals & events · Live sports | Group |
| `Local Life` → Photo spots & scenic routes · Nightlife · Shopping · Wellness & spas | Group |
| `N interests selected` | Selection counter |
| `e.g. Love craft beer bars, record shops, live football` | Free-text placeholder |

### Step 6 — Notes
| Phrase | Role |
|--------|------|
| `Anything else we should know?` | Question |
| `Must-dos, dietary needs, special occasions, vibe — anything` | Subtitle |
| `e.g. Want to catch a live match · Anniversary trip · Love slow mornings` | Notes placeholder |
| `Attach files (itinerary, bookings, photos)` / `+ Add another file` | Upload |
| `ANYTHING TO AVOID?` | Avoid field label |
| `e.g. crowds · seafood · long hikes · touristy spots` | Avoid placeholder |
| `Hard no's — we'll keep these out of every suggestion.` | Avoid helper text |

---

## 4. Loading screen
Source: `src/components/LoadingScreen.jsx` + `src/lib/constants.js` (`LOAD_MSGS`)

| Phrase | Role |
|--------|------|
| `Building your guide for [destination]` | Subtitle |
| `Researching your destination…` · `Curating local gems…` · `Building activity database…` · `Personalising to your interests…` · `Filtering out the noise…` · `Crafting insider tips…` · `Putting it all together…` | Rotating status messages |

---

## 5. Dashboard — header
Source: `src/components/Dashboard.jsx`

| Phrase | Role |
|--------|------|
| `YOUR TRIP` | Eyebrow label |
| `[destination]` / `[tagline]` | Title + subtitle (from build) |
| `Edit trip` / `New trip` | Header actions |
| `DATES` · `NIGHTS` · `BUDGET` · `PARTY` · `SEASON` | Stat labels |
| `~X USD/day` / `With family/friends` | Budget value |
| `Couldn't load full trip data — some sections may be missing. Tap a plan mode below to generate your itinerary anyway.` | Error banner |

---

## 6. Dashboard — tabs & Plan
Source: `src/components/Dashboard.jsx`, modes from `constants.js` (`MODES`)

No tabs — the dashboard shows the itinerary directly (Activities + Tips removed).

| Phrase | Role |
|--------|------|
| `Full itinerary` / `Every day planned, morning to night` | Itinerary hero card |
| `Active` / `Generate →` / `…` | Hero card status pill |
| `Writing your [mode]…` | Itinerary loading text |
| `Copy` / `✓ Copied` / `Copy failed` | Copy-plan button |
| `Export PDF` | Export button |
| `AI-generated — always verify opening hours, prices, and details directly with venues before your trip.` | Itinerary disclaimer |

---

> **Removed:** the Activities and Tips tabs — along with the `CATS` category
> labels, the `★ Must-do` badge, photo spots, and practical-tips copy that lived
> in them. The trip build still generates `categories` (the itinerary generator
> reads them), but they're no longer browsed directly in the UI.

---

## 7. Edit Trip sheet
Source: `src/components/EditTripSheet.jsx`

| Phrase | Role |
|--------|------|
| `Edit Trip` | Sheet title |
| `Specific Activities` / `Describe what to swap out` | Mode |
| `Specific Day` / `Redo one day from scratch` | Mode |
| `Full Itinerary` / `Adjust the overall feel` | Mode |
| `Trip Details` / `Destination, dates, budget, party` | Mode |
| `More relaxed` · `More foodie` · `Less touristy` · `More adventurous` · `More budget-friendly` · `More outdoor activities` | Vibe quick-chips |
| `Apply Changes` · `Redo This Day` · `Regenerate` · `Rebuild Trip` | Action buttons |
| `Generate a plan first` | Guard message |

---

## 10. Errors & system messages
Sources: `src/lib/api.js`, `src/hooks/*`, `src/lib/utils.js`, `src/components/ErrorBoundary.jsx`

| Phrase | Trigger |
|--------|---------|
| `Something went wrong` | ErrorBoundary fallback |
| `No response from AI. Please try again.` | Empty AI response |
| `Couldn't reach the AI service. Please try again.` | Network error (build) |
| `Daily limit reached. Try again later.` | Rate limit (429) |
| `Something went wrong on our end. Please try again.` | Server error (5xx) |
| `Something went wrong. Please try again.` | Generic fallback |
| `Couldn't connect to the server. Please check it's running and try again.` | Generate network error |
| `Something went wrong generating your plan. Please try again.` | Generate failure |
| `Couldn't reach the server. Please check it's running and try again.` | Day-edit network error |
| `Something went wrong updating the day. Please try again.` | Day-edit failure |
| `Couldn't read the trip data. You can still generate a plan below.` | JSON recovery failure |
