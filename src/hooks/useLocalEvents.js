import { useState, useEffect, useMemo } from "react";
import { fetchTripGames, matchDestinationTeams } from "../lib/events.js";

// Interest chips that signal the traveler cares about baseball. Having a
// favorite team counts too, even if the chip wasn't checked.
const BASEBALL_TAGS = ["Baseball", "Spring-training"];

/**
 * Fetch real local events (MLB games, §7) for the current trip, personalized
 * to the traveler. Refetches when trip inputs change; aborts in flight on
 * unmount/change. Failures are swallowed — a bonus surface must never error.
 *
 * Two consumers, two different gates (§15.2 C):
 *   games  — DISPLAY. Still gated on baseball interest: relevance over reach,
 *            a non-baseball traveler shouldn't see a sports card. Unchanged.
 *   forPrompt — GENERATION. Never gated. The model needs the schedule even when
 *            the traveler never asked for baseball, precisely so it cannot
 *            invent a game — Baltimore got a Camden Yards home game on a day the
 *            Orioles were away in Tampa. `resolved` marks a settled fetch, so a
 *            still-in-flight lookup can't be read as "no games exist".
 *
 * The fetch costs nothing for most destinations: matchDestinationTeams returns
 * [] for a city with no MLB team and fetchTripGames exits before any network.
 */
export function useLocalEvents(trip) {
  const dest      = trip?.answers?.destination || trip?.destination || "";
  const start     = trip?.answers?.dates?.start || "";
  const end       = trip?.answers?.dates?.end   || "";
  const chips     = trip?.answers?.interests?.chips || [];
  const favTeams  = trip?.answers?.interests?.teams || [];
  const likesBaseball = chips.some(c => BASEBALL_TAGS.includes(c));
  const eligible  = likesBaseball || favTeams.length > 0;
  const favKey    = favTeams.join("|"); // stable dep for the effect

  const [games, setGames]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [resolved, setResolved] = useState(false);

  const teams = useMemo(() => matchDestinationTeams(dest), [dest]);

  useEffect(() => {
    setResolved(false);
    if (!dest || !start || !end) { setGames([]); return; }
    const controller = new AbortController();
    setLoading(true);
    fetchTripGames(dest, start, end, favTeams, controller.signal)
      .then(g => { if (!controller.signal.aborted) { setGames(g); setResolved(true); } })
      .catch(() => { /* silent — bonus feature */ })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dest, start, end, favKey]);

  return {
    games: eligible ? games : [], // display — interest-gated, as before
    loading,
    // Facts for buildPlanPrompt. `interested` tells the prompt whether the model
    // may schedule a listed game or is only being told they exist so it can't
    // fabricate one. `resolved:false` suppresses the block entirely — asserting
    // "no games" from an unfinished fetch would be a false negative.
    forPrompt: { teams, games, interested: eligible, resolved },
  };
}
