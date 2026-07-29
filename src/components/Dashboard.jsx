/**
 * Dashboard — the post-interview trip view.
 *
 * Manages its own print-modal state (only relevant here).
 * Everything else — trip data, plan state — comes from App.jsx via props.
 */
import { useState, useEffect, useRef } from "react";
import { MODES, T, FEATURES } from "../lib/constants.js";
import { useOnline } from "../hooks/useOnline.js";
import { arr, formatShortDate, ticketDate, seasonShort, timeAgo } from "../lib/utils.js";
import { TEAM_SHORT } from "../lib/mlbTeams.js";
import Md from "./Md.jsx";
import ItineraryEditor from "./ItineraryEditor.jsx";
import WandrLogo from "./WandrLogo.jsx";
import EditTripSheet from "./EditTripSheet.jsx";
import StardustBurst from "./StardustBurst.jsx";

export default function Dashboard({
  trip,
  trips = [],
  onSwitchTrip,
  tripGames,
  planText, planModel, planLoading, planMode, generatedAt,
  patchError,
  debugMsg,
  onGenerate,
  onEditPlan,
  onEditTripDetails,
  onEditActivity,
  onDeleteActivity,
  onReorderDay,
  onMoveActivity,
  onMoveToBucket,
  onTweakActivity,
  tweakingId,
  onReset,
  showProfilePrompt,
  onSaveProfile,
  onDismissProfilePrompt,
}) {
  const [copied, setCopied]           = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editSheetStage, setEditSheetStage] = useState(null); // "full-itinerary" when opened via Remix, else null (picker)
  const [eventsDismissed, setEventsDismissed] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const online = useOnline();

  // 8C stardust on "itinerary ready": fire once when a generation finishes
  // successfully (loading→done with a parsed model — error text never sets
  // planModel, so failures don't sparkle).
  const [readyBurst, setReadyBurst] = useState(0);
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (wasLoadingRef.current && !planLoading && planModel) setReadyBurst(b => b + 1);
    wasLoadingRef.current = planLoading;
  }, [planLoading, planModel]);

  // Only render the switcher when there's somewhere to switch to.
  const otherTrips = trips.filter(t => t.id !== trip?.id);

  function stripMarkdown(text) {
    return text.split("\n").map(line => {
      // Remove custom markers
      if (["TABLE:","ENDTABLE","FOOD:","ENDFOOD"].includes(line.trim())) return null;
      // Table separator rows
      if (line.trim().match(/^\|[-| ]+\|$/)) return null;
      // Table rows → tab-separated
      if (line.trim().startsWith("|")) {
        return line.trim().replace(/^\||\|$/g, "").split("|").map(c => c.replace(/\*\*/g, "").trim()).join("   ");
      }
      // TIPS: x | y | z → "Tips: x, y, z"
      if (line.trim().startsWith("TIPS:")) {
        return "Tips: " + line.replace("TIPS:","").trim().split("|").map(t => t.trim()).filter(Boolean).join(", ");
      }
      // Headings — uppercase H2, plain H3
      if (line.startsWith("## "))  return "\n" + line.slice(3).toUpperCase();
      if (line.startsWith("### ")) return line.slice(4);
      // Strip bold markers
      return line.replace(/\*\*([^*]+)\*\*/g, "$1");
    }).filter(l => l !== null).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function copyPlan() {
    navigator.clipboard.writeText(stripMarkdown(planText)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {
      setCopied("error");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const a = trip.answers;

  // "Watertown & Thousand Islands, NY, USA" → hero "Watertown & Thousand
  // Islands" + quiet region line "NY, USA". No comma = no region line.
  const [destMain, ...destRest] = String(trip.destination || "").split(",");
  const destRegion = destRest.join(",").trim();

  // Boarding-pass data — shared by the on-screen hero and the PDF export (9B)
  // so the two tickets can never drift.
  const dep = ticketDate(a.dates?.start);
  const ret = ticketDate(a.dates?.end);
  const tripStubs = [
    ["Nights", trip.nights ? `${trip.nights}` : ""],
    ["Budget", a.budget === 0 ? "With friends" : a.budget ? `$${a.budget}/day` : ""],
    ["Party",  arr(a.party).split(",")[0]],
    ["Season", seasonShort(a.dates?.start) ? `☀ ${seasonShort(a.dates.start)}` : ""],
  ].filter(([, v]) => v);

  /** Convert ISO date "2026-06-08" → "6/8/2026" */
  function fmtDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${parseInt(m)}/${parseInt(d)}/${y}`;
  }

  function htmlEscape(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function exportToPdf() {
    // Boarding-pass ticket (design pick 9B) — the same object as the hero,
    // translated to paper: light-grey stock, perforation, barcode.
    const stubsHtml = tripStubs.map(([l, v]) => `
      <div>
        <div class="p-label">${htmlEscape(l)}</div>
        <div style="font-size:11px;font-weight:700">${htmlEscape(v)}</div>
      </div>`).join("");
    const ticketHtml = `
      <div class="ticket">
        <div class="barcode"></div>
        ${dep && ret ? `
        <div style="display:flex;align-items:center;gap:14px;padding:13px 34px 11px 16px">
          <div><div class="p-label">Depart</div><div class="p-date">${htmlEscape(dep)}</div></div>
          <svg viewBox="0 0 46 16" style="flex:1;height:14px;min-width:36px" aria-hidden="true">
            <line x1="0" y1="8" x2="18" y2="8" stroke="#d8d2cb" stroke-dasharray="2 3"/>
            <path d="M22 14L40 8 22 2l3 6z" fill="#c96442"/>
          </svg>
          <div style="text-align:right"><div class="p-label">Return</div><div class="p-date">${htmlEscape(ret)}</div></div>
        </div>
        <div class="perf"><div class="notch" style="left:-31px"></div><div class="notch" style="right:-31px"></div></div>` : ""}
        <div style="display:flex;gap:20px;padding:10px 34px 13px 16px">${stubsHtml}</div>
      </div>`;

    // Build body HTML — properly open/close <table> only around actual table rows
    const lines = planText.split("\n");
    let bodyHtml = "";
    let inTable  = false;

    for (const line of lines) {
      const t = line.trim();
      const isTableRow = t.startsWith("|") && !t.match(/^\|[-| :]+\|$/);

      if (isTableRow) {
        if (!inTable) { bodyHtml += `<table style="width:100%;border-collapse:collapse;margin:8px 0 16px"><colgroup><col style="width:42px"/><col style="width:32%"/><col/></colgroup><tbody>`; inTable = true; }
        const cells = t.replace(/^\||\|$/g, "").split("|").map(c => c.trim().replace(/\*\*/g, ""));
        const isHeader = cells[0]?.toLowerCase() === "time";
        if (isHeader) {
          bodyHtml += `<tr style="border-bottom:2px solid #e8e8e8">${cells.map(c => `<th style="padding:5px 8px;text-align:left;font-size:9px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.06em">${c}</th>`).join("")}</tr>`;
        } else {
          bodyHtml += `<tr style="border-bottom:1px solid #eee">${cells.map((c, i) => `<td style="padding:7px 8px;font-size:${i===2?11:12}px;color:${i===0?"#c96442":i===1?"#0d0d0d":"#555"};font-weight:${i===1?700:i===0?700:400};vertical-align:top;line-height:1.5">${c}</td>`).join("")}</tr>`;
        }
        continue;
      }

      if (inTable) { bodyHtml += `</tbody></table>`; inTable = false; }

      if (["TABLE:","ENDTABLE","FOOD:","ENDFOOD"].includes(t)) continue;
      if (t.match(/^\|[-| :]+\|$/)) continue;
      if (line.startsWith("## ")) {
        const label = line.slice(3);
        const dm = label.match(/^Day (\d+) — (.+)$/);
        // Day headers get the 9B number chip; any other h2 stays typographic.
        bodyHtml += dm
          ? `<div class="dayhead"><span class="daychip">${String(dm[1]).padStart(2, "0")}</span><span>${htmlEscape(dm[2])}</span></div>`
          : `<h2 style="font-size:16px;font-weight:800;color:#0d0d0d;margin:24px 0 8px;padding-bottom:5px;border-bottom:1px solid #e8e8e8">${htmlEscape(label)}</h2>`;
        continue;
      }
      if (line.startsWith("### ")) { bodyHtml += `<h3 style="font-size:11px;font-weight:700;color:#c96442;text-transform:uppercase;letter-spacing:.08em;margin:14px 0 6px">${line.slice(4)}</h3>`; continue; }
      if (t.startsWith("TIPS:")) {
        const tips = t.replace("TIPS:","").split("|").map(s => s.trim()).filter(Boolean);
        bodyHtml += `<div style="margin:8px 0 14px">${tips.map(tip => `<span style="display:inline-block;font-size:11px;background:#f5f5f5;border:1px solid #e0e0e0;border-radius:4px;padding:3px 8px;color:#555;margin:2px 4px 2px 0">${tip}</span>`).join("")}</div>`;
        continue;
      }
      if (!t) { bodyHtml += `<div style="height:6px"></div>`; continue; }
      bodyHtml += `<p style="font-size:12.5px;color:#333;line-height:1.65;margin:0 0 4px">${line.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")}</p>`;
    }
    if (inTable) bodyHtml += `</tbody></table>`;

    const w = window.open("", "_blank");
    if (!w) {
      // Popup was blocked by the browser — nothing we can do silently
      window.alert("Pop-up blocked. Please allow pop-ups for this site to export the PDF.");
      return;
    }
    w.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>${htmlEscape(trip.destination)} — Wandr Itinerary</title>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;600;700;800&display=swap" rel="stylesheet">
      <style>
        /* Letter-width column: the on-screen preview matches what prints
           instead of stretching the ticket across a desktop monitor. */
        body { font-family: 'Manrope', system-ui, sans-serif; margin: 0 auto; max-width: 720px; padding: 40px 40px 70px; background: #fff; color: #1a1a1a; box-sizing: border-box; }
        @media print { body { padding: 20px 20px 58px; max-width: none; } }
        .wm { font-weight: 800; font-size: 16px; color: #111; letter-spacing: -.02em; }
        .wm .dot { color: #c96442; }
        .p-label { font-size: 8px; letter-spacing: .18em; text-transform: uppercase; color: #9a938c; font-weight: 700; }
        .p-date { font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; }
        .ticket { position: relative; background: #faf8f6; border: 1px solid #e5e0da; border-radius: 12px; overflow: hidden; margin: 12px 0 6px; }
        .barcode { position: absolute; right: 10px; top: 12px; bottom: 12px; width: 11px; border-radius: 2px;
                   background: repeating-linear-gradient(180deg, #d8d2cb 0 2px, transparent 2px 5px); }
        .perf { position: relative; border-top: 1.5px dashed #d8d2cb; margin: 0 22px; }
        .notch { position: absolute; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 1px solid #e5e0da; top: -9px; }
        .dayhead { display: flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 800; margin: 26px 0 6px; break-after: avoid; }
        .daychip { background: #c96442; color: #fff; font-size: 10.5px; font-weight: 800; border-radius: 6px; padding: 3px 7px; font-variant-numeric: tabular-nums; }
        tr { break-inside: avoid; }
        .foot { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 720px;
                box-sizing: border-box; display: flex; align-items: center; gap: 10px;
                background: #fff; border-top: 1px solid #e8e4e0; padding: 8px 20px 10px; font-size: 8.5px; color: #9a938c; }
        @media print { .foot { max-width: none; } }
        .foot .wm { font-size: 10px; }
        .foot .spacer { flex: 1; }
      </style>
    </head><body>
      <div style="text-align:center;margin-bottom:14px"><span class="wm">wandr<span class="dot">.</span></span></div>
      <div class="p-label" style="color:#c96442;margin-bottom:4px">My trip</div>
      <div style="font-size:26px;font-weight:800;letter-spacing:-.015em;line-height:1.1">${htmlEscape(destMain)}${destRegion ? ` <span style="font-size:12px;color:#9a938c;font-weight:700">${htmlEscape(destRegion)}</span>` : ""}</div>
      ${ticketHtml}
      ${trip.tagline ? `<div style="font-size:11.5px;color:#8a847e;font-style:italic;margin:10px 2px 0">${htmlEscape(trip.tagline)}</div>` : ""}
      <div style="margin-top:6px">${bodyHtml}</div>
      <div class="foot">
        <span class="wm">wandr<span class="dot">.</span></span>
        <span>wandr-mauve.vercel.app</span>
        <span class="spacer"></span>
        <span>AI-planned — always verify opening hours, prices, and details with venues</span>
      </div>
    </body></html>`);
    w.document.close();
    // Print once Manrope is actually loaded — otherwise the dialog snapshots
    // the fallback font. fonts.ready + a beat covers slow first-time loads.
    const doPrint = () => { w.focus(); w.print(); };
    if (w.document.fonts?.ready) w.document.fonts.ready.then(() => setTimeout(doPrint, 150));
    else setTimeout(doPrint, 800);
  }

  return (
    <div style={{ minHeight:"100vh", width:"100%", background:T.bg0, fontFamily:T.font }}>
      <style>{`
        html,body,#root{background:${T.bg0}!important;margin:0;padding:0;min-height:100vh;width:100%}
        @keyframes blink{50%{opacity:0}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{50%{box-shadow:0 0 0 6px rgba(201,100,66,.06)}}
        *{box-sizing:border-box}
      `}</style>


      {/* ── Main dashboard ── */}
      <div style={{ maxWidth:760, margin:"0 auto" }} className="no-print">

        {/* Header */}
        <div style={{ background:`radial-gradient(120% 90% at 18% 0%, rgba(201,100,66,.13), transparent 55%), ${T.bg1}`, borderBottom:`1px solid ${T.border}`, padding:"1.75rem 1.75rem 1.5rem" }}>
          {/* Brand bar */}
          <div style={{ marginBottom:"1.25rem" }}>
            <WandrLogo size="sm" showTrail={false} globe="animated" />
          </div>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, flexWrap:"wrap", marginBottom:10 }}>
            <div>
              <div style={{ fontSize:9, letterSpacing:".2em", textTransform:"uppercase", color:T.accent, fontWeight:700, marginBottom:5 }}>My trip</div>
              <div style={{ fontSize:28, fontWeight:800, color:T.ink, lineHeight:1.08, letterSpacing:"-.015em" }}>{destMain}</div>
              {destRegion && (
                <div style={{ fontSize:11.5, color:T.hint, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", marginTop:4 }}>{destRegion}</div>
              )}
            </div>
            <div style={{ display:"flex", gap:7, alignItems:"flex-start" }}>
              {!online && (
                <span title="Your saved trip is readable offline. Building or editing needs a connection."
                  style={{ fontSize:10, fontWeight:700, color:T.muted, background:T.bg3, border:`1px solid ${T.border}`, borderRadius:100, padding:"4px 9px", whiteSpace:"nowrap" }}>
                  ● Offline
                </span>
              )}
              {otherTrips.length > 0 && (
                <div style={{ position:"relative" }}>
                  <button onClick={() => setSwitcherOpen(v => !v)}
                    style={{ fontSize:11, color:T.muted, background:T.bg3, border:`1px solid ${T.border}`, borderRadius:6, padding:"5px 10px", cursor:"pointer", fontFamily:T.font }}>
                    Switch ▾
                  </button>
                  {switcherOpen && (
                    <>
                      {/* Click-away closes the menu — no dead-end open state. */}
                      <div onClick={() => setSwitcherOpen(false)} style={{ position:"fixed", inset:0, zIndex:30 }} />
                      <div className="fade-up"
                        style={{ position:"absolute", top:"calc(100% + 4px)", right:0, zIndex:31, minWidth:190, background:T.bg1, border:`1px solid ${T.border}`, borderRadius:10, overflow:"hidden", boxShadow:"0 8px 24px rgba(0,0,0,.5)" }}>
                        {otherTrips.map((t, i) => (
                          <button key={t.id}
                            onClick={() => { setSwitcherOpen(false); onSwitchTrip?.(t.id); }}
                            style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 12px", background:"transparent", border:"none", borderTop: i === 0 ? "none" : `1px solid ${T.border}`, cursor:"pointer", fontFamily:T.font }}>
                            <div style={{ fontSize:12.5, fontWeight:700, color:T.ink }}>{t.destination}</div>
                            <div style={{ fontSize:10.5, color:T.hint, marginTop:1 }}>
                              {[t.answers?.dates?.start, t.answers?.dates?.end].every(Boolean)
                                ? `${fmtDate(t.answers.dates.start)} → ${fmtDate(t.answers.dates.end)}`
                                : `${t.nights || "?"} nights`}
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              <button
                onClick={() => { if (online) { setEditSheetStage(null); setEditSheetOpen(true); } }}
                disabled={!online}
                title={online ? undefined : "Editing needs a connection"}
                style={{ fontSize:11, color:T.accent, background:"transparent", border:`1px solid ${T.accent}`, borderRadius:6, padding:"5px 12px", cursor:online?"pointer":"not-allowed", opacity:online?1:.45, fontFamily:T.font, fontWeight:600 }}
              >
                Edit trip
              </button>
              <button onClick={onReset} style={{ fontSize:11, color:T.muted, background:T.bg3, border:`1px solid ${T.border}`, borderRadius:6, padding:"5px 12px", cursor:"pointer", fontFamily:T.font }}>New trip</button>
            </div>
          </div>
          {/* Boarding-pass ticket — dates + vitals as one object (design pick 1B).
              trip.season (the full sentence) now lives only in the PDF export;
              the stub shows a short derived label instead. */}
          {(() => {
            const stubLabel = { fontSize:8.5, letterSpacing:".18em", textTransform:"uppercase", color:T.hint, fontWeight:700 };
            const notch = { position:"absolute", width:22, height:22, borderRadius:"50%", background:T.bg1, border:`1px solid ${T.border2}`, top:-11 };
            const stubs = tripStubs;
            return (
              <div style={{ position:"relative", marginTop:4, background:T.bg2, border:`1px solid ${T.border2}`, borderRadius:16, overflow:"hidden" }}>
                <div style={{ position:"absolute", right:12, top:14, bottom:14, width:13, background:`repeating-linear-gradient(180deg, ${T.border2} 0 2px, transparent 2px 5px)`, opacity:.5, borderRadius:2 }} />
                {dep && ret && (
                  <>
                    <div style={{ display:"flex", alignItems:"center", gap:14, padding:"15px 38px 13px 18px" }}>
                      <div>
                        <div style={stubLabel}>Depart</div>
                        <div style={{ fontSize:19, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums" }}>{dep}</div>
                      </div>
                      <svg viewBox="0 0 46 16" style={{ flex:1, height:16, minWidth:36 }} aria-hidden="true">
                        <line x1="0" y1="8" x2="18" y2="8" stroke={T.border2} strokeDasharray="2 3" />
                        <path d="M22 14L40 8 22 2l3 6z" fill={T.accent} />
                      </svg>
                      <div style={{ textAlign:"right" }}>
                        <div style={stubLabel}>Return</div>
                        <div style={{ fontSize:19, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums" }}>{ret}</div>
                      </div>
                    </div>
                    <div style={{ position:"relative", borderTop:`1.5px dashed ${T.border2}`, margin:"0 26px" }}>
                      <div style={{ ...notch, left:-37 }} />
                      <div style={{ ...notch, right:-37 }} />
                    </div>
                  </>
                )}
                <div style={{ display:"flex", flexWrap:"wrap", gap:18, padding:"12px 38px 15px 18px" }}>
                  {stubs.map(([l, v]) => (
                    <div key={l}>
                      <div style={stubLabel}>{l}</div>
                      <div style={{ fontSize:12.5, fontWeight:700, color:T.ink, marginTop:1 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          {trip.tagline && (
            <div style={{ fontSize:12, color:T.muted, fontStyle:"italic", margin:"12px 2px 0" }}>{trip.tagline}</div>
          )}
          {Array.isArray(trip.highlights) && trip.highlights.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:7, marginTop:12 }}>
              {trip.highlights.map((h, i) => (
                <div key={i} style={{ display:"flex", gap:9, fontSize:11.5, color:T.muted, lineHeight:1.5 }}>
                  <span style={{ color:T.accent, fontWeight:800, flexShrink:0 }}>✓</span>{h}
                </div>
              ))}
            </div>
          )}
          {debugMsg && (
            <div style={{ marginTop:10, padding:"6px 10px", background:"rgba(200,80,60,.12)", border:"1px solid rgba(200,80,60,.3)", borderRadius:6, fontSize:11, color:"#f08070" }}>
              {"Couldn't load full trip data — some sections may be missing. Tap a plan mode below to generate your itinerary anyway."}
              <div style={{ marginTop:4, opacity:0.7 }}>{debugMsg}</div>
            </div>
          )}
        </div>

        <div style={{ padding:"1.25rem", background:T.bg0, minHeight:400 }}>

          {/* One-time "save these as your defaults?" prompt (first-time users) */}
          {showProfilePrompt && (
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", background:"#2a1a12", border:`1px solid ${T.accent}`, borderRadius:10, marginBottom:12 }}>
              <div style={{ flex:1, fontSize:12.5, color:T.ink, lineHeight:1.4 }}>
                Save these as your <strong style={{ color:T.accent }}>defaults</strong>? Skip the questions next time.
              </div>
              <button onClick={onSaveProfile}
                style={{ padding:"7px 14px", borderRadius:8, fontSize:12.5, fontWeight:700, color:T.white, background:T.accent, border:"none", cursor:"pointer", fontFamily:T.font, flexShrink:0 }}>
                Save
              </button>
              <button onClick={onDismissProfilePrompt}
                style={{ padding:"7px 4px", fontSize:12, fontWeight:600, color:T.hint, background:"none", border:"none", cursor:"pointer", fontFamily:T.font, flexShrink:0 }}>
                Not now
              </button>
            </div>
          )}

          {/* Happening during your trip — real MLB games at the destination (§7) */}
          {Array.isArray(tripGames) && tripGames.length > 0 && !eventsDismissed && (
            <div style={{ padding:"13px 15px", background:T.bg1, border:`1px solid ${T.border2}`, borderRadius:12, marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:9 }}>
                <span style={{ fontSize:14 }}>⚾</span>
                <span style={{ flex:1, fontSize:12.5, fontWeight:800, color:T.ink }}>Happening during your trip</span>
                <button onClick={() => setEventsDismissed(true)} title="Dismiss"
                  style={{ padding:"2px 6px", fontSize:12, color:T.hint, background:"none", border:"none", cursor:"pointer", fontFamily:T.font, flexShrink:0 }}>✕</button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {tripGames.slice(0, 4).map((g, i) => {
                  const favShort = g.yours ? TEAM_SHORT[g.role === "away" ? g.away : g.home] : null;
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"baseline", gap:8, fontSize:12,
                      ...(g.yours ? { borderLeft:`2px solid ${T.accent}`, paddingLeft:9, marginLeft:-2 } : {}) }}>
                      <span style={{ color:T.accent, fontWeight:700, flexShrink:0, width:64 }}>{formatShortDate(g.date)}</span>
                      <span style={{ lineHeight:1.4 }}>
                        {g.yours && (
                          <span style={{ display:"block", color:T.accent, fontWeight:800, marginBottom:1 }}>
                            Your {favShort} {g.role === "away" ? "are in town" : "are home"}
                          </span>
                        )}
                        <span style={{ color:T.ink }}>{g.away} <span style={{ color:T.hint }}>@</span> {g.home}</span>
                        {g.venue && <span style={{ color:T.muted }}> · {g.venue}</span>}
                      </span>
                    </div>
                  );
                })}
                {tripGames.length > 4 && (
                  <div style={{ fontSize:11, color:T.hint, marginTop:1 }}>+{tripGames.length - 4} more during your dates</div>
                )}
              </div>
            </div>
          )}

          {/* Itinerary */}
          <div>
              {/* Generate CTA (no plan yet) vs status row (design pick 2A) —
                  once a plan exists the card stops selling and a slim toolbar
                  confirms state; Remix opens the edit sheet's Full Itinerary
                  pane. No blind regeneration path. */}
              {!planText && !planLoading ? (() => {
                const hero = MODES[0];
                return (
                  <button onClick={() => online && onGenerate(hero.id)} disabled={!online}
                    style={{ width:"100%", display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:12, background:T.bg1, border:`1px solid ${T.border2}`, cursor:online?"pointer":"not-allowed", opacity:online?1:.5, fontFamily:T.font, marginBottom:8, textAlign:"left", transition:"all .15s" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:800, color:T.ink, marginBottom:2 }}>{hero.label}</div>
                      <div style={{ fontSize:12, color:T.muted }}>{online ? hero.desc : "Needs a connection"}</div>
                    </div>
                    <div style={{ fontSize:11, fontWeight:700, color:T.hint, background:T.bg3, padding:"4px 10px", borderRadius:100, flexShrink:0 }}>
                      Generate →
                    </div>
                  </button>
                );
              })() : (
                <div style={{ position:"relative", display:"flex", alignItems:"center", gap:10, padding:"4px 2px 12px", borderBottom:`1px solid ${T.border}`, marginBottom:12 }}>
                  <StardustBurst burstKey={readyBurst} origin={{ left: 4, top: "40%" }} />
                  <span style={{ width:7, height:7, borderRadius:"50%", background:T.accent, boxShadow:"0 0 0 3px rgba(201,100,66,.14)", flexShrink:0, animation:planLoading?"pulse 1.2s ease-in-out infinite":"pulse 2.4s ease-in-out infinite" }} />
                  <span style={{ fontSize:13, fontWeight:800, color:T.ink }}>Full itinerary</span>
                  <span style={{ fontSize:11, color:T.hint }}>
                    {planLoading ? "writing your days…" : generatedAt ? `generated ${timeAgo(generatedAt)}` : ""}
                  </span>
                  <span style={{ flex:1 }} />
                  <button
                    onClick={() => { if (online && !planLoading) { setEditSheetStage("full-itinerary"); setEditSheetOpen(true); } }}
                    disabled={!online || planLoading}
                    title={online ? "Rework this itinerary — with your direction" : "Needs a connection"}
                    style={{ fontSize:11, fontWeight:600, color:T.accent, background:"transparent", border:`1px solid ${T.accent}`, borderRadius:6, padding:"5px 12px", cursor:online&&!planLoading?"pointer":"not-allowed", opacity:online&&!planLoading?1:.45, fontFamily:T.font }}>
                    ↻ Remix
                  </button>
                </div>
              )}
              {/* Secondary modes — only render when more than the hero mode exists */}
              {MODES.length > 1 && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:6, marginBottom:planMode?10:0 }}>
                  {MODES.slice(1).map(m => {
                    const isActive = planMode === m.id;
                    return (
                      <button key={m.id} onClick={() => onGenerate(m.id)}
                        style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:10, background:isActive?"#2a1a12":T.bg1, border:isActive?`1.5px solid ${T.accent}`:`1px solid ${T.border}`, cursor:"pointer", fontFamily:T.font, textAlign:"left", transition:"all .15s" }}>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:isActive?T.accent:T.ink, lineHeight:1.3 }}>{m.label}</div>
                          <div style={{ fontSize:10.5, color:isActive?"#a06040":T.hint, lineHeight:1.4 }}>{m.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Patch error banner (day-edit failure — plan text is preserved) */}
              {patchError && !planLoading && (
                <div style={{ display:"flex", alignItems:"center", gap:9, padding:"10px 14px", background:"rgba(180,60,40,.12)", border:"1px solid rgba(180,60,40,.3)", borderRadius:9, marginBottom:10, fontSize:12.5, color:"#f08070" }}>
                  <span style={{ flexShrink:0 }}>⚠</span>
                  <span>{patchError}</span>
                </div>
              )}
              {/* Loading spinner */}
              {planLoading && !planText && (
                <div style={{ display:"flex", alignItems:"center", gap:9, padding:"1.25rem 0", fontSize:12.5, color:T.muted }}>
                  <div style={{ width:18, height:18, border:`1.5px solid ${T.border}`, borderTopColor:T.accent, borderRadius:"50%", animation:"spin .7s linear infinite" }} />
                  Writing your {MODES.find(m => m.id === planMode)?.label?.toLowerCase()}…
                </div>
              )}
              {/* Plan output */}
              {planText && (
                <div style={{ background:T.bg1, border:`1px solid ${T.border}`, borderRadius:12, padding:"1.25rem 1.4rem", marginTop:4 }}>
                  <div style={{ display:"flex", justifyContent:"flex-end", gap:7, marginBottom:"1rem" }}>
                    {!planLoading && (
                      <>
                        <button onClick={copyPlan}
                          style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 12px", fontSize:12, fontWeight:600, color:copied==="error"?"#f08070":copied?T.ink:T.muted, background:copied?T.bg3:"transparent", border:`1px solid ${T.border}`, borderRadius:7, cursor:"pointer", fontFamily:T.font, transition:"all .15s" }}>
                          {copied === "error" ? "Copy failed" : copied ? "✓ Copied" : "Copy"}
                        </button>
                        <button onClick={exportToPdf}
                          style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", fontSize:12, fontWeight:600, color:T.accent, background:"transparent", border:`1px solid ${T.accent}`, borderRadius:7, cursor:"pointer", fontFamily:T.font }}>
                          Export PDF
                        </button>
                      </>
                    )}
                  </div>
                  {/* Editable blocks once a full itinerary has finished streaming;
                      Md stays the fallback (during streaming, other modes, or if parsing yielded nothing). */}
                  {FEATURES.editableItinerary && !planLoading && planMode === "full" && planModel?.days?.length ? (
                    <ItineraryEditor model={planModel} onEditActivity={onEditActivity} onDeleteActivity={onDeleteActivity} onReorderDay={onReorderDay} onMoveActivity={onMoveActivity} onMoveToBucket={onMoveToBucket} onTweakActivity={onTweakActivity} tweakingId={tweakingId} />
                  ) : (
                    <Md text={planText} />
                  )}
                  {planLoading && (
                    <span style={{ display:"inline-block", width:7, height:14, background:T.accent, marginLeft:3, animation:"blink 1s step-end infinite", borderRadius:1 }} />
                  )}
                  {!planLoading && (
                    <div style={{ marginTop:"1.25rem", paddingTop:"1rem", borderTop:`1px solid ${T.border}`, fontSize:11, color:T.hint, lineHeight:1.6 }}>
                      AI-generated — always verify opening hours, prices, and details directly with venues before your trip.
                    </div>
                  )}
                </div>
              )}
            </div>

        </div>
      </div>
      {/* Edit Trip Sheet — owns its own AnimatePresence internally */}
      <EditTripSheet
        open={editSheetOpen}
        trip={trip}
        planText={planText}
        planMode={planMode}
        planLoading={planLoading}
        initialStage={editSheetStage}
        onClose={() => { setEditSheetOpen(false); setEditSheetStage(null); }}
        onEditPlan={onEditPlan}
        onEditTripDetails={onEditTripDetails}
      />
    </div>
  );
}
