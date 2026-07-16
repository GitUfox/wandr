/**
 * MLB teams keyed by their official StatsAPI `team.name`, each with the metro
 * aliases we match a trip destination against. Used by events.js to decide
 * whether any home games fall in the traveler's destination during their dates.
 *
 * `name` must match statsapi.mlb.com's `teams.home.team.name` exactly so home
 * games map cleanly. `short` is the nickname for display. `metros` are
 * lowercased city / suburb / region tokens; matching is word-boundary (see
 * events.js) so short aliases ("la", "sf") only match standalone tokens.
 *
 * Venue names are intentionally NOT stored here — events.js reads the live
 * `venue.name` from the API for display, so a ballpark rename never goes stale.
 */
export const MLB_TEAMS = [
  { name: "Baltimore Orioles",       short: "Orioles",      metros: ["baltimore"] },
  { name: "Boston Red Sox",          short: "Red Sox",      metros: ["boston", "cambridge"] },
  { name: "New York Yankees",        short: "Yankees",      metros: ["new york", "nyc", "bronx", "manhattan", "brooklyn", "queens"] },
  { name: "Tampa Bay Rays",          short: "Rays",         metros: ["tampa", "st. petersburg", "st petersburg", "clearwater"] },
  { name: "Toronto Blue Jays",       short: "Blue Jays",    metros: ["toronto"] },
  { name: "Chicago White Sox",       short: "White Sox",    metros: ["chicago"] },
  { name: "Cleveland Guardians",     short: "Guardians",    metros: ["cleveland"] },
  { name: "Detroit Tigers",          short: "Tigers",       metros: ["detroit"] },
  { name: "Kansas City Royals",      short: "Royals",       metros: ["kansas city"] },
  { name: "Minnesota Twins",         short: "Twins",        metros: ["minneapolis", "st. paul", "st paul", "minnesota"] },
  { name: "Houston Astros",          short: "Astros",       metros: ["houston"] },
  { name: "Los Angeles Angels",      short: "Angels",       metros: ["anaheim", "orange county"] },
  { name: "Athletics",               short: "Athletics",    metros: ["sacramento", "west sacramento", "oakland"] },
  { name: "Seattle Mariners",        short: "Mariners",     metros: ["seattle"] },
  { name: "Texas Rangers",           short: "Rangers",      metros: ["arlington", "dallas", "fort worth", "dfw"] },
  { name: "Atlanta Braves",          short: "Braves",       metros: ["atlanta", "cumberland", "marietta"] },
  { name: "Miami Marlins",           short: "Marlins",      metros: ["miami"] },
  { name: "New York Mets",           short: "Mets",         metros: ["new york", "nyc", "queens", "brooklyn", "manhattan", "bronx"] },
  { name: "Philadelphia Phillies",   short: "Phillies",     metros: ["philadelphia", "philly"] },
  { name: "Washington Nationals",    short: "Nationals",    metros: ["washington", "d.c.", "dc"] },
  { name: "Chicago Cubs",            short: "Cubs",         metros: ["chicago"] },
  { name: "Cincinnati Reds",         short: "Reds",         metros: ["cincinnati"] },
  { name: "Milwaukee Brewers",       short: "Brewers",      metros: ["milwaukee"] },
  { name: "Pittsburgh Pirates",      short: "Pirates",      metros: ["pittsburgh"] },
  { name: "St. Louis Cardinals",     short: "Cardinals",    metros: ["st. louis", "st louis", "saint louis"] },
  { name: "Arizona Diamondbacks",    short: "Diamondbacks", metros: ["phoenix", "scottsdale", "tempe", "mesa", "chandler", "glendale", "gilbert", "arizona"] },
  { name: "Colorado Rockies",        short: "Rockies",      metros: ["denver", "colorado"] },
  { name: "Los Angeles Dodgers",     short: "Dodgers",      metros: ["los angeles", "la", "hollywood", "pasadena"] },
  { name: "San Diego Padres",        short: "Padres",       metros: ["san diego"] },
  { name: "San Francisco Giants",    short: "Giants",       metros: ["san francisco", "sf", "bay area"] },
];

/** Official-name → nickname lookup for display. */
export const TEAM_SHORT = Object.fromEntries(MLB_TEAMS.map(t => [t.name, t.short]));
