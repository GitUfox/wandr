import { useState, useEffect } from "react";
import { fetchTripGames } from "../lib/events.js";

/**
 * Fetch real local events (MLB games, §7 first slice) for the current trip's
 * destination + dates. Refetches when those change; aborts in flight on
 * unmount or change. Failures are swallowed (returns no games) — this is a
 * bonus surface that must never surface an error.
 */
export function useLocalEvents(trip) {
  const dest  = trip?.answers?.destination || trip?.destination || "";
  const start = trip?.answers?.dates?.start || "";
  const end   = trip?.answers?.dates?.end   || "";
  const [games, setGames]     = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!dest || !start || !end) { setGames([]); return; }
    const controller = new AbortController();
    setLoading(true);
    fetchTripGames(dest, start, end, controller.signal)
      .then(g => { if (!controller.signal.aborted) setGames(g); })
      .catch(() => { /* silent — bonus feature */ })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [dest, start, end]);

  return { games, loading };
}
