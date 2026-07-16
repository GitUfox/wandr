/**
 * MLB teams keyed by their official StatsAPI `team.name`, each with the metro
 * aliases we match a trip destination against. Used by events.js to decide
 * whether any home games fall in the traveler's destination during their dates.
 *
 * `name` must match statsapi.mlb.com's `teams.home.team.name` exactly so home
 * games map cleanly. `metros` are lowercased city / suburb / region tokens;
 * matching is word-boundary (see events.js) so short aliases ("la", "sf")
 * only match standalone tokens, never substrings.
 *
 * Venue names are intentionally NOT stored here — events.js reads the live
 * `venue.name` from the API for display, so a ballpark rename never goes stale.
 */
export const MLB_TEAMS = [
  { name: "Baltimore Orioles",       metros: ["baltimore"] },
  { name: "Boston Red Sox",          metros: ["boston", "cambridge"] },
  { name: "New York Yankees",        metros: ["new york", "nyc", "bronx", "manhattan", "brooklyn", "queens"] },
  { name: "Tampa Bay Rays",          metros: ["tampa", "st. petersburg", "st petersburg", "clearwater"] },
  { name: "Toronto Blue Jays",       metros: ["toronto"] },
  { name: "Chicago White Sox",       metros: ["chicago"] },
  { name: "Cleveland Guardians",     metros: ["cleveland"] },
  { name: "Detroit Tigers",          metros: ["detroit"] },
  { name: "Kansas City Royals",      metros: ["kansas city"] },
  { name: "Minnesota Twins",         metros: ["minneapolis", "st. paul", "st paul", "minnesota"] },
  { name: "Houston Astros",          metros: ["houston"] },
  { name: "Los Angeles Angels",      metros: ["anaheim", "orange county"] },
  { name: "Athletics",               metros: ["sacramento", "west sacramento", "oakland"] },
  { name: "Seattle Mariners",        metros: ["seattle"] },
  { name: "Texas Rangers",           metros: ["arlington", "dallas", "fort worth", "dfw"] },
  { name: "Atlanta Braves",          metros: ["atlanta", "cumberland", "marietta"] },
  { name: "Miami Marlins",           metros: ["miami"] },
  { name: "New York Mets",           metros: ["new york", "nyc", "queens", "brooklyn", "manhattan", "bronx"] },
  { name: "Philadelphia Phillies",   metros: ["philadelphia", "philly"] },
  { name: "Washington Nationals",    metros: ["washington", "d.c.", "dc"] },
  { name: "Chicago Cubs",            metros: ["chicago"] },
  { name: "Cincinnati Reds",         metros: ["cincinnati"] },
  { name: "Milwaukee Brewers",       metros: ["milwaukee"] },
  { name: "Pittsburgh Pirates",      metros: ["pittsburgh"] },
  { name: "St. Louis Cardinals",     metros: ["st. louis", "st louis", "saint louis"] },
  { name: "Arizona Diamondbacks",    metros: ["phoenix", "scottsdale", "tempe", "mesa", "chandler", "glendale", "gilbert", "arizona"] },
  { name: "Colorado Rockies",        metros: ["denver", "colorado"] },
  { name: "Los Angeles Dodgers",     metros: ["los angeles", "la", "hollywood", "pasadena"] },
  { name: "San Diego Padres",        metros: ["san diego"] },
  { name: "San Francisco Giants",    metros: ["san francisco", "sf", "bay area"] },
];
