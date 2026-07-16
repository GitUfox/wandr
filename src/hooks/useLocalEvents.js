import { useState, useEffect } from "react";
import { fetchTripGames } from "../lib/events.js";

// Interest chips that signal the traveler cares about baseball. Having a
// favorite team counts too, even if the chip wasn't checked.
const BASEBALL_TAGS = ["Baseball", "Spring-training"];

/**
 * Fetch real local events (MLB games, §7) for the current trip, personalized
 * to the traveler. Only surfaces games when they've shown baseball interest —
 * relevance over reach — and flags/sorts their favorite team's games first.
 * Refetches when trip inputs change; aborts in flight on unmount/change.
 * Failures are swallowed (returns no games) — a bonus surface must never error.
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

  const [games, setGames]     = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!dest || !start || !end || !eligible) { setGames([]); return; }
    const controller = new AbortController();
    setLoading(true);
    fetchTripGames(dest, start, end, favTeams, controller.signal)
      .then(g => { if (!controller.signal.aborted) setGames(g); })
      .catch(() => { /* silent — bonus feature */ })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dest, start, end, eligible, favKey]);

  return { games, loading };
}
