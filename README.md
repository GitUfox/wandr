# Wandr ✈️

> AI-powered travel planning. Personalised itineraries, local picks, photo spots.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Set up your API key
cp .env.example .env.local
# Edit .env.local and add your Anthropic key

# 3. Run
npm run dev
# → http://localhost:3000
```

---

## Project structure

```
wandr/
├── src/
│   ├── App.jsx                  # Root — screen router + all state
│   ├── main.jsx                 # React entry point
│   ├── index.css                # Global styles, CSS variables, keyframes
│   │
│   ├── components/
│   │   ├── WelcomeScreen.jsx    # Landing page, destination input, feature pills
│   │   ├── LoadingScreen.jsx    # Spinner shown while buildTrip() runs
│   │   ├── Md.jsx               # Markdown renderer for plan output
│   │   │                          (handles TABLE/FOOD blocks, headers, bullets)
│   │   ├── InterviewFlow.jsx    # 6-step onboarding questionnaire  [TODO: extract]
│   │   └── Dashboard.jsx        # 3-tab results dashboard           [TODO: extract]
│   │
│   ├── hooks/
│   │   ├── useBuildTrip.js      # Builds the trip JSON database via API
│   │   ├── useGenerate.js       # Streaming plan generation
│   │   └── useFileUpload.js     # File reading, validation, state
│   │
│   └── lib/
│       ├── api.js               # Anthropic API client (complete + stream)
│       ├── constants.js         # STEPS, CATS, MODES, T (design tokens), LOAD_MSGS
│       ├── prompts.js           # buildTripPrompt(), buildPlanPrompt()
│       └── utils.js             # arr(), parseISODate(), calcNights(), recoverJSON()
│
├── public/                      # Static assets
├── index.html                   # HTML shell (Manrope font preloaded)
├── vite.config.js
├── package.json
├── .env.example                 # Copy to .env.local and add key
└── .gitignore
```

---

## Architecture overview

### Screen flow

```
WelcomeScreen
    ↓  (destination entered)
InterviewFlow  [6 steps]
    ↓  (advance() on last step)
LoadingScreen  (buildTrip() running)
    ↓  (trip JSON ready)
Dashboard      [3 tabs: Plan · Activities · Tips]
```

### Data flow

```
answers{}  →  buildTripPrompt()  →  Anthropic API  →  trip{}
trip{}     →  buildPlanPrompt()  →  Anthropic API (streaming)  →  planText
```

### Interview steps

| # | ID         | Type            | Notes                                   |
|---|------------|-----------------|---------------------------------------- |
| 1 | dates      | daterange       | Arrival + departure date pickers        |
| 2 | party      | chips+text      | 5 options + free text                   |
| 3 | logistics  | logistics       | Stay + transport (grouped icon cards)   |
| 4 | budget     | budget          | 5 card options (Budget → Hosted)        |
| 5 | interests  | chips+text      | Grouped by category + ❤️/🚫 toggle      |
| 6 | notes      | textarea+upload | Free text + optional file attachments   |

### Plan generation modes

| ID     | Label             | Description                        |
|--------|-------------------|------------------------------------|
| full   | Full itinerary    | Every day, morning to night        |
| day    | Perfect single day| The one ideal day, hour by hour    |
| combo  | Activity combos   | 3 themed days or standout picks    |
| foodie | Food & drink guide| Every meal and drink, mapped out   |
| hidden | Off the beaten path| Local secrets most visitors miss  |

---

## API key security

The API key is currently read from `VITE_ANTHROPIC_API_KEY` and sent directly
from the browser. **This is fine for local development.** For any public
deployment, route API calls through a backend proxy and remove the key from
the frontend:

```
Browser → your-backend/api/wandr → Anthropic API
```

---

## Next steps (suggested Claude Code tasks)

These are the natural next builds — give these prompts to Claude Code in order:

1. **Extract InterviewFlow**
   > "Extract the interview screen rendering from App.jsx into src/components/InterviewFlow.jsx. It should accept props: step, steps, answers, and all the step-specific state. Keep App.jsx as the state owner."

2. **Extract Dashboard**
   > "Extract the dashboard screen from App.jsx into src/components/Dashboard.jsx. Props: trip, planText, planMode, planLoading, onGenerate, onReset."

3. **Add framer-motion transitions**
   > "Add smooth screen transitions between welcome → interview → loading → dashboard using framer-motion AnimatePresence. Each screen should fade up. Install the package first."

4. **Wire up the env key in api.js**
   > "Update src/lib/api.js so it reads VITE_ANTHROPIC_API_KEY from import.meta.env and includes it as x-api-key in the request headers. Show a console warning if the key is missing."

5. **Add localStorage trip persistence**
   > "After a trip is successfully built, save it to localStorage as 'wandr_last_trip'. On app load, check for a saved trip and offer to restore it on the welcome screen."

---

## Design tokens

All colours and fonts live in `src/lib/constants.js` under the `T` object:

```js
T.bg0      // #0d0d0d  — page background
T.bg1      // #171717  — card background
T.bg2      // #1f1f1f  — input / chip background
T.bg3      // #2a2a2a  — elevated surface
T.accent   // #c96442  — Wandr orange
T.ink      // #efefef  — primary text
T.muted    // #a0a0a0  — secondary text
T.hint     // #555555  — labels, placeholders
T.border   // #333333  — default border
T.border2  // #444444  — emphasis border
```

Font: **Manrope** (preloaded in `index.html`)

---

*Last updated: May 2026*
