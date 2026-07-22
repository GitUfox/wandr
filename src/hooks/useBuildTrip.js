import { useState, useRef } from "react";
import { complete } from "../lib/api.js";
import { buildTripCategoriesPrompt, buildTripMetaPrompt } from "../lib/prompts.js";
import { recoverJSON } from "../lib/utils.js";
import { LOAD_MSGS } from "../lib/constants.js";
import { verifyTripVenues } from "../lib/places.js";

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

    // The trip database is built in two parallel calls. A single combined call
    // generates >60s of JSON and is killed by Vercel's function timeout. Each
    // half finishes comfortably under the limit; we run them concurrently and
    // merge. (Each call counts against the per-IP trip rate limit — see
    // LIMIT_TRIPS in api/shared.js, sized for 2 calls per trip.)
    const { messageContent: catsMsg, n } = buildTripCategoriesPrompt(answers, uploadedFiles);
    const { messageContent: metaMsg }     = buildTripMetaPrompt(answers, uploadedFiles);

    // Dev-only: inspect the assembled prompt (interests weighting, conflict rule,
    // etc.). Gated behind import.meta.env.DEV so it never ships to production.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[Wandr] trip prompt →", catsMsg);
    }

    const oneCall = async (content, maxTokens) => {
      const data = await complete([{ role: "user", content }], maxTokens);
      const raw  = data.content?.find(b => b.type === "text")?.text || "";
      if (!raw) throw new Error("No response from AI. Please try again.");
      return recoverJSON(raw);
    };

    const tryBuild = async () => {
      const [cats, meta] = await Promise.all([
        oneCall(catsMsg, 6000),
        oneCall(metaMsg, 4000),
      ]);
      // meta provides destination/tagline/season/highlights;
      // cats provides categories. Merge into the single trip object the app expects.
      return { ...meta, categories: cats?.categories || {} };
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
      // Venue grounding (phase 1) — verify GROUNDING.categories against real
      // places data and merge additive fields. Blocking on purpose: sub-second
      // for one category (hard timeout inside), and it means the trip is
      // written to state/localStorage once, complete — no post-save patching
      // race with navigation. Fail-open twice over: verifyTripVenues never
      // throws, and .catch here guarantees a grounding bug can't fail a build.
      const grounded = await verifyTripVenues({ ...parsed, answers }).catch(() => null);
      if (grounded) parsed = { ...parsed, categories: grounded.categories };

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
        answers,
        _error: true,
      };
    }
  }

  return { buildTrip, loading, loadMsg, error };
}
