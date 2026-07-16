/**
 * Local events grounding (§7, first slice) — surface real MLB games happening
 * at the traveler's destination during their trip dates.
 *
 * The MLB StatsAPI (statsapi.mlb.com) is free, keyless, and CORS-open, so this
 * runs straight from the browser — no proxy, no API key. We fetch the
 * league-wide schedule for the date range and filter locally by home-team
 * metro, so no destination or user data is ever sent to MLB.
 */
import { MLB_TEAMS } from "./mlbTeams.js";

const SCHEDULE_URL = "https://statsapi.mlb.com/api/v1/schedule";

/** Escape a string for safe use inside a RegExp. */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Which MLB teams call the given destination home. Word-boundary matched
 * against each team's metro aliases, so "Scottsdale, AZ" → Diamondbacks and
 * "New York" → both Yankees and Mets, without short aliases ("la") matching
 * inside unrelated words. Returns an array of official team names.
 */
export function matchDestinationTeams(destination) {
  if (!destination || typeof destination !== "string") return [];
  const dest = destination.toLowerCase();
  return MLB_TEAMS
    .filter(t => t.metros.some(m => new RegExp(`\\b${escapeRegex(m)}\\b`).test(dest)))
    .map(t => t.name);
}

/**
 * Fetch real MLB home games at the destination between the two ISO dates.
 * Returns [{ date, home, away, venue }] — empty on no match, bad dates, or any
 * network/parse failure (this is a bonus surface; absence must never error).
 */
export async function fetchTripGames(destination, startDate, endDate, signal) {
  const teams = matchDestinationTeams(destination);
  if (!teams.length) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "") || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || "")) return [];

  const wanted = new Set(teams);
  try {
    const url = `${SCHEDULE_URL}?sportId=1&startDate=${startDate}&endDate=${endDate}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    const games = [];
    for (const d of data.dates || []) {
      for (const g of d.games || []) {
        const home = g.teams?.home?.team?.name;
        if (wanted.has(home)) {
          games.push({
            date: d.date,
            home,
            away: g.teams?.away?.team?.name || "",
            venue: g.venue?.name || "",
          });
        }
      }
    }
    return games;
  } catch {
    return []; // network/abort/parse — silently yield no games
  }
}
