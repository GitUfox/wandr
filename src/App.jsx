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
  html,body,#root{background:#0d0d0d!important;margin:0;padding:0;min-height:100vh;width:100%}
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
      style={{ position: "absolute", inset: 0, minHeight: "100vh", width: "100%" }}
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
  const [cur, setCur]                   = useState("");
  const [chips, setChips]               = useState([]);
  const [avoidMode, setAvoidMode]       = useState(false);
  const [avoidChips, setAvoidChips]     = useState([]);
  const [budget, setBudget]             = useState(150);
  const [d1, setD1]                     = useState("");
  const [d2, setD2]                     = useState("");
  const [logStay, setLogStay]           = useState("");
  const [logTransChips, setLogTransChips] = useState([]);
  const [logTransText, setLogTransText]   = useState("");

  // Trip + dashboard
  const [trip, setTrip]               = useState(null);
  const [tab, setTab]                 = useState("plan");
  const [expandedCat, setExpandedCat] = useState(null);
  const [savedTrip, setSavedTrip]     = useState(loadSavedTrip);

  const fileInputRef = useRef(null);
  const S = STEPS[step];

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const { buildTrip: doBuildTrip, loadMsg, error: buildError } = useBuildTrip();
  const { planText, planMode, planLoading, generate: doGenerate, resetPlan } = useGenerate();
  const { uploadedFiles, uploadError, handleFiles, removeFile, resetFiles } = useFileUpload();

  // ── Interview helpers ─────────────────────────────────────────────────────
  function currentVal() {
    if (S.type === "chips")      return chips;
    if (S.type === "chips+text") return { chips, text: cur };
    if (S.type === "daterange")  return { start: d1, end: d2 };
    if (S.type === "budget")     return budget;
    if (S.type === "logistics")  return { stay: logStay, transport: { chips: logTransChips, text: logTransText } };
    return cur;
  }

  function isValid() {
    const v = currentVal();
    if (S.type === "chips")      return v.length > 0;
    if (S.type === "chips+text") return S.id === "interests"
      ? (chips.length > 0 || cur.trim().length > 1 || avoidChips.length > 0)
      : (v.chips.length > 0 || v.text.trim().length > 1);
    if (S.type === "daterange")  return !!(d1 && d2 && d1.length >= 8 && d2.length >= 8 && d2 > d1);
    if (S.type === "budget")     return true;
    if (S.type === "logistics")  return logStay.trim().length > 1;
    if (S.id === "avoid" || S.id === "notes") return true;
    return String(v).trim().length > 1;
  }

  function advance() {
    const val = S.id === "interests" ? { chips, text: cur, avoidChips } : currentVal();
    const newAns = { ...answers, [S.id]: val };
    setAnswers(newAns);
    if (step < STEPS.length - 1) {
      setDir(1);
      setStep(s => s + 1);
      setCur(""); setChips([]); setAvoidMode(false); setAvoidChips([]);
    } else {
      handleBuildTrip(newAns);
    }
  }

  function goBack() {
    setDir(-1);
    setStep(s => s - 1);
    setCur(""); setChips([]); setAvoidMode(false); setAvoidChips([]);
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
    setTab("plan");
    doGenerate(mode, trip);
  }

  // ── Reset / resume ────────────────────────────────────────────────────────
  function resetAll() {
    setScreen("welcome"); setStep(0); setAnswers({}); setDir(1);
    setCur(""); setChips([]); setAvoidMode(false); setAvoidChips([]);
    setBudget(150); setD1(""); setD2(""); setLogStay(""); setLogTransChips([]); setLogTransText("");
    setTrip(null); setTab("plan"); setExpandedCat(null);
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
      <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden", background: T.bg0 }}>
        <AnimatePresence mode="wait">

          {screen === "welcome" && (
            <Page key="welcome">
              <WelcomeScreen
                onStart={dest => {
                  // Reset all per-step form state so stale values don't bleed into a new trip
                  setCur(""); setChips([]); setAvoidMode(false); setAvoidChips([]);
                  setBudget(150); setD1(""); setD2("");
                  setLogStay(""); setLogTransChips([]); setLogTransText("");
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
                avoidMode={avoidMode} setAvoidMode={setAvoidMode}
                avoidChips={avoidChips} setAvoidChips={setAvoidChips}
                budget={budget} setBudget={setBudget}
                d1={d1} setD1={setD1} d2={d2} setD2={setD2}
                logStay={logStay} setLogStay={setLogStay}
                logTransChips={logTransChips} setLogTransChips={setLogTransChips}
                logTransText={logTransText} setLogTransText={setLogTransText}
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
                  planText={planText} planLoading={planLoading} planMode={planMode}
                  tab={tab} setTab={setTab}
                  expandedCat={expandedCat} setExpandedCat={setExpandedCat}
                  debugMsg={buildError}
                  onGenerate={handleGenerate}
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
