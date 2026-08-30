#!/usr/bin/env node
/**
 * Prompt quality harness — generates REAL itineraries and scores them.
 *
 * Why this exists: "output quality" has no finish line, so a prompt pass turns
 * into endless re-tweaking with no way to tell improvement from churn. This
 * measures the mechanically-checkable defects (src/lib/planQuality.js) against
 * live output, so a prompt change can be shown to help rather than assumed to.
 *
 * It caught the defect it was built to find: paceInstruction said "max 2–3
 * activities" for a Slow trip while three other lines in the same prompt said
 * a flat "3 to 5". The model averaged them and returned 4. Baseline 90 → 100.
 *
 * USAGE
 *   npm run server                 # proxy must be running (uses .env.local key)
 *   node scripts/quality-check.mjs baseline
 *   ...change prompts...
 *   node scripts/quality-check.mjs after
 *   node scripts/quality-check.mjs --compare baseline after
 *
 * COSTS REAL API CALLS — 2 per case (1 build + 1 plan). Localhost is treated as
 * dev by server.js, so it bypasses the per-IP rate limit; it does not bypass
 * billing. Keep the case list short.
 *
 * Results are written to .quality/<label>.json (gitignored).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTDIR = path.join(ROOT, ".quality");
const PROXY = process.env.WANDR_PROXY || "http://localhost:3001/api/anthropic";

const { buildTripCategoriesPrompt, buildPlanPrompt } =
  await import(path.join(ROOT, "src/lib/prompts.js"));
const { parsePlan } = await import(path.join(ROOT, "src/lib/planModel.js"));
const { scorePlan } = await import(path.join(ROOT, "src/lib/planQuality.js"));
const { recoverJSON } = await import(path.join(ROOT, "src/lib/utils.js"));

// Two travelers pulling the pace and rhythm levers in opposite directions —
// the instructions most likely to be quietly ignored or averaged away.
const CASES = [
  {
    name: "phoenix-fast-early",
    answers: {
      destination: "Scottsdale, Arizona",
      dates: { start: "2026-10-12", end: "2026-10-15" },
      party: { chips: ["Couple"], text: "", kids: "" },
      logistics: { stay: "Old Town Scottsdale", transport: ["Car"], pace: "Fast", focus: "Mix of both", rhythm: "Early riser" },
      budget: 150,
      interests: { chips: ["Golf", "Hiking", "ATV", "Museums"], text: "", priorityChips: ["Golf"] },
      avoid: "crowds",
      notes: "",
    },
  },
  {
    name: "lisbon-slow-owl",
    answers: {
      destination: "Lisbon, Portugal",
      dates: { start: "2026-09-08", end: "2026-09-11" },
      party: { chips: ["Friends"], text: "", kids: "" },
      logistics: { stay: "Alfama", transport: ["Transit", "Walking"], pace: "Slow", focus: "Hidden gems", rhythm: "Night owl" },
      budget: 110,
      interests: { chips: ["Live-music", "Galleries", "Bars", "Scenic-views"], text: "", priorityChips: ["Live-music"] },
      avoid: "long hikes",
      notes: "",
    },
  },
];

function loadRun(label) {
  const p = path.join(OUTDIR, `${label}.json`);
  if (!fs.existsSync(p)) { console.error(`no run named "${label}" in .quality/`); process.exit(1); }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// --compare mode: no API calls, just diff two stored runs.
if (process.argv[2] === "--compare") {
  const [a, b] = [loadRun(process.argv[3]), loadRun(process.argv[4])];
  const byCase = (r) => Object.fromEntries(r.results.map(x => [x.case, x]));
  const A = byCase(a), B = byCase(b);
  console.log(`\n${a.label} → ${b.label}\n`);
  for (const name of Object.keys(A)) {
    if (!B[name]) continue;
    const d = B[name].score - A[name].score;
    console.log(`${name.padEnd(22)} ${String(A[name].score).padStart(3)} → ${String(B[name].score).padStart(3)}  ${d > 0 ? "+" + d : d}`);
    const gone = A[name].issues.filter(i => !B[name].issues.some(j => j.code === i.code));
    const nu   = B[name].issues.filter(i => !A[name].issues.some(j => j.code === i.code));
    for (const i of gone) console.log(`   fixed    [${i.code}] ${i.detail}`);
    for (const i of nu)   console.log(`   NEW      [${i.code}] ${i.detail}`);
  }
  const avg = (r) => Math.round(r.results.reduce((s, x) => s + x.score, 0) / r.results.length);
  console.log(`\naverage ${avg(a)} → ${avg(b)}\n`);
  process.exit(0);
}

async function call(content, maxTokens, stream = false) {
  const res = await fetch(PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, stream, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) throw new Error(`proxy ${res.status}: ${(await res.text()).slice(0, 200)}`);
  if (!stream) {
    const data = await res.json();
    return data.content?.find(b => b.type === "text")?.text || "";
  }
  let out = "", buf = "";
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") continue;
      try {
        const j = JSON.parse(raw);
        if (j.type === "content_block_delta" && j.delta?.text) out += j.delta.text;
      } catch { /* partial frame */ }
    }
  }
  return out;
}

const LABEL = process.argv[2] || "run";
fs.mkdirSync(OUTDIR, { recursive: true });

const results = [];
for (const c of CASES) {
  process.stdout.write(`\n▶ ${c.name} — building trip… `);
  // ONE slim build call — the meta call was deleted in the 08-05 speed pass
  // (destination is the traveler's own input); this mirrors useBuildTrip.
  const { messageContent: catsMsg, n } = buildTripCategoriesPrompt(c.answers);
  const catsRaw = await call(catsMsg, 6000);
  const trip = {
    destination: c.answers.destination,
    categories: recoverJSON(catsRaw)?.categories || {},
    answers: c.answers,
    nights: n,
  };
  process.stdout.write("generating plan… ");
  const planText = await call(buildPlanPrompt("full", trip), 8000, true);
  const scored = scorePlan(parsePlan(planText), planText, c.answers);
  process.stdout.write(`score ${scored.score}\n`);
  for (const i of scored.issues) console.log(`    - [${i.code}] ${i.detail}`);
  console.log(`    ${scored.stats.days} days, per-day ${JSON.stringify(scored.stats.perDay)}`);
  results.push({ case: c.name, score: scored.score, issues: scored.issues, stats: scored.stats, planText });
}

fs.writeFileSync(path.join(OUTDIR, `${LABEL}.json`), JSON.stringify({ label: LABEL, results }, null, 2));
console.log(`\n═══ ${LABEL}: average ${Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)} ═══`);
