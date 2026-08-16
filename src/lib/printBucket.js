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
 * The light-stock ticket's top row for a bucket trip: IDEAS n · earth · PICKED m.
 * `earthSvg` is the shared print-earth markup owned by exportToPdf (single
 * source — the itinerary ticket seats the same string).
 */
export function bucketTicketRow(ideas, picked, earthSvg) {
  return `
        <div style="display:flex;align-items:center;gap:14px;padding:13px 34px 11px 16px">
          <div><div class="p-label">Ideas</div><div class="p-date">${Number(ideas) || 0}</div></div>
          ${earthSvg}
          <div style="text-align:right"><div class="p-label">Picked</div><div class="p-date">${Number(picked) || 0}</div></div>
        </div>
        <div class="perf"><div class="notch" style="left:-31px"></div><div class="notch" style="right:-31px"></div></div>`;
}

/** The printed body: shelves of idea cards with check rings, tips, addresses. */
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
        <div class="bring${picked ? " on" : ""}">${picked ? "✓" : ""}</div>
        <div>
          <div class="c-ttl">${escapeHtml(item.name)}${item.priority ? `<span class="chip${item.priority === "essential" ? " hot" : ""}" style="margin-left:6px">${escapeHtml(item.priority)}</span>` : ""}</div>
          ${item.description ? `<div class="c-desc">${escapeHtml(item.description)}</div>` : ""}
          ${addr ? `<div class="c-addr"><svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="#9a938c" stroke-width="2.2" stroke-linecap="round"><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>${escapeHtml(addr)}</div>` : ""}
          ${item.proTip ? `<div class="c-tip"><span class="bang">!</span><span>${escapeHtml(item.proTip)}</span></div>` : ""}
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
