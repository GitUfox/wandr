import { useState, useRef } from "react";
import { stream, consumeStream } from "../lib/api.js";
import { buildPlanPrompt } from "../lib/prompts.js";

export function useGenerate() {
  const [planText, setPlanText]       = useState("");
  const [planMode, setPlanMode]       = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const streamRef = useRef("");

  async function generate(mode, trip) {
    if (planLoading) return; // prevent concurrent streams
    setPlanMode(mode);
    setPlanLoading(true);
    setPlanText("");
    streamRef.current = "";

    const prompt = buildPlanPrompt(mode, trip);

    try {
      const res = await stream([{ role: "user", content: prompt }], 8000);
      await consumeStream(res, chunk => {
        streamRef.current += chunk;
        setPlanText(streamRef.current);
      });
    } catch (e) {
      setPlanText(e.message || "Something went wrong generating your plan. Please try again.");
    } finally {
      setPlanLoading(false);
    }
  }

  function resetPlan() {
    setPlanText("");
    setPlanMode(null);
    setPlanLoading(false);
    streamRef.current = "";
  }

  return { planText, planMode, planLoading, generate, resetPlan };
}
