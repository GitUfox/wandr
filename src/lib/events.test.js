import { describe, it, expect } from "vitest";
import { matchDestinationTeams } from "./events.js";

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
