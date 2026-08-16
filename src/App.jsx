// Wandr v3.1 — framer-motion screen + step transitions
import { useState, useRef, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { STEPS, MODES, T } from "./lib/constants.js";
import { calcNights, carryBucketPicks } from "./lib/utils.js";
import { loadTripStore, persistTrip, getActiveTrip, listTrips, activateTripId, deleteTrip } from "./lib/tripStore.js";
import { useAccount } from "./hooks/useAccount.js";
import { recordDeletion, scheduleSyncPush } from "./lib/sync.js";
import { useBuildTrip } from "./hooks/useBuildTrip.js";
import { useGenerate } from "./hooks/useGenerate.js";
import { useFileUpload } from "./hooks/useFileUpload.js";
import { useLocalEvents } from "./hooks/useLocalEvents.js";
import { checkPlan } from "./lib/planQuality.js";
import WelcomeScreen from "./components/WelcomeScreen.jsx";
import InterviewFlow from "./components/InterviewFlow.jsx";
import Dashboard from "./components/Dashboard.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

const GF = "https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap";

const GLOBAL_CSS = `
  html,body,#root{background:${T.bg0}!important;margin:0;padding:0;min-height:100vh;width:100%}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes blink{50%{opacity:0}}
  .fade-up{animation:fadeUp .25s ease forwards}
  *{box-sizing:border-box}
`;

// Shared page transition: fade + subtle lift
const PAGE_VARIANTS = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
};
const PAGE_TRANSITION = { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] };

function Page({ children }) {
  // Dev-only escape hatch. Automation harnesses throttle rAF, which freezes
  // framer's frameloop — screens stay at opacity 0 and AnimatePresence
  // mode="wait" never swaps, making any browser verification of a non-welcome
  // screen impossible. `VITE_NO_MOTION=1 npm run dev` renders plain divs
  // instead. Vite inlines the env var, so this branch is absent from the
  // production bundle (verified: 0 occurrences in dist).
  if (import.meta.env.VITE_NO_MOTION) {
    return <div style={{ position: "absolute", inset: 0, minHeight: "100vh", width: "100%", overflowY: "auto" }}>{children}</div>;
  }
  return (
    <motion.div
      variants={PAGE_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={PAGE_TRANSITION}
      style={{ position: "absolute", inset: 0, minHeight: "100vh", width: "100%", overflowY: "auto" }}
    >
      {children}
    </motion.div>
  );
}

// Trip persistence lives in lib/tripStore.js — multi-trip shape (wandr_trips)
// with per-trip plan keys, migrating the legacy single-trip keys on first load.

// ── Profile (saved preferences) ───────────────────────────────────────────────
// The profile is a plain snapshot of the profile-backed answer fields, in the
// exact shapes prompts.js already consumes — so it needs no migration when
// those shapes evolve. It's the default fill for a returning user's interview.
const PROFILE_KEY = "wandr_profile";
const PROFILE_DECLINED_KEY = "wandr_profile_declined";

// Steps whose answers come from the saved profile — skipped in "continue" mode.
// dates is always trip-specific; notes is always shown (add something for THIS trip).
const PROFILE_BACKED_STEP_IDS = ["party", "logistics", "budget", "interests"];

function loadProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch { return null; }
}

