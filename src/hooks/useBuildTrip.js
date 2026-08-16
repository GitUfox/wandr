import { useState, useRef } from "react";
import { complete } from "../lib/api.js";
import { buildTripCategoriesPrompt } from "../lib/prompts.js";
import { recoverJSON, seasonShort } from "../lib/utils.js";
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

    // ONE slim call (2026-08-05 speed pass). The old meta half (tagline/
    // highlights/normalized destination/season) is gone: the dashboard no
    // longer renders tagline or highlights, destination is the traveler's own
    // input (Places autocomplete normalizes it once 5A is active), and season
    // is derived locally below. One call per build also means LIMIT_TRIPS now
    // counts whole trips, not halves — see api/shared.js.
    const { messageContent: catsMsg, n } = buildTripCategoriesPrompt(answers, uploadedFiles);

    // Dev-only: inspect the assembled prompt (interests weighting, conflict rule,
    // etc.). Gated behind import.meta.env.DEV so it never ships to production.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[Wandr] trip prompt →", catsMsg);
    }

    // Slim schema is ~4 short fields × 3 items × ≤5 categories (~1k tokens of
    // JSON); 4000 is a runaway backstop, not a target — see the Bangkok 500s
    // for why an unpinned cap matters.
    const tryBuild = async () => {
      const data = await complete([{ role: "user", content: catsMsg }], 4000);
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
      let trip = {
        destination: answers.destination,
        // "bucket" = dateless activity list (2026-08-15); absent/legacy = itinerary.
        tripStyle:   answers.tripStyle || "itinerary",
        // Bucket trips have no dates: prompts returns n=null and season stays
        // empty (season flavor went into the prompt's TIMEFRAME line instead).
        nights:      n,
        // Short derived label ("Early June") — replaces the old AI-written
        // season sentence in buildPlanPrompt's "- Season:" line.
        season:      seasonShort(answers.dates?.start),
        categories:  parsed?.categories || {},
        answers,
      };
      // Venue grounding (phase 1) — verify GROUNDING.categories against real
      // places data and merge additive fields. Blocking on purpose: sub-second
      // for one category (hard timeout inside), and it means the trip is
      // written to state/localStorage once, complete — no post-save patching
      // race with navigation. Fail-open twice over: verifyTripVenues never
      // throws, and .catch here guarantees a grounding bug can't fail a build.
      const grounded = await verifyTripVenues(trip).catch(() => null);
      if (grounded) trip = { ...trip, categories: grounded.categories };

      clearInterval(loadRef.current);
      setLoading(false);
      return trip;
    } catch (e) {
      clearInterval(loadRef.current);
      setError(e.message);
      setLoading(false);
      // Return a skeleton trip so the dashboard still renders
      return {
        destination: answers.destination,
        tripStyle: answers.tripStyle || "itinerary",
        nights: n,
        categories: {},
        answers,
        _error: true,
      };
    }
  }

  return { buildTrip, loading, loadMsg, error };
}
