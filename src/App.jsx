// Wandr v3.1 — framer-motion screen + step transitions
import { useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { STEPS, T } from "./lib/constants.js";
import { useBuildTrip } from "./hooks/useBuildTrip.js";
import { useGenerate } from "./hooks/useGenerate.js";
import { useFileUpload } from "./hooks/useFileUpload.js";
import WelcomeScreen from "./components/WelcomeScreen.jsx";
import LoadingScreen from "./components/LoadingScreen.jsx";
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

function loadSavedTrip() {
  try { return JSON.parse(localStorage.getItem("wandr_trip") || "null"); } catch { return null; }
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
  const [kids, setKids]                   = useState("");
  const [avoidText, setAvoidText]         = useState("");
  const [budget, setBudget]               = useState(120);
  const [d1, setD1]                       = useState("");
  const [d2, setD2]                       = useState("");
  const [logStay, setLogStay]             = useState("");
  const [logTransport, setLogTransport]   = useState("");
  const [logPace, setLogPace]             = useState("");
  const [logFirstTime, setLogFirstTime]   = useState("");

  // Trip + dashboard
  const [trip, setTrip]               = useState(null);
  const [savedTrip, setSavedTrip]     = useState(loadSavedTrip);

  const fileInputRef = useRef(null);
  const S = STEPS[step];

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const { buildTrip: doBuildTrip, loadMsg, error: buildError } = useBuildTrip();
  const { planText, planModel, planMode, planLoading, patchError, generate: doGenerate, patchDay: doPatchDay, resetPlan, editActivity, removeActivity } = useGenerate();
  const { uploadedFiles, uploadError, handleFiles, removeFile, resetFiles } = useFileUpload();

  // ── Interview helpers ─────────────────────────────────────────────────────
  function currentVal() {
    if (S.type === "chips")      return chips;
    if (S.type === "chips+text") {
      if (S.id === "party" && kids) return { chips, text: cur, kids };
      return { chips, text: cur };
    }
    if (S.type === "daterange")  return { start: d1, end: d2 };
    if (S.type === "budget")     return budget;
    if (S.type === "logistics")  return { stay: logStay, transport: logTransport, pace: logPace, firstTime: logFirstTime };
    return cur;
  }

  function isValid() {
    const v = currentVal();
    if (S.type === "chips")      return v.length > 0;
    if (S.type === "chips+text") return S.id === "interests"
      ? (chips.length > 0 || cur.trim().length > 1)
      : (v.chips.length > 0 || v.text.trim().length > 1);
    if (S.type === "daterange")  return !!(d1 && d2 && d1.length >= 8 && d2.length >= 8 && d2 > d1);
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
    setAvoidText(st.id === "notes" ? (src.avoid || "") : "");
  }

  // Stage the current step's edits into answers, returning the merged object.
  function stageCurrent() {
    const newAns = { ...answers, [S.id]: currentVal() };
    if (S.id === "notes") newAns.avoid = avoidText.trim();
    return newAns;
  }

  function advance() {
    const newAns = stageCurrent();
    setAnswers(newAns);
    if (step < STEPS.length - 1) {
      setDir(1);
      const next = step + 1;
      setStep(next);
      hydrate(next, newAns);
    } else {
      handleBuildTrip(newAns);
    }
  }

  function goBack() {
    // Persist current edits too, so navigating forward again restores them.
    const newAns = stageCurrent();
    setAnswers(newAns);
    setDir(-1);
    const prev = step - 1;
    setStep(prev);
    hydrate(prev, newAns);
  }

  // ── API actions ───────────────────────────────────────────────────────────
  async function handleBuildTrip(a) {
    setScreen("loading");
    const result = await doBuildTrip(a, uploadedFiles);
    if (!result._error) {
      try { localStorage.setItem("wandr_trip", JSON.stringify(result)); setSavedTrip(result); } catch {}
    }
    setTrip(result);
    setScreen("dashboard");
  }

  function handleGenerate(mode) {
    doGenerate(mode, trip);
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
      doGenerate(planMode || "full", trip, instruction, editType);
    }
  }

  /**
   * Rebuild the trip with updated answers (from Trip Details edit).
   * Keeps the old trip in localStorage until the new one succeeds.
   */
  async function handleEditTripDetails(newAnswers) {
    setAnswers(newAnswers);
    await handleBuildTrip(newAnswers);
  }

  // ── Reset / resume ────────────────────────────────────────────────────────
  function resetAll() {
    setScreen("welcome"); setStep(0); setAnswers({}); setDir(1);
    setCur(""); setChips([]); setKids(""); setAvoidText("");
    setBudget(120); setD1(""); setD2(""); setLogStay(""); setLogTransport(""); setLogPace(""); setLogFirstTime("");
    setTrip(null);
    resetFiles(); resetPlan();
  }

  function handleResume() {
    setTrip(savedTrip);
    setScreen("dashboard");
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
                onStart={dest => {
                  // Reset all per-step form state so stale values don't bleed into a new trip
                  setCur(""); setChips([]); setKids(""); setAvoidText("");
                  setBudget(120); setD1(""); setD2("");
                  setLogStay(""); setLogTransport(""); setLogPace(""); setLogFirstTime("");
                  setDir(1);
                  setAnswers({ destination: dest });
                  setScreen("interview");
                  setStep(0);
                }}
                savedTrip={savedTrip}
                onResume={handleResume}
              />
            </Page>
          )}

          {screen === "interview" && (
            <Page key="interview">
              <InterviewFlow
                step={step}
                direction={direction}
                onWelcome={() => setScreen("welcome")}
                onAdvance={advance}
                onBack={goBack}
                cur={cur} setCur={setCur}
                chips={chips} setChips={setChips}
                kids={kids} setKids={setKids}
                avoidText={avoidText} setAvoidText={setAvoidText}
                budget={budget} setBudget={setBudget}
                d1={d1} setD1={setD1} d2={d2} setD2={setD2}
                logStay={logStay} setLogStay={setLogStay}
                logTransport={logTransport} setLogTransport={setLogTransport}
                logPace={logPace} setLogPace={setLogPace}
                logFirstTime={logFirstTime} setLogFirstTime={setLogFirstTime}
                uploadedFiles={uploadedFiles} uploadError={uploadError} fileInputRef={fileInputRef}
                handleFiles={handleFiles} removeFile={removeFile}
                isValid={isValid()}
              />
            </Page>
          )}

          {screen === "loading" && (
            <Page key="loading">
              <LoadingScreen message={loadMsg} destination={answers.destination} />
            </Page>
          )}

          {screen === "dashboard" && trip && (
            <Page key="dashboard">
              <ErrorBoundary>
                <Dashboard
                  trip={trip}
                  planText={planText} planModel={planModel} planLoading={planLoading} planMode={planMode}
                  patchError={patchError}
                  debugMsg={buildError}
                  onGenerate={handleGenerate}
                  onEditPlan={handleEditPlan}
                  onEditTripDetails={handleEditTripDetails}
                  onEditActivity={editActivity}
                  onDeleteActivity={removeActivity}
                  onReset={resetAll}
                />
              </ErrorBoundary>
            </Page>
          )}

        </AnimatePresence>
      </div>
    </>
  );
}
