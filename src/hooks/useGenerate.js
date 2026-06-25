import { useState, useRef, useEffect } from "react";
import { stream, consumeStream, complete } from "../lib/api.js";
import { buildPlanPrompt, buildEditDayPrompt } from "../lib/prompts.js";
import { spliceDayInPlan } from "../lib/utils.js";
import { parsePlan, serializePlan } from "../lib/planModel.js";

export function useGenerate() {
  const [planText, setPlanText]       = useState("");
  const [planModel, setPlanModel]     = useState(null); // structured, editable plan (null until a generation completes)
  const [planMode, setPlanMode]       = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [patchError, setPatchError]   = useState("");
  const streamRef  = useRef("");
  const modelRef   = useRef(null); // mirrors planModel — avoids stale closures in edit handlers
  const abortRef   = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Adopt a freshly-built plan string as the editable model (and keep planText
  // in sync). Used after generation completes and after an AI day-patch.
  function adoptPlan(text) {
    const model = parsePlan(text);
    modelRef.current = model;
    setPlanModel(model);
  }

  // Commit an edited model: model is the source of truth, planText is
  // re-serialized so copy / PDF export / EditTripSheet all stay consistent.
  function commitModel(next) {
    modelRef.current = next;
    setPlanModel(next);
    const md = serializePlan(next);
    streamRef.current = md;
    setPlanText(md);
  }

  /** Inline-edit one activity's fields (time / title / details). */
  function editActivity(dayIdx, actId, patch) {
    const prev = modelRef.current;
    if (!prev) return;
    commitModel({
      ...prev,
      days: prev.days.map((d, i) => i !== dayIdx ? d : {
        ...d,
        activities: d.activities.map(act => act.id === actId ? { ...act, ...patch } : act),
      }),
    });
  }

  /** Remove one activity from a day. */
  function removeActivity(dayIdx, actId) {
    const prev = modelRef.current;
    if (!prev) return;
    commitModel({
      ...prev,
      days: prev.days.map((d, i) => i !== dayIdx ? d : {
        ...d,
        activities: d.activities.filter(act => act.id !== actId),
      }),
    });
  }

  /**
   * Generate (or re-generate) a plan in the given mode.
   * editInstruction — optional free-text instruction for Full Itinerary / Specific Activities edits.
   * editType        — "activities" | null — controls prompt framing.
   */
  async function generate(mode, trip, editInstruction = null, editType = null) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPlanMode(mode);
    setPlanLoading(true);
    setPlanText("");
    setPlanModel(null);
    modelRef.current = null;
    setPatchError("");
    streamRef.current = "";

    const prompt = buildPlanPrompt(mode, trip, editInstruction, editType);

    try {
      const res = await stream([{ role: "user", content: prompt }], 8000, controller.signal);
      await consumeStream(res, chunk => {
        streamRef.current += chunk;
        setPlanText(streamRef.current);
      }, controller.signal);
      // Parse the completed plan into the editable model (skip if aborted).
      if (!controller.signal.aborted) adoptPlan(streamRef.current);
    } catch (e) {
      if (e?.name === "AbortError") return;
      // Sanitise: never show raw browser network errors (e.g. "Failed to fetch") to the user
      const msg = e.message || "";
      const isBrowserNetworkError = /failed to fetch|network|load failed/i.test(msg);
      setPlanText(
        isBrowserNetworkError
          ? "Couldn't connect to the server. Please check it's running and try again."
          : msg || "Something went wrong generating your plan. Please try again."
      );
    } finally {
      if (!controller.signal.aborted) setPlanLoading(false);
    }
  }

  /**
   * Patch a single day in the current plan using complete() (non-streaming).
   * On success: splices the new day content into planText.
   * On failure: planText is left unchanged; patchError is set.
   *
   * dayIndex — 0-based (0 = Day 1)
   * dayLabel — full label string e.g. "Day 1 — Wednesday, June 11, 2025"
   * instruction — user's change instruction (may be empty — means "refresh")
   * trip — the current trip object
   */
  async function patchDay(dayIndex, dayLabel, instruction, trip) {
    if (planLoading) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPlanLoading(true);
    setPatchError("");

    // Extract the current day block from planText
    const currentPlan = planText;
    const re = /^## Day \d+ —/gm;
    const positions = [];
    let m;
    while ((m = re.exec(currentPlan)) !== null) positions.push(m.index);
    const start = positions[dayIndex] ?? 0;
    const end   = dayIndex + 1 < positions.length ? positions[dayIndex + 1] : currentPlan.length;
    const dayContent = currentPlan.slice(start, end).trim();

    const prompt = buildEditDayPrompt(dayLabel, dayContent, instruction, trip);

    try {
      const data = await complete([{ role: "user", content: prompt }], 3000, controller.signal);
      const raw  = data.content?.find(b => b.type === "text")?.text || "";
      if (!raw) throw new Error("No response from AI. Please try again.");
      const newPlan = spliceDayInPlan(currentPlan, dayIndex, raw);
      setPlanText(newPlan);
      streamRef.current = newPlan;
      adoptPlan(newPlan); // keep the editable model in sync after an AI day-patch
    } catch (e) {
      if (e?.name === "AbortError") return;
      const msg = e.message || "";
      const isBrowserNetworkError = /failed to fetch|network|load failed/i.test(msg);
      // Don't overwrite existing planText — show error separately
      setPatchError(
        isBrowserNetworkError
          ? "Couldn't reach the server. Please check it's running and try again."
          : msg || "Something went wrong updating the day. Please try again."
      );
    } finally {
      if (!controller.signal.aborted) setPlanLoading(false);
    }
  }

  function resetPlan() {
    abortRef.current?.abort();
    abortRef.current = null;
    setPlanText("");
    setPlanModel(null);
    modelRef.current = null;
    setPlanMode(null);
    setPlanLoading(false);
    setPatchError("");
    streamRef.current = "";
  }

  return { planText, planModel, planMode, planLoading, patchError, generate, patchDay, resetPlan, editActivity, removeActivity };
}