// Snapshot the profile-backed fields from a completed answers object.
function saveProfile(answers) {
  try {
    const profile = {
      version:   1,
      party:     answers.party,
      logistics: answers.logistics,
      budget:    answers.budget,
      interests: answers.interests,
      avoid:     answers.avoid || "",
      savedAt:   new Date().toISOString(),
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return profile;
  } catch { return null; }
}

export default function Wandr() {
  // ── Screen + interview state ──────────────────────────────────────────────
  const [screen, setScreen]   = useState("welcome");
  const [step, setStep]       = useState(0);
  const [direction, setDir]   = useState(1); // 1 = forward, -1 = back
  const [answers, setAnswers] = useState({});

  // Per-step form state
  const [cur, setCur]                     = useState("");
  const [chips, setChips]                 = useState([]);
  const [priorityChips, setPriorityChips] = useState([]); // starred interests — win conflicts
  const [teams, setTeams]                 = useState([]); // favorite MLB teams (shown when Baseball selected)
  const [kids, setKids]                   = useState("");
  const [avoidText, setAvoidText]         = useState("");
  const [budget, setBudget]               = useState(120);
  const [d1, setD1]                       = useState("");
  const [d2, setD2]                       = useState("");
  // Bucket List mode's dates-step answers (Kraig's spec, 2026-08-15):
  // "now?" yes/no; on no, an optional free-text "when?" — never a date.
  const [bucketNow, setBucketNow]         = useState("");   // "" | "now" | "later"
  const [bucketWhen, setBucketWhen]       = useState("");
  const [logStay, setLogStay]             = useState("");
  const [logTransport, setLogTransport]   = useState("");
  const [logPace, setLogPace]             = useState("");
  const [logFocus, setLogFocus]           = useState("");
  const [logRhythm, setLogRhythm]         = useState("");

  // Trip + dashboard. tripStore holds every saved trip; savedTrip is the active
  // one, which is what the welcome screen offers to resume. Phase 1 keeps the
  // single-trip UX identical — the extra trips are stored but not yet surfaced
  // (the trip switcher is phase 2).
  const [trip, setTrip]               = useState(null);
  const [tripStore, setTripStore]     = useState(loadTripStore);
  const savedTrip                     = getActiveTrip(tripStore);
  const allTrips                      = listTrips(tripStore);

  // Profile state
  const [savedProfile, setSavedProfile]   = useState(loadProfile);
  const [interviewMode, setInterviewMode] = useState("fresh"); // "fresh" | "continue" | "edit"
  const [profilePromptDismissed, setProfilePromptDismissed] = useState(() => {
    try { return localStorage.getItem(PROFILE_DECLINED_KEY) === "1"; } catch { return false; }
  });

  const fileInputRef = useRef(null);
  const S = STEPS[step];

  // Accounts: no-op until Supabase env vars exist. After any completed sync,
  // re-read the store and profile so downloads from another device show up
  // without a reload. (Sync never touches the trip currently open on screen —
  // it only rewrites localStorage — so adopting here is race-free.)
  const account = useAccount();
  useEffect(() => {
    if (!account.lastSync) return;
    setTripStore(loadTripStore());
    setSavedProfile(loadProfile());
  }, [account.lastSync]);

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const { buildTrip: doBuildTrip, loadMsg, error: buildError } = useBuildTrip();
  const { planText, planModel, planMode, planLoading, patchError, tweakingId, generatedAt, generate: doGenerate, patchDay: doPatchDay, resetPlan, restorePlan, clearSavedPlan, editActivity, removeActivity, reorderDayActivities, moveActivity, moveActivityToBucket, tweakActivity } = useGenerate();
  const { games: tripGames, forPrompt: eventsForPrompt } = useLocalEvents(trip);

  // The auto-generate below fires from an async completion, where a captured
  // eventsForPrompt would be the stale unresolved value from build-start time.
  // The ref always holds the CURRENT fetch state — and because the skeleton
  // trip is set the moment the build begins, the MLB lookup gets the whole
  // build (~12–25s vs a ~1–2s fetch) to resolve before generation reads it.
  // buildEventsBlock still fail-safes to "no block" if it somehow hasn't.
  const eventsRef = useRef(eventsForPrompt);
  useEffect(() => { eventsRef.current = eventsForPrompt; });

  // Traveler-facing plan check (§15 #13/#14). DERIVED, never stored: a cached
  // result could outlive the plan it describes, and a stale "2 of 7 days" on a
  // freshly fixed itinerary is worse than no check at all. Recomputing covers
  // generate, day-patch, manual edit and restore through one path.
  // expectedDays is only meaningful for the full itinerary — the other modes
  // aren't day-counted, so they pass null and skip that check.
  const planIssues = useMemo(
    () => checkPlan(planModel, planMode === "full" ? trip?.nights ?? null : null).problems,
    [planModel, planMode, trip?.nights],
  );
  const { uploadedFiles, uploadError, handleFiles, removeFile, resetFiles } = useFileUpload();

  // ── Interview helpers ─────────────────────────────────────────────────────
  function currentVal() {
    if (S.type === "chips")      return chips;
    if (S.type === "chips+text") {
      if (S.id === "party")     return kids ? { chips, text: cur, kids } : { chips, text: cur };
      if (S.id === "interests") return { chips, text: cur, priorityChips, teams };
      return { chips, text: cur };
    }
    if (S.type === "daterange")  return answers.tripStyle === "bucket"
      ? { bucket: true, now: bucketNow === "now", whenText: bucketNow === "later" ? bucketWhen.trim() : "" }
      : { start: d1, end: d2 };
    if (S.type === "budget")     return budget;
    if (S.type === "logistics")  return { stay: logStay, transport: logTransport, pace: logPace, focus: logFocus, rhythm: logRhythm };
    return cur;
  }

  function isValid() {
    const v = currentVal();
    if (S.type === "chips")      return v.length > 0;
    if (S.type === "chips+text") return S.id === "interests"
      ? (chips.length > 0 || cur.trim().length > 1)
      : (v.chips.length > 0 || v.text.trim().length > 1);
    if (S.type === "daterange")  return answers.tripStyle === "bucket"
      ? bucketNow !== ""                       // yes/no answered; "when?" text stays optional
      : !!(d1 && d2 && d1.length >= 8 && d2.length >= 8 && d2 > d1);
    if (S.type === "budget")     return true;
    if (S.type === "logistics")  return true;
    if (S.id === "notes")        return true;
    return String(v).trim().length > 1;
  }

  // Rehydrate the shared per-step fields (cur/chips/kids/avoidText) from the
  // saved answers for a given step. Without this, navigating Back to a chip/text
  // step renders blank — the answer is in `answers` but the UI state was reset.
  // Logistics/budget/date state persist in their own vars, so aren't touched here.
  function hydrate(idx, src) {
    const st = STEPS[idx];
    const a = src[st.id];
    if (st.id === "party") {
      setChips(a?.chips || []); setCur(a?.text || ""); setKids(a?.kids || "");
    } else if (st.id === "interests") {
      setChips(a?.chips || []); setCur(a?.text || ""); setKids("");
    } else if (st.type === "chips") {
      setChips(Array.isArray(a) ? a : []); setCur(""); setKids("");
    } else if (st.type === "text" || st.type === "textarea+upload") {
      setCur(typeof a === "string" ? a : ""); setChips([]); setKids("");
    } else {
      setChips([]); setCur(""); setKids("");
    }
    setPriorityChips(st.id === "interests" ? (a?.priorityChips || []) : []);
    setTeams(st.id === "interests" ? (a?.teams || []) : []);
    setAvoidText(st.id === "notes" ? (src.avoid || "") : "");
  }

  // Stage the current step's edits into answers, returning the merged object.
  function stageCurrent() {
    const newAns = { ...answers, [S.id]: currentVal() };
    if (S.id === "notes") newAns.avoid = avoidText.trim();
    return newAns;
  }

  // In "continue" mode, profile-backed steps are pre-answered — skip over them.
  // Guards keep the result within [0, last] (never skips dates or notes).
  // Which steps the user will actually see this run. In continue mode the
  // profile-backed steps are pre-answered and skipped, so counting all six
  // made the progress bar jump 1/6 → 6/6 — honest but jarring.
  const visibleStepIdxs = STEPS
    .map((st, i) => i)
    .filter(i => interviewMode !== "continue"
      || i === 0
      || i === STEPS.length - 1
      || !PROFILE_BACKED_STEP_IDS.includes(STEPS[i].id));

  function nextVisibleStep(from, dir) {
    let i = from + dir;
    if (interviewMode === "continue") {
      while (i > 0 && i < STEPS.length - 1 && PROFILE_BACKED_STEP_IDS.includes(STEPS[i].id)) {
        i += dir;
      }
    }
    return i;
  }

  function advance() {
    const newAns = stageCurrent();
    setAnswers(newAns);
    if (step < STEPS.length - 1) {
      setDir(1);
      const next = nextVisibleStep(step, 1);
      setStep(next);
      hydrate(next, newAns);
    } else {
      handleBuildTrip(newAns, { fromInterview: true });
    }
  }

  function goBack() {
    // Persist current edits too, so navigating forward again restores them.
    const newAns = stageCurrent();
    setAnswers(newAns);
    setDir(-1);
    const prev = nextVisibleStep(step, -1);
    setStep(prev);
    hydrate(prev, newAns);
  }

  // ── API actions ───────────────────────────────────────────────────────────

  // Monotonic token for the in-flight build. Navigating away mid-build
  // (resetAll, activateTrip) bumps it, so a completing build still persists
  // its result — the traveler's answers are never lost — but no longer yanks
  // the screen back, replaces the on-screen trip, or starts streaming a plan
  // the user didn't stay for.
  const buildRunRef = useRef(0);

  /**
   * Build (or rebuild) a trip and persist it — straight-to-dashboard flow.
   *
   * The ticket needs zero AI: every field on it derives from the interview
   * answers. So the dashboard renders immediately with a `_building` skeleton
   * while the curation call runs, and on success the full itinerary starts
   * generating on its own (no Generate tap — the tap was a leftover from the
   * 5-mode era). On build failure the manual Generate button is the fallback,
   * exactly as before.
   *
   *   opts.fromInterview — came from the 6-step interview (may update the profile)
   *   opts.replaceId     — rebuild THIS trip in place instead of adding a new one
   *                        (Trip Details rebuild); its stale plan is dropped.
   */
  async function handleBuildTrip(a, opts = {}) {
    const run = ++buildRunRef.current;
    const isBucket = a.tripStyle === "bucket";
    setTrip({
      id: opts.replaceId || undefined,
      destination: a.destination,
      tripStyle: a.tripStyle || "itinerary",
      nights: isBucket ? null : calcNights(a.dates?.start, a.dates?.end), // bucket = dateless, never the 5-night default
      categories: {},
      answers: a,
      _building: true, // memory-only flag — never persisted
    });
    setScreen("dashboard");

    const result = await doBuildTrip(a, uploadedFiles);
    let saved = result;
    if (!result._error) {
      // Bucket rebuild: carry the traveler's picks forward for venues that
      // survived the recuration (name-stable keys); the rest prune so the
      // PICKED count can never include ideas the board no longer shows.
      // `trip` here is the render-time value — the OLD trip, pre-skeleton.
      if (isBucket && opts.replaceId && trip?.bucketPicks) {
        result.bucketPicks = carryBucketPicks(trip.bucketPicks, result.categories);
      }
      // A rebuild invalidates that trip's existing plan; a brand-new trip has
      // none. Either way the incoming trip starts with no plan attached.
      clearSavedPlan(opts.replaceId || undefined);
      const store = persistTrip(result, { replaceId: opts.replaceId || null });
      setTripStore(store);
      scheduleSyncPush();
      // Carry the assigned id back onto the in-memory trip, so a plan generated
      // now is written under the right key.
      saved = getActiveTrip(store) || result;
      // "Edit preferences" is the deliberate moment to update saved defaults.
      if (opts.fromInterview && interviewMode === "edit") {
        const p = saveProfile(a);
        if (p) setSavedProfile(p);
        scheduleSyncPush();
      }
    }
    if (buildRunRef.current !== run) return; // user moved on — result is saved, stop here
    setTrip(saved);
    // Auto-start the itinerary. Only on a successful build: with empty
    // categories the plan would be generic model guesswork, so the failure
    // path keeps the traveler in control (banner + manual Generate).
    // Bucket trips never generate — the curated list IS the product.
    if (!result._error && !isBucket) {
      doGenerate(MODES[0].id, saved, null, null, eventsRef.current);
    }
  }

  /**
   * Bucket-mode check-off (2026-08-15): toggle one idea in/out of "my list".
   * Persists through the normal trip store (replaceId keeps id + position),
   * so picks survive reload and ride the future Supabase sync for free.
   */
  function toggleBucketPick(key) {
    if (!trip?.id || trip._building) return; // unsaved/failed builds have nothing durable to write
    const picks = { ...(trip.bucketPicks || {}) };
    if (picks[key]) delete picks[key]; else picks[key] = true;
    const updated = { ...trip, bucketPicks: picks };
    setTrip(updated);
    setTripStore(persistTrip(updated, { replaceId: trip.id }));
    scheduleSyncPush();
  }

  // Accept the one-time "save these as your defaults?" prompt (first-time users).
  function handleSaveProfile() {
    const p = saveProfile(trip?.answers || answers);
    if (p) setSavedProfile(p);
    scheduleSyncPush();
  }

  /** Persist a profile edited directly in the ProfileSheet (design pick 6A). */
  function handleUpdateProfile(profile) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* quota — keep in-memory copy anyway */ }
    setSavedProfile(profile);
    scheduleSyncPush();
  }

  // Decline it — persist so it doesn't nag on future trips.
  function handleDismissProfilePrompt() {
    try { localStorage.setItem(PROFILE_DECLINED_KEY, "1"); } catch { /* ignore */ }
    setProfilePromptDismissed(true);
  }

  function handleGenerate(mode) {
    // eventsForPrompt carries the VERIFIED league schedule so the model can't
    // invent a game (§15.2 C). Unresolved fetch => no block, not a false "none".
    doGenerate(mode, trip, null, null, eventsForPrompt);
  }

  /**
   * Handle plan-level edits from EditTripSheet.
   *   type        — "activities" | "day" | "full"
   *   instruction — user's change prompt
   *   dayIndex    — 0-based day index (day edits only)
   *   dayLabel    — full label string (day edits only)
   */
  function handleEditPlan(type, instruction, dayIndex, dayLabel) {
    if (type === "day") {
      doPatchDay(dayIndex, dayLabel, instruction, trip);
    } else {
      // "activities" → re-generate current mode with targeted instruction
      // "full"       → re-generate current mode with vibe overlay
      const editType = type === "activities" ? "activities" : null;
      doGenerate(planMode || "full", trip, instruction, editType, eventsForPrompt);
    }
  }

  /**
   * Rebuild the trip with updated answers (from Trip Details edit).
   * Keeps the old trip in localStorage until the new one succeeds.
   */
  async function handleEditTripDetails(newAnswers) {
    setAnswers(newAnswers);
    // A rebuild updates THIS trip rather than creating a second copy of it.
    await handleBuildTrip(newAnswers, { replaceId: trip?.id || null });
  }

  // ── Reset / resume ────────────────────────────────────────────────────────
  function resetAll() {
    buildRunRef.current++; // orphan any in-flight build (it still persists itself)
    setScreen("welcome"); setStep(0); setAnswers({}); setDir(1);
    setCur(""); setChips([]); setPriorityChips([]); setTeams([]); setKids(""); setAvoidText("");
    setBudget(120); setD1(""); setD2(""); setBucketNow(""); setBucketWhen(""); setLogStay(""); setLogTransport(""); setLogPace(""); setLogFocus(""); setLogRhythm("");
    setInterviewMode("fresh");
    setTrip(null);
    // Memory-only reset: no trip id, so no saved plan is deleted. "Start over"
    // returns to the welcome screen; the saved trip and its itinerary stay
    // resumable. (Previously this deleted the plan, which now would destroy one
    // itinerary out of several.)
    resetFiles(); clearSavedPlan();
  }

  /**
   * THE single way a trip becomes the one on screen. Resume, switch, and
   * post-delete promotion all route through here.
   *
   * Atomicity matters: restorePlan() both claims plan ownership for this trip
   * and aborts any in-flight generation from the previous one. Setting the trip
   * without it would leave the old trip's owner id in place, so a stream that
   * lands after the switch writes its itinerary under the wrong trip — the exact
   * failure the per-trip plan keys exist to prevent.
   */
  function activateTrip(t) {
    if (!t) return;
    buildRunRef.current++; // orphan any in-flight build (it still persists itself)
    setTrip(t);
    setAnswers(t.answers || {});   // keep App's answers coherent with the trip on screen
    restorePlan(t.id);             // that trip's own itinerary + edits, if any
    setTripStore(activateTripId(t.id)); // persist the choice so reload resumes it
    setScreen("dashboard");
  }

  function handleResume(tripId) {
    activateTrip(tripId ? allTrips.find(t => t.id === tripId) : savedTrip);
  }

  /** Delete a saved trip (and its itinerary). */
  function handleDeleteTrip(tripId) {
    recordDeletion(tripId); // tombstone BEFORE the local delete — survives offline
    const next = deleteTrip(tripId);
    setTripStore(next);
    scheduleSyncPush();
    // If the open trip was the one deleted, leave the dashboard rather than
    // rendering a trip that no longer exists.
    if (trip?.id === tripId) {
      setTrip(null);
      clearSavedPlan();
      setScreen("welcome");
    }
  }

  /**
   * Start a new interview. mode:
   *   "fresh"    — blank interview (first-ever, or "Start fresh" escape hatch)
   *   "continue" — pre-fill from profile + skip profile-backed steps (dates → notes)
   *   "edit"     — pre-fill from profile, show every step (update defaults on build)
   * Dates are always trip-specific and start blank.
   */
  function startInterview(dest, mode = "fresh", tripStyle = "itinerary") {
    setInterviewMode(mode);
    const p = (mode === "continue" || mode === "edit") ? savedProfile : null;
    if (p) {
      // Dedicated (non-hydrated) state vars — needed so Edit-mode steps render
      // pre-filled. hydrate() fills the shared chips/cur/kids on step nav.
      setBudget(typeof p.budget === "number" ? p.budget : 120);
      setLogStay(p.logistics?.stay || "");
      setLogTransport(p.logistics?.transport || "");
      setLogPace(p.logistics?.pace || "");
      setLogFocus(p.logistics?.focus || "");
      setLogRhythm(p.logistics?.rhythm || "");
      setAvoidText(p.avoid || "");
      setChips([]); setPriorityChips([]); setTeams([]); setCur(""); setKids("");
      // Pre-populate answers so steps skipped in "continue" mode still contribute.
      setAnswers({
        destination: dest,
        tripStyle,
        party:     p.party,
        logistics: p.logistics,
        budget:    p.budget,
        interests: p.interests,
        avoid:     p.avoid || "",
      });
    } else {
      // Fresh — blank all per-step state so nothing bleeds into the new trip.
      setCur(""); setChips([]); setPriorityChips([]); setTeams([]); setKids(""); setAvoidText("");
      setBudget(120);
      setLogStay(""); setLogTransport(""); setLogPace(""); setLogFocus(""); setLogRhythm("");
      setAnswers({ destination: dest, tripStyle });
    }
    setD1(""); setD2("");
    setBucketNow(""); setBucketWhen("");
    setDir(1);
    setScreen("interview");
    setStep(0);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <link rel="stylesheet" href={GF} />
      <style>{GLOBAL_CSS}</style>
      <div style={{ position: "relative", minHeight: "100vh", overflow: "clip", background: T.bg0 }}>
        <AnimatePresence mode="wait">

          {screen === "welcome" && (
            <Page key="welcome">
              <WelcomeScreen
                onStart={startInterview}
                hasProfile={!!savedProfile}
                profile={savedProfile}
                onUpdateProfile={handleUpdateProfile}
                savedTrip={savedTrip}
                onResume={handleResume}
                trips={allTrips}
                onDeleteTrip={handleDeleteTrip}
              />
            </Page>
          )}

          {screen === "interview" && (
            <Page key="interview">
              <InterviewFlow
                step={step}
                stepNumber={Math.max(1, visibleStepIdxs.indexOf(step) + 1)}
                stepTotal={visibleStepIdxs.length}
                direction={direction}
                onWelcome={() => setScreen("welcome")}
                onAdvance={advance}
                onBack={goBack}
                cur={cur} setCur={setCur}
                chips={chips} setChips={setChips}
                priorityChips={priorityChips} setPriorityChips={setPriorityChips}
                teams={teams} setTeams={setTeams}
                kids={kids} setKids={setKids}
                avoidText={avoidText} setAvoidText={setAvoidText}
                budget={budget} setBudget={setBudget}
                d1={d1} setD1={setD1} d2={d2} setD2={setD2}
                tripStyle={answers.tripStyle || "itinerary"}
                bucketNow={bucketNow} setBucketNow={setBucketNow}
                bucketWhen={bucketWhen} setBucketWhen={setBucketWhen}
                logStay={logStay} setLogStay={setLogStay}
                logTransport={logTransport} setLogTransport={setLogTransport}
                logPace={logPace} setLogPace={setLogPace}
                logFocus={logFocus} setLogFocus={setLogFocus}
                logRhythm={logRhythm} setLogRhythm={setLogRhythm}
                isValid={isValid()}
              />
            </Page>
          )}

          {screen === "dashboard" && trip && (
            <Page key="dashboard">
              <ErrorBoundary>
                <Dashboard
                  trip={trip}
                  trips={allTrips}
                  onSwitchTrip={handleResume}
                  building={!!trip._building}
                  buildingMsg={loadMsg}
                  tripGames={tripGames}
                  planIssues={planIssues}
                  planText={planText} planModel={planModel} planLoading={planLoading} planMode={planMode} generatedAt={generatedAt}
                  patchError={patchError}
                  debugMsg={buildError}
                  onGenerate={handleGenerate}
                  onEditPlan={handleEditPlan}
                  onEditTripDetails={handleEditTripDetails}
                  onEditActivity={editActivity}
                  onDeleteActivity={removeActivity}
                  onReorderDay={reorderDayActivities}
                  onMoveActivity={moveActivity}
                  onMoveToBucket={moveActivityToBucket}
                  onTweakActivity={(dayIdx, actId, instruction) => tweakActivity(dayIdx, actId, instruction, trip)}
                  tweakingId={tweakingId}
                  onTogglePick={toggleBucketPick}
                  onReset={resetAll}
                  showProfilePrompt={!!trip && !trip._error && !trip._building && !savedProfile && !profilePromptDismissed}
                  onSaveProfile={handleSaveProfile}
                  onDismissProfilePrompt={handleDismissProfilePrompt}
                />
              </ErrorBoundary>
            </Page>
          )}

        </AnimatePresence>
      </div>
    </>
  );
}
