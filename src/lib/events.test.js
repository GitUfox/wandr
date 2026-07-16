import { describe, it, expect } from "vitest";
import { matchDestinationTeams, tagAndSortGames } from "./events.js";

// Minimal shape mirroring statsapi.mlb.com's schedule payload.
const game = (date, away, home, venue) => ({ date, games: [{ teams: { away: { team: { name: away } }, home: { team: { name: home } } }, venue: { name: venue } }] });

describe("matchDestinationTeams", () => {
  it("matches a suburb to its metro team (Scottsdale → Diamondbacks)", () => {
    expect(matchDestinationTeams("Scottsdale, AZ")).toEqual(["Arizona Diamondbacks"]);
  });

  it("returns BOTH teams for a two-team metro (New York → Yankees + Mets)", () => {
    const teams = matchDestinationTeams("New York City");
    expect(teams).toContain("New York Yankees");
    expect(teams).toContain("New York Mets");
    expect(teams).toHaveLength(2);
  });

  it("matches on the unambiguous region name (Arizona)", () => {
    expect(matchDestinationTeams("Arizona")).toEqual(["Arizona Diamondbacks"]);
  });

  it("matches a bare short alias as a standalone token (LA → Dodgers)", () => {
    expect(matchDestinationTeams("LA")).toEqual(["Los Angeles Dodgers"]);
  });

  it("does not false-match a short alias inside another word", () => {
    // "la" must not match inside "Atlanta"/"Dallas"; "Atlanta" → Braves only.
    expect(matchDestinationTeams("Atlanta, GA")).toEqual(["Atlanta Braves"]);
    // "Orlando" contains no team metro → no match, and never the LA teams.
    expect(matchDestinationTeams("Orlando, FL")).toEqual([]);
  });

  it("returns empty for a city with no MLB team", () => {
    expect(matchDestinationTeams("Boise, ID")).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(matchDestinationTeams("PHOENIX")).toEqual(["Arizona Diamondbacks"]);
  });

  it("returns empty for falsy or non-string input", () => {
    expect(matchDestinationTeams("")).toEqual([]);
    expect(matchDestinationTeams(null)).toEqual([]);
    expect(matchDestinationTeams(undefined)).toEqual([]);
  });
});

describe("tagAndSortGames", () => {
  const dates = [
    game("2026-08-07", "Los Angeles Dodgers", "Arizona Diamondbacks", "Chase Field"),
    game("2026-08-08", "Colorado Rockies",    "Arizona Diamondbacks", "Chase Field"),
    game("2026-08-08", "Boston Red Sox",       "New York Yankees",     "Yankee Stadium"), // not a destination team here
  ];

  it("keeps only games whose home team is at the destination", () => {
    const out = tagAndSortGames(dates, ["Arizona Diamondbacks"], []);
    expect(out).toHaveLength(2);
    expect(out.every(g => g.home === "Arizona Diamondbacks")).toBe(true);
  });

  it("flags a home favorite ('are home') and leaves others unflagged", () => {
    const out = tagAndSortGames(dates, ["Arizona Diamondbacks"], ["Arizona Diamondbacks"]);
    expect(out.every(g => g.yours && g.role === "home")).toBe(true);
  });

  it("flags an AWAY favorite visiting the destination (Diamondbacks @ Yankees in NYC)", () => {
    // Traveler is in NYC (destination team = Yankees); their team is the Diamondbacks, visiting.
    const nyc = [game("2026-08-09", "Arizona Diamondbacks", "New York Yankees", "Yankee Stadium")];
    const out = tagAndSortGames(nyc, ["New York Yankees", "New York Mets"], ["Arizona Diamondbacks"]);
    expect(out).toHaveLength(1);
    expect(out[0].yours).toBe(true);
    expect(out[0].role).toBe("away");
  });

  it("sorts favorite-team games first, preserving chronological order within groups", () => {
    const mixed = [
      game("2026-08-07", "Colorado Rockies",    "New York Yankees",     "Yankee Stadium"), // not yours
      game("2026-08-08", "Arizona Diamondbacks", "New York Yankees",     "Yankee Stadium"), // yours (away)
    ];
    const out = tagAndSortGames(mixed, ["New York Yankees"], ["Arizona Diamondbacks"]);
    expect(out[0].yours).toBe(true);   // the Diamondbacks game rises to the top
    expect(out[1].yours).toBe(false);
  });

  it("surfaces destination games with no favorite (love-the-game case)", () => {
    const out = tagAndSortGames(dates, ["Arizona Diamondbacks"], []);
    expect(out).toHaveLength(2);
    expect(out.every(g => g.yours === false && g.role === null)).toBe(true);
  });
});
