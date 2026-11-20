/**
 * printBucket — pure builders for the bucket list's export surfaces
 * (2026-08-15, Kraig's prod report: "couldn't export to a PDF with the new
 * bucket feature").
 *
 * Everything here is string-in/string-out so it unit-tests without a window:
 * Dashboard's exportToPdf owns document.write/print, this module owns WHAT
 * gets written. Shelf order and unknown-key tolerance come from
 * bucketShelves (utils) — the same source the on-screen board reads.
 *
 * Every model-authored string passes through escapeHtml: this HTML lands in
 * document.write, so LLM output is untrusted markup (same rule as the
 * itinerary export).
 */
import { bucketPickKey, bucketShelves, countIdeas } from "./utils.js";
import { T } from "./constants.js";

/**
 * A station symbol as an SVG string, for paper. Same geometry and the same
 * four kinds as StationSymbol.jsx (the screen). Keep the two in step:
 * printBucket.test.js compares them.
 */
export function printStation(kind = "stop", px = 14, color = T.ink) {
  const open = `<svg width="${px}" height="${px}" viewBox="0 0 26 26" aria-hidden="true">`;
  switch (kind) {
    case "book": return `${open}<circle cx="13" cy="13" r="10" fill="${T.white}" stroke="${color}" stroke-width="4"/><circle cx="13" cy="13" r="4" fill="${color}"/></svg>`;
    case "end":  return `${open}<rect x="1" y="8" width="24" height="10" fill="${color}"/></svg>`;
    case "done": return `${open}<circle cx="13" cy="13" r="12" fill="${color}"/></svg>`;
    default:     return `${open}<circle cx="13" cy="13" r="10" fill="${T.white}" stroke="${color}" stroke-width="4"/></svg>`;
  }
}

const MAX_PRINT_DOTS = 24;

export function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Grounded street address only when the map URL itself validated (pick A rule). */
function printableAddress(item) {
  const mapOk = item?.verified && typeof item.mapUrl === "string"
    && item.mapUrl.startsWith("https://www.google.com/maps");
  return mapOk && item.address ? item.address : "";
}

/**
 * The trip strip's top rows for a bucket list: the counts, then one station
 * per idea, filled when picked. A bucket list has no dates, so it has no day
 * bars. (The name is kept from the ticket era: it is the strip row now.)
 */
export function bucketTicketRow(ideas, picked) {
  const n = Number(ideas) || 0, p = Number(picked) || 0;
  const dots = Array.from({ length: Math.min(n, MAX_PRINT_DOTS) }, (_, i) => printStation(i < p ? "done" : "stop", 10)).join("");
  return `
        <div class="dates"><span>${n} ${n === 1 ? "idea" : "ideas"} · ${p} picked</span></div>
        ${dots ? `<div class="dots">${dots}</div>` : ""}`;
}

/** The printed body: shelves of idea rows with stations, tips, addresses. */
export function bucketPrintBody(trip) {
  const picks = trip?.bucketPicks || {};
  let html = "";
  for (const [id, label, items] of bucketShelves(trip?.categories)) {
    const shelfPicked = items.filter(it => picks[bucketPickKey(id, it)]).length;
    html += `<h2 class="h2">${escapeHtml(label)}<span class="shelfcount">${shelfPicked ? `${shelfPicked} of ${items.length} picked` : `${items.length} ideas`}</span></h2>`;
    for (const item of items) {
      const picked = !!picks[bucketPickKey(id, item)];
      const addr = printableAddress(item);
      html += `<div class="bcard">
        <div class="stn">${printStation(picked ? "done" : "stop")}</div>
        <div>
          <div class="c-ttl">${escapeHtml(item.name)}${item.priority ? `<span class="prio${item.priority === "essential" ? " hot" : ""}">${escapeHtml(item.priority)}</span>` : ""}</div>
          ${item.description ? `<div class="c-desc">${escapeHtml(item.description)}</div>` : ""}
          ${addr ? `<div class="c-addr">${escapeHtml(addr)}</div>` : ""}
          ${item.proTip ? `<div class="c-tip">${escapeHtml(item.proTip)}</div>` : ""}
        </div>
      </div>`;
    }
  }
  return html;
}

/** Plain-text serialization for the Copy button — checkmarks and all. */
export function bucketPlainText(trip) {
  const picks = trip?.bucketPicks || {};
  const ideas = countIdeas(trip?.categories);
  const picked = Object.keys(picks).length;
  const lines = [
    `${trip?.destination || "My trip"} — bucket list (${ideas} ${ideas === 1 ? "idea" : "ideas"}${picked ? `, ${picked} picked` : ""})`,
  ];
  for (const [id, label, items] of bucketShelves(trip?.categories)) {
    lines.push("", label.toUpperCase());
    for (const item of items) {
      const mark = picks[bucketPickKey(id, item)] ? "[x]" : "[ ]";
      const bits = [item.name, item.description].filter(Boolean).join(" — ");
      lines.push(`${mark} ${bits}${item.priority ? ` (${item.priority})` : ""}`);
      if (item.proTip) lines.push(`    Tip: ${item.proTip}`);
      const addr = printableAddress(item);
      if (addr) lines.push(`    ${addr}`);
    }
  }
  return lines.join("\n");
}
