import { useState, useRef } from "react";
import { complete } from "../lib/api.js";
import { buildTripPrompt } from "../lib/prompts.js";
import { recoverJSON } from "../lib/utils.js";
import { LOAD_MSGS } from "../lib/constants.js";

export function useBuildTrip() {
  const [loading, setLoading]   = useState(false);
  const [loadMsg, setLoadMsg]   = useState(LOAD_MSGS[0]);
  const [error, setError]       = useState("");
  const loadRef = useRef(null);

  async function buildTrip(answers, uploadedFiles) {
    setLoading(true);
    setError("");
    setLoadMsg(LOAD_MSGS[0]);

    let msgIdx = 0;
    loadRef.current = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, LOAD_MSGS.length - 1);
      setLoadMsg(LOAD_MSGS[msgIdx]);
    }, 1600);

    const { messageContent, n } = buildTripPrompt(answers, uploadedFiles);

    const tryBuild = async () => {
      const data = await complete([{ role: "user", content: messageContent }], 8000);
      const raw  = data.content?.find(b => b.type === "text")?.text || "";
      if (!raw) throw new Error("No response from AI. Please try again.");
      return recoverJSON(raw);
    };

    try {
      let parsed;
      try {
        parsed = await tryBuild();
      } catch (e) {
        // api.js translates raw HTTP codes into friendly messages — match those strings.
        // "our end" → 500, "AI service" → 502, "No response" → empty body
        const isRetryable =
          e.message.includes("our end") ||
          e.message.includes("AI service") ||
          e.message.includes("No response");
        if (isRetryable) {
          setLoadMsg("Retrying…");
          await new Promise(r => setTimeout(r, 2000));
          parsed = await tryBuild();
        } else throw e;
      }
      clearInterval(loadRef.current);
      setLoading(false);
      return { ...parsed, answers, nights: n };
    } catch (e) {
      clearInterval(loadRef.current);
      setError(e.message);
      setLoading(false);
      // Return a skeleton trip so the dashboard still renders
      return {
        destination: answers.destination,
        tagline: "Your trip",
        nights: n,
        highlights: [],
        categories: {},
        practical: {},
        photoSpots: [],
        avoidList: [],
        answers,
        _error: true,
      };
    }
  }

  return { buildTrip, loading, loadMsg, error };
}
