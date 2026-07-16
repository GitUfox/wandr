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
 * Filter the raw schedule to home games at the destination, flag the ones
 * involving a favorite team, and sort those first. Pure — split out from the
 * fetch so it's unit-testable without a network call.
 *
 * Each returned game: { date, home, away, venue, yours, role }
 *   yours — favorite team is playing (home OR away — an away favorite means
 *           "your team is visiting the destination", e.g. Diamondbacks @ Yankees)
 *   role  — "home" | "away" | null, relative to the favorite team
 */
export function tagAndSortGames(dates, destinationTeams, favoriteTeams) {
  const wanted = new Set(destinationTeams);
  const fav = new Set(favoriteTeams || []);
  const games = [];
  for (const d of dates || []) {
    for (const g of d.games || []) {
      const home = g.teams?.home?.team?.name;
      if (!wanted.has(home)) continue;
      const away = g.teams?.away?.team?.name || "";
      const role = fav.has(home) ? "home" : fav.has(away) ? "away" : null;
      games.push({ date: d.date, home, away, venue: g.venue?.name || "", yours: role !== null, role });
    }
  }
  // Favorite-team games first; stable sort keeps chronological order within each group.
  games.sort((a, b) => (b.yours === true) - (a.yours === true));
  return games;
}

/**
 * Fetch real MLB games at the destination between the two ISO dates, with any
 * favorite-team games flagged and sorted first. Empty on no match, bad dates,
 * or any network/parse failure (a bonus surface; absence must never error).
 */
export async function fetchTripGames(destination, startDate, endDate, favoriteTeams, signal) {
  const teams = matchDestinationTeams(destination);
  if (!teams.length) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "") || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || "")) return [];

  try {
    const url = `${SCHEDULE_URL}?sportId=1&startDate=${startDate}&endDate=${endDate}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return tagAndSortGames(data.dates, teams, favoriteTeams);
  } catch {
    return []; // network/abort/parse — silently yield no games
  }
}
