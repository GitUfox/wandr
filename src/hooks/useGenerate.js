import { useState, useRef } from "react";
import { stream, consumeStream, complete } from "../lib/api.js";
import { buildPlanPrompt, buildEditDayPrompt } from "../lib/prompts.js";
import { spliceDayInPlan } from "../lib/utils.js";

export function useGenerate() {
  const [planText, setPlanText]       = useState("");
  const [planMode, setPlanMode]       = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [patchError, setPatchError]   = useState("");
  const streamRef = useRef("");

  // TODO [wandr-audit 2026-06-04]: No AbortController — if the user navigates away mid-stream
  // (e.g. hits "New trip"), consumeStream keeps running and updates orphaned state.
  // Fix requires threading an AbortSignal through stream() and consumeStream() in api.js
  // and calling abort() in a useEffect cleanup. Deferred — architectural change.

  /**
   * Generate (or re-generate) a plan in the given mode.
   * editInstruction — optional free-text instruction for Full Itinerary / Specific Activities edits.
   * editType        — "activities" | null — controls prompt framing.
   */
  async function generate(mode, trip, editInstruction = null, editType = null) {
    if (planLoading) return; // prevent concurrent streams
    setPlanMode(mode);
    setPlanLoading(true);
    setPlanText("");
    setPatchError("");
    streamRef.current = "";

    const prompt = buildPlanPrompt(mode, trip, editInstruction, editType);

    try {
      const res = await stream([{ role: "user", content: prompt }], 8000);
      await consumeStream(res, chunk => {
        streamRef.current += chunk;
        setPlanText(streamRef.current);
      });
    } catch (e) {
      // Sanitise: never show raw browser network errors (e.g. "Failed to fetch") to the user
      const msg = e.message || "";
      const isBrowserNetworkError = /failed to fetch|network|load failed/i.test(msg);
      setPlanText(
        isBrowserNetworkError
          ? "Couldn't connect to the server. Please check it's running and try again."
          : msg || "Something went wrong generating your plan. Please try again."
      );
    } finally {
      setPlanLoading(false);
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
      const data = await complete([{ role: "user", content: prompt }], 3000);
      const raw  = data.content?.find(b => b.type === "text")?.text || "";
      if (!raw) throw new Error("No response from AI. Please try again.");
      const newPlan = spliceDayInPlan(currentPlan, dayIndex, raw);
      setPlanText(newPlan);
      streamRef.current = newPlan;
    } catch (e) {
      const msg = e.message || "";
      const isBrowserNetworkError = /failed to fetch|network|load failed/i.test(msg);
      // Don't overwrite existing planText — show error separately
      setPatchError(
        isBrowserNetworkError
          ? "Couldn't reach the server. Please check it's running and try again."
          : msg || "Something went wrong updating the day. Please try again."
      );
    } finally {
      setPlanLoading(false);
    }
  }

  function resetPlan() {
    setPlanText("");
    setPlanMode(null);
    setPlanLoading(false);
    setPatchError("");
    streamRef.current = "";
  }

  return { planText, planMode, planLoading, patchError, generate, patchDay, resetPlan };
}
