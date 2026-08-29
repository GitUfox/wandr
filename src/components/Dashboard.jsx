/**
 * Dashboard — the post-interview trip view.
 *
 * Manages its own print-modal state (only relevant here).
 * Everything else — trip data, plan state — comes from App.jsx via props.
 */
import { useState, useEffect, useRef } from "react";
import { MODES, T, FEATURES, AI_DISCLAIMER } from "../lib/constants.js";
import { useOnline } from "../hooks/useOnline.js";
import { arr, formatShortDate, ticketDate, timeAgo, splitDetails, matchTipToActivity, displayTime, findGroundedVenue, countIdeas, tripDayIndex, parseTime, formatTime } from "../lib/utils.js";
import { bucketTicketRow, bucketPrintBody, bucketPlainText } from "../lib/printBucket.js";
import { parsePlan } from "../lib/planModel.js";
import { TEAM_SHORT } from "../lib/mlbTeams.js";
import Md from "./Md.jsx";
import BucketBoard from "./BucketBoard.jsx";
import ItineraryEditor from "./ItineraryEditor.jsx";
import WandrLogo from "./WandrLogo.jsx";
import EditTripSheet from "./EditTripSheet.jsx";
import StardustBurst from "./StardustBurst.jsx";
import Glyph from "./Glyphs.jsx";

/* TiltedEarthMark — the static tilted-earth construction: 23.5° sphere, one
   meridian, CURVED latitude arcs (straight chords are what read as a
   basketball), polar axis stubs. The SCREEN ticket no longer seats an earth
   (2A ember rail, 2026-08-11), but the PDF export still carries the
   light-stock copy of this exact construction — this component stays as its
   on-screen twin / sync reference. Currently unrendered; do not delete
   without also redesigning the PDF ticket center. */
// eslint-disable-next-line no-unused-vars
function TiltedEarthMark({ size = 22, tilt = -23.5 }) {
  return (
    <svg viewBox="0 0 28 28" width={size} height={size} aria-hidden="true" style={{ display:"block" }}>
      <g transform={`translate(14,14) rotate(${tilt})`}>
        <circle r="10" fill={T.accent} />
        <g stroke={T.bg2} strokeWidth="1.05" fill="none" strokeLinecap="round">
          <ellipse rx="4.5" ry="9.7" />
          <path d="M -9,-4.6 Q 0,-6.8 9,-4.6" />
          <path d="M -10,0 Q 0,1.9 10,0" />
          <path d="M -9,4.6 Q 0,6.8 9,4.6" />
        </g>
        <line x1="0" y1="-13.4" x2="0" y2="-10.6" stroke={T.muted} strokeWidth="1.1" />
        <line x1="0" y1="10.6" x2="0" y2="13.4" stroke={T.muted} strokeWidth="1.1" />
      </g>
    </svg>
  );
}

/* ── Curating-state motion (2026-08-07, design picks 1A+2A+3A) ────────────────
   RollingMsg — LOAD_MSGS rise in / lift out instead of hard-swapping (2A).
   GhostDays  — skeleton day cards breathe where the itinerary will land (3A);
   the 1A traveling spark lives inline in the ticket rail SVG. All pure CSS
   keyframes (the wroll and wghost families in the Dashboard style
   block), all silenced by the prefers-reduced-motion guard there. */
function RollingMsg({ text }) {
  const [prev, setPrev] = useState(null);
  const lastRef = useRef(text);
  useEffect(() => {
    if (text === lastRef.current) return;
    setPrev(lastRef.current);
    lastRef.current = text;
    const t = setTimeout(() => setPrev(null), 320);
    return () => clearTimeout(t);
  }, [text]);
  const msgStyle = { fontSize:T.fs.meta, color:T.hint };
  return (
    <span style={{ position:"relative", display:"inline-block" }}>
      {/* key remounts the span on every message change, re-firing the rise-in */}
      <span key={text} className="wroll-in" style={{ ...msgStyle, display:"inline-block", animation:"wrollin .3s ease" }}>{text}</span>
      {prev && (
        <span className="wroll-out" style={{ ...msgStyle, position:"absolute", left:0, top:0, whiteSpace:"nowrap", animation:"wrollout .3s ease forwards" }}>{prev}</span>
      )}
    </span>
  );
}

function GhostDays({ nights }) {
  const count = Math.min(3, Math.max(2, Number(nights) || 2));
  const shimGrey = `linear-gradient(90deg, ${T.bg2} 25%, ${T.bg3} 45%, ${T.bg2} 65%)`;
  const shimAccent = "linear-gradient(90deg, rgba(201,100,66,.10) 25%, rgba(201,100,66,.22) 45%, rgba(201,100,66,.10) 65%)";
  const barStyle = (extra) => ({ height:9, borderRadius:5, backgroundSize:"220% 100%", animation:"wghostshim 2.4s linear infinite", ...extra });
  // Deliberately uneven widths — real itineraries are ragged, and identical
  // skeletons read as a broken repeat rather than a preview.
  const layouts = [["38%", ["62%","46%","57%"]], ["30%", ["52%","66%"]], ["34%", ["58%","44%","50%"]]];
  return (
    <div aria-hidden="true">
      {layouts.slice(0, count).map(([titleW, lines], i) => (
        <div key={i} className="wghost" style={{ background:T.bg1, border:`1px solid ${T.border}`, borderRadius:T.r.md, padding:"13px 15px", marginBottom:10, animation:"wghostbreathe 3.2s ease-in-out infinite", animationDelay:`${i * 0.5}s` }}>
          <div className="wghost-bar" style={barStyle({ width:titleW, height:11, marginBottom:3, background:shimGrey })} />
          {lines.map((w, j) => (
            <div key={j} style={{ display:"flex", gap:9, alignItems:"center", marginTop:8 }}>
              <div className="wghost-bar" style={barStyle({ width:44, flexShrink:0, background:shimAccent })} />
              <div className="wghost-bar" style={barStyle({ width:w, background:shimGrey })} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── Right Now mode (design picks 1A+2A+3A, 2026-08-23) ──────────────────────
   When today falls inside the trip's dates, today takes the stage: this panel
   leads the itinerary area with what's next and ONE primary verb ("Change my
   afternoon"). Reason chips (2A) map to prompt context through their ids —
   the RIGHT_NOW_REASONS contract in prompts.js — and the rework commits
   instantly with a 30-second Undo (3A). The full plan stays one scroll
   below, untouched. Text-only chips: UI emoji are banned (Glyphs rule). */
const RIGHT_NOW_CHIPS = [
  { id: "raining",  label: "Raining" },
  { id: "tired",    label: "Tired" },
  { id: "late",     label: "Running late" },
  { id: "came_up",  label: "Something came up" },
  { id: "surprise", label: "Surprise me", glyph: "sparkle" },
];

function TodayPanel({ todayInfo, day, dayIdx, online, planLoading, onRework, reworkUndo, onUndoRework }) {
  const [open, setOpen]         = useState(false);
  const [reasons, setReasons]   = useState([]);
  const [note, setNote]         = useState("");
  const [pending, setPending]   = useState(false); // a rework WE started is in flight
  const [showUndo, setShowUndo] = useState(false);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const daypart = now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening";
  const fromTime = formatTime(nowMin);

  const acts = day?.activities || [];
  const upcoming = acts.filter(x => { const t = parseTime(x.time); return t !== null && t >= nowMin; });
  const upNext = upcoming[0] || null;

  // Undo toast: shows when a fresh rework lands (reworkUndo.at changes),
  // auto-hides after 30s; pressing Undo clears reworkUndo upstream.
  const undoAt = reworkUndo?.at || 0;
  useEffect(() => {
    if (!undoAt) { setShowUndo(false); return; }
    setShowUndo(true);
    const t = setTimeout(() => setShowUndo(false), 30000);
    return () => clearTimeout(t);
  }, [undoAt]);
  useEffect(() => { if (!planLoading) setPending(false); }, [planLoading]);

  function submit() {
    if (!online || planLoading || !day) return;
    onRework(dayIdx, day.label, { fromTime, reasons, note: note.trim() });
    setPending(true);
    setOpen(false); setReasons([]); setNote("");
  }
  const toggleReason = id => setReasons(r => (r.includes(id) ? r.filter(x => x !== id) : [...r, id]));

  const dateLine = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const clean = s => String(s || "").replace(/\*\*/g, "").trim();

  return (
    <div key={undoAt} style={{ padding:"13px 15px 14px", background:T.bg1, border:"1px solid rgba(201,100,66,.45)", borderRadius:T.r.md, marginBottom:12, animation: undoAt ? "wonce 1.1s ease" : "none" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ width:7, height:7, borderRadius:"50%", background:T.accentHover, flexShrink:0, animation:"pulse 2s ease-in-out infinite" }} />
        <span style={{ fontSize:T.fs.label, fontWeight:800, letterSpacing:".14em", textTransform:"uppercase", color:T.accentHover }}>
          Today · Day {todayInfo.dayNum} of {todayInfo.totalDays}
        </span>
        <span style={{ fontSize:T.fs.meta, color:T.hint }}>{dateLine}</span>
      </div>

      {upNext ? (
        <div style={{ marginTop:10 }}>
          <div style={{ fontSize:T.fs.micro, fontWeight:800, letterSpacing:".14em", textTransform:"uppercase", color:T.hint, marginBottom:3 }}>Up next</div>
          <div style={{ display:"flex", gap:9, alignItems:"baseline" }}>
            <span style={{ fontSize:T.fs.body, fontWeight:700, color:T.accent, fontVariantNumeric:"tabular-nums", flexShrink:0 }}>{displayTime(clean(upNext.time))}</span>
            <span style={{ fontSize:T.fs.ui, fontWeight:800, color:T.ink }}>{clean(upNext.title)}</span>
          </div>
          {upcoming.length > 1 && (
            <div style={{ fontSize:T.fs.meta, color:T.muted, marginTop:3 }}>then {upcoming.length - 1} more {upcoming.length - 1 === 1 ? "stop" : "stops"} today</div>
          )}
        </div>
      ) : (
        <div style={{ marginTop:10, fontSize:T.fs.body, color:T.muted }}>All scheduled stops for today are done.</div>
      )}

      {pending && planLoading ? (
        <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:12, fontSize:T.fs.body, color:T.accent, fontWeight:700 }}>
          <span style={{ width:13, height:13, border:`1.5px solid ${T.border}`, borderTopColor:T.accent, borderRadius:"50%", display:"inline-block", animation:"spin .7s linear infinite" }} />
          Reworking your {daypart}…
        </div>
      ) : upNext && (
        <>
          <button onClick={() => online && !planLoading && setOpen(o => !o)} disabled={!online || planLoading}
            title={online ? undefined : "Reworking your day needs a connection"}
            style={{ width:"100%", marginTop:12, padding:"12px 0", borderRadius:T.r.md, background:open ? T.bg3 : T.accent, color:open ? T.muted : T.white, fontSize:T.fs.ui, fontWeight:800, border:"none", cursor:online && !planLoading ? "pointer" : "not-allowed", opacity:online ? 1 : .5, fontFamily:T.font, transition:"background .2s" }}>
            {open ? "Never mind" : `Change my ${daypart}`}
          </button>
          <div style={{ maxHeight:open ? 230 : 0, opacity:open ? 1 : 0, overflow:"hidden", transition:"max-height .28s ease, opacity .22s ease" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:11 }}>
              {RIGHT_NOW_CHIPS.map(chip => {
                const on = reasons.includes(chip.id);
                return (
                  <button key={chip.id} onClick={() => toggleReason(chip.id)}
                    style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:T.fs.meta, fontWeight:700, color:on ? T.accentHover : T.muted, background:on ? "rgba(201,100,66,.08)" : T.bg2, border:`1px solid ${on ? T.accent : T.border}`, borderRadius:T.r.pill, padding:"7px 13px", cursor:"pointer", fontFamily:T.font }}>
                    {chip.glyph && <Glyph name={chip.glyph} size={11} color="currentColor" />}
                    {chip.label}
                  </button>
                );
              })}
            </div>
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={280}
              onKeyDown={e => e.key === "Enter" && submit()}
              placeholder="Anything else? e.g. we're near the university now"
              style={{ width:"100%", marginTop:9, padding:"9px 12px", border:`1px solid ${T.border}`, borderRadius:T.r.sm, background:T.bg2, color:T.ink, outline:"none", fontSize:T.fs.body, fontFamily:T.font, boxSizing:"border-box" }} />
            <button onClick={submit} disabled={!online}
              style={{ width:"100%", marginTop:9, padding:"11px 0", borderRadius:T.r.md, background:T.accent, color:T.white, fontSize:T.fs.body, fontWeight:800, border:"none", cursor:"pointer", fontFamily:T.font }}>
              Rework from {displayTime(fromTime)} →
            </button>
          </div>
        </>
      )}

      {showUndo && reworkUndo && (
        <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:11, background:T.bg3, border:`1px solid ${T.border2}`, borderRadius:T.r.pill, padding:"7px 8px 7px 14px", fontSize:T.fs.meta, color:T.muted }}>
          <span>Rest of today reworked</span>
          <button onClick={onUndoRework}
            style={{ marginLeft:"auto", color:T.accentHover, fontWeight:800, fontSize:T.fs.meta, padding:"4px 12px", border:`1px solid ${T.accent}`, borderRadius:T.r.pill, background:"transparent", cursor:"pointer", fontFamily:T.font }}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({
  trip,
  trips = [],
  onSwitchTrip,
  building = false,   // trip is a skeleton; activity curation still running
  buildingMsg = "",   // rotating status line from useBuildTrip
  tripGames,
  planIssues = [],
  planText, planModel, planLoading, planMode, generatedAt,
  patchError,
  debugMsg,
  onGenerate,
  onEditPlan,
  onReworkDay,
  reworkUndo,
  onUndoRework,
  onEditTripDetails,
  onEditActivity,
  onDeleteActivity,
  onReorderDay,
  onMoveActivity,
  onMoveToBucket,
  onTweakActivity,
  tweakingId,
  onTogglePick,
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

  // Bucket-mode Copy — same feedback states, plain-text list serializer.
  function copyBucketList() {
    navigator.clipboard.writeText(bucketPlainText(trip)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {
      setCopied("error");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const a = trip.answers;

  // Bucket List mode (2026-08-15): a place + activities, zero date DNA. The
  // ticket trades Depart/Return for Ideas → Picked (the ember still rides),
  // and the whole plan machinery below yields to the BucketBoard.
  const isBucket = trip.tripStyle === "bucket";

  // Right Now mode trigger (design pick 1A, 2026-08-23): pure date math —
  // non-null only when today falls inside a DATED trip's range. Bucket trips
  // have no start/end, so tripDayIndex is null for them anyway; the guard is
  // belt-and-suspenders.
  const todayInfo = isBucket ? null : tripDayIndex(a.dates);
  const ideaCount = isBucket ? countIdeas(trip.categories) : 0;
  const pickedCount = isBucket ? Object.keys(trip.bucketPicks || {}).length : 0;

  // "Watertown & Thousand Islands, NY, USA" → hero "Watertown & Thousand
  // Islands" + quiet region line "NY, USA". No comma = no region line.
  const [destMain, ...destRest] = String(trip.destination || "").split(",");
  const destRegion = destRest.join(",").trim();

  // Boarding-pass data — shared by the on-screen hero and the PDF export (9B)
  // so the two tickets can never drift.
  const dep = isBucket ? "" : ticketDate(a.dates?.start);
  const ret = isBucket ? "" : ticketDate(a.dates?.end);
  const tripStubs = [
    ["Nights", trip.nights ? `${trip.nights}` : ""],
    ["Budget", a.budget === 0 ? "With friends" : a.budget ? `$${a.budget}/day` : ""],
    ["Party",  arr(a.party).split(",")[0]],
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
    // Light-stock twin of the ticket emblem (4A+5A): canvas can't print, so
    // paper gets TiltedEarthMark's construction with the ring and ember
    // frozen mid-front-pass. Keep in sync with TiltedEarthMark in this file.
    // ONE string, seated by BOTH ticket variants (dates + bucket) — drift-proof.
    const printEarthSvg = `<svg viewBox="0 0 120 26" style="flex:1;height:22px;min-width:48px;overflow:visible" aria-hidden="true">
            <line x1="10" y1="13" x2="40" y2="13" stroke="#d8d2cb" stroke-width="1.2"/>
            <line x1="80" y1="13" x2="110" y2="13" stroke="#d8d2cb" stroke-width="1.2"/>
            <circle cx="8" cy="13" r="2.4" fill="none" stroke="#9a938c" stroke-width="1.3"/>
            <circle cx="112" cy="13" r="2.4" fill="#c96442"/>
            <g transform="translate(60,13) rotate(-20)">
              <ellipse rx="16" ry="5" fill="none" stroke="#c9c2ba" stroke-width=".9"/>
            </g>
            <g transform="translate(60,13) rotate(-23.5)">
              <circle r="10" fill="#c96442"/>
              <g stroke="#faf8f6" stroke-width="1.05" fill="none" stroke-linecap="round">
                <ellipse rx="4.5" ry="9.7"/>
                <path d="M -9,-4.6 Q 0,-6.8 9,-4.6"/>
                <path d="M -10,0 Q 0,1.9 10,0"/>
                <path d="M -9,4.6 Q 0,6.8 9,4.6"/>
              </g>
              <line x1="0" y1="-13.4" x2="0" y2="-10.6" stroke="#9a938c" stroke-width="1.1"/>
              <line x1="0" y1="10.6" x2="0" y2="13.4" stroke="#9a938c" stroke-width="1.1"/>
            </g>
            <g transform="translate(60,13) rotate(-20) scale(1,0.3125)">
              <ellipse cx="8" cy="13.9" rx="1.7" ry="5.4" fill="#c96442"/>
            </g>
          </svg>`;
    const ticketTop = isBucket
      ? bucketTicketRow(ideaCount, pickedCount, printEarthSvg)
      : dep && ret ? `
        <div style="display:flex;align-items:center;gap:14px;padding:13px 34px 11px 16px">
          <div><div class="p-label">Depart</div><div class="p-date">${htmlEscape(dep)}</div></div>
          ${printEarthSvg}
          <div style="text-align:right"><div class="p-label">Return</div><div class="p-date">${htmlEscape(ret)}</div></div>
        </div>
        <div class="perf"><div class="notch" style="left:-31px"></div><div class="notch" style="right:-31px"></div></div>` : "";
    const ticketHtml = `
      <div class="ticket">
        <div class="barcode"></div>${ticketTop}
        <div style="display:flex;gap:20px;padding:10px 34px 13px 16px">${stubsHtml}</div>
      </div>`;

    // ── Body: day cards (§15.6 picks 1B+2B+3B) ────────────────────────────
    // Built from the SAME parsed model and the SAME chip engine as the screen
    // (parsePlan + splitDetails) — the export can't drift from what the
    // traveler edited. Every model-authored string passes through htmlEscape:
    // this HTML lands in document.write, so LLM output is untrusted markup.

    // Escape first, then translate **bold** — never the other way round.
    const rich = (s) => htmlEscape(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // Prose renderer for intro / extras / legacy content outside tables.
    const proseHtml = (text) => String(text || "").split("\n").map(line => {
      const t = line.trim();
      if (!t) return "";
      if (t.startsWith("### ")) return `<h3 class="h3">${rich(t.slice(4))}</h3>`;
      return `<p class="prose">${rich(line)}</p>`;
    }).join("");

    const cardHtml = (a) => {
      const { desc, facts } = splitDetails(a.details);
      // Duration reads as part of "when" — it lives under the time in the
      // rail; every other fact becomes a chip. Booking keeps its hot accent.
      const dur = facts.find(f => f.kind === "duration");
      const chips = facts.filter(f => f !== dur);
      const chipsHtml = chips.length
        ? `<div class="chips">${chips.map(f => `<span class="chip${f.kind === "booking" ? " hot" : ""}">${htmlEscape(f.text)}</span>`).join("")}</div>`
        : "";
      // Pick A's print form: paper wants text, not taps — a grounded venue
      // prints its real street address (Google's, never the model's).
      const venue = findGroundedVenue(String(a.title || "").replace(/\*\*/g, ""), trip?.categories);
      const addrHtml = venue?.address
        ? `<div class="c-addr"><svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="#9a938c" stroke-width="2.2" stroke-linecap="round"><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>${htmlEscape(venue.address)}</div>`
        : "";
      return `<div class="card">
        <div class="rail"><div class="tm">${htmlEscape(displayTime(a.time))}</div>${dur ? `<div class="du">${htmlEscape(dur.text)}</div>` : ""}</div>
        <div>
          <div class="c-ttl">${htmlEscape(String(a.title || "").replace(/\*\*/g, ""))}</div>
          ${chipsHtml}
          ${desc ? `<div class="c-desc">${rich(desc)}</div>` : ""}
          ${addrHtml}
          ${(a._tips || []).map(tip => `<div class="c-tip"><span class="bang">!</span><span>${rich(tip)}</span></div>`).join("")}
        </div>
      </div>`;
    };

    // Bucket export: the shelf body comes from printBucket (shared shelf
    // source with the on-screen board); the day-card machinery below no-ops.
    const model = isBucket ? null : parsePlan(planText);
    let bodyHtml = isBucket ? bucketPrintBody(trip) : model.intro ? proseHtml(model.intro) : "";

    for (const day of model?.days || []) {
      const dm = String(day.label).match(/^Day (\d+) — (.+)$/);
      bodyHtml += dm
        ? `<div class="dayhead"><span class="daychip">${String(dm[1]).padStart(2, "0")}</span><span>${htmlEscape(dm[2])}</span></div>`
        : `<h2 class="h2">${htmlEscape(day.label)}</h2>`;

      // 2B: attach each tip to the activity it names; the rest stay day-level.
      const titles = day.activities.map(a => a.title);
      const acts = day.activities.map(a => ({ ...a, _tips: [] }));
      const dayTips = [];
      for (const tip of day.tips || []) {
        const i = matchTipToActivity(tip, titles);
        if (i >= 0) acts[i]._tips.push(tip); else dayTips.push(tip);
      }

      bodyHtml += acts.map(cardHtml).join("");

      // Legacy FOOD rows (pre food-removal plans) — keep the data readable.
      for (const f of day.food || []) {
        const bits = [f.meal, f.name, f.order, f.price].filter(Boolean).map(htmlEscape);
        if (bits.length) bodyHtml += `<p class="prose food">${bits.join(" — ")}</p>`;
      }

      if (dayTips.length) {
        bodyHtml += `<div class="prebox"><div class="p-label" style="color:#c96442;margin-bottom:3px">Before you go</div>${dayTips.map(t => `<div class="tipline">${rich(t)}</div>`).join("")}</div>`;
      }

      if (day.extras?.length) bodyHtml += proseHtml(day.extras.join("\n"));
    }

    const w = window.open("", "_blank");
    if (!w) {
      // Popup was blocked by the browser — nothing we can do silently
      window.alert("Pop-up blocked. Please allow pop-ups for this site to export the PDF.");
      return;
    }
    w.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>${htmlEscape(trip.destination)} — Wandr ${isBucket ? "Bucket List" : "Itinerary"}</title>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;600;700;800&display=swap" rel="stylesheet">
      <style>
        /* 4A print hygiene: margin:0 removes the browser's own header/footer
           (about:blank, timestamp, page counts) — Chrome renders those in the
           page margin, so no margin means no chrome. The body padding below is
           therefore the ONLY physical margin the sheet gets. */
        @page { margin: 0; }
        /* Letter-width column: the on-screen preview matches what prints
           instead of stretching the ticket across a desktop monitor. */
        body { font-family: 'Manrope', system-ui, sans-serif; margin: 0 auto; max-width: 720px; padding: 40px 40px 74px; background: #fff; color: #1a1a1a; box-sizing: border-box; }
        /* Print bottom padding must clear the fixed footer (~34px) or the last
           line of every page runs beneath it. */
        @media print { body { padding: 34px 36px 68px; max-width: none; } }
        .wm { font-weight: 800; font-size: 16px; color: #111; letter-spacing: -.02em; }
        .wm .dot { color: #c96442; }
        .p-label { font-size: 8px; letter-spacing: .18em; text-transform: uppercase; color: #9a938c; font-weight: 700; }
        .p-date { font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; }
        .ticket { position: relative; background: #faf8f6; border: 1px solid #e5e0da; border-radius: 12px; overflow: hidden; margin: 12px 0 6px; }
        .barcode { position: absolute; right: 10px; top: 12px; bottom: 12px; width: 11px; border-radius: 2px;
                   background: repeating-linear-gradient(180deg, #d8d2cb 0 2px, transparent 2px 5px); }
        .perf { position: relative; border-top: 1.5px dashed #d8d2cb; margin: 0 22px; }
        .notch { position: absolute; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 1px solid #e5e0da; top: -9px; }
        .dayhead { display: flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 800; margin: 24px 0 4px; break-after: avoid; }
        .daychip { background: #c96442; color: #fff; font-size: 10.5px; font-weight: 800; border-radius: 6px; padding: 3px 7px; font-variant-numeric: tabular-nums; }
        .h2 { font-size: 16px; font-weight: 800; color: #0d0d0d; margin: 24px 0 8px; padding-bottom: 5px; border-bottom: 1px solid #e8e8e8; }
        .h3 { font-size: 11px; font-weight: 700; color: #c96442; text-transform: uppercase; letter-spacing: .08em; margin: 14px 0 6px; }
        .prose { font-size: 12.5px; color: #333; line-height: 1.65; margin: 0 0 4px; }
        .prose.food { font-size: 10.5px; color: #555; }
        /* 1B day cards: time rail | content. break-inside keeps a stop whole
           across page breaks — the tip belongs to its card, not the next page. */
        .card { display: grid; grid-template-columns: 62px 1fr; gap: 12px; padding: 10px 0 11px;
                border-bottom: 1px solid #f0eeeb; break-inside: avoid; }
        .rail { text-align: right; border-right: 2px solid #c96442; padding-right: 10px; }
        .rail .tm { font-size: 13px; font-weight: 800; color: #0d0d0d; font-variant-numeric: tabular-nums; line-height: 1.2; }
        .rail .du { font-size: 7.5px; font-weight: 700; color: #9a938c; letter-spacing: .05em; text-transform: uppercase; margin-top: 3px; }
        .c-ttl { font-size: 12.5px; font-weight: 800; color: #0d0d0d; line-height: 1.3; letter-spacing: -.005em; }
        /* 3B fact chips — same engine as the on-screen blocks (splitDetails). */
        .chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 5px 0 2px; }
        .chip { font-size: 8.5px; font-weight: 700; padding: 2.5px 7px; border-radius: 4px;
                border: 1px solid #e5e0da; color: #6b655f; background: #fbfaf9; white-space: nowrap; }
        .chip.hot { border-color: #e8c4b4; color: #c96442; background: #fdf5f2; }
        .c-desc { font-size: 10px; color: #555; line-height: 1.55; margin-top: 3px; }
        /* Pick A print form: the grounded venue's real street address. */
        .c-addr { display: flex; align-items: center; gap: 4px; font-size: 8.5px; color: #9a938c; margin-top: 3px; }
        /* 2B: a tip rendered with the stop it belongs to. */
        .c-tip { display: flex; gap: 7px; margin-top: 6px; padding: 5px 9px; background: #fbf7f4;
                 border-left: 2.5px solid #c96442; border-radius: 0 4px 4px 0; break-inside: avoid; }
        .c-tip .bang { color: #c96442; font-weight: 800; font-size: 9px; line-height: 1.55; }
        .c-tip span { font-size: 9px; color: #6b5f57; line-height: 1.55; }
        /* Day-level tips that name no single venue. */
        .prebox { border: 1px solid #e5e0da; border-left: 2.5px solid #c96442; border-radius: 0 5px 5px 0;
                  padding: 8px 11px; margin: 10px 0 4px; background: #fdfbfa; break-inside: avoid; }
        .prebox .tipline { font-size: 9px; color: #6b5f57; line-height: 1.55; margin-top: 2px; }
        /* Bucket-list print cards: check ring column instead of the time rail. */
        .shelfcount { font-size: 9px; font-weight: 700; color: #9a938c; margin-left: 8px; letter-spacing: .04em; text-transform: none; }
        .bcard { display: grid; grid-template-columns: 22px 1fr; gap: 10px; padding: 9px 0 10px;
                 border-bottom: 1px solid #f0eeeb; break-inside: avoid; }
        .bring { width: 15px; height: 15px; border-radius: 50%; border: 1.5px solid #d8d2cb; margin-top: 1px;
                 font-size: 9px; font-weight: 800; color: #fff; display: flex; align-items: center; justify-content: center; }
        .bring.on { background: #c96442; border-color: #c96442; }
        .foot { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 720px;
                box-sizing: border-box; display: flex; align-items: center; gap: 10px;
                background: #fff; border-top: 1px solid #e8e4e0; padding: 8px 20px 12px; font-size: 8.5px; color: #9a938c; }
        @media print { .foot { max-width: none; } }
        .foot .wm { font-size: 10px; }
        .foot .spacer { flex: 1; }
      </style>
    </head><body>
      <div style="text-align:center;margin-bottom:14px"><span class="wm">wandr<span class="dot">.</span></span></div>
      <div class="p-label" style="color:#c96442;margin-bottom:4px">${isBucket ? "My bucket list" : "My trip"}</div>
      <div style="font-size:26px;font-weight:800;letter-spacing:-.015em;line-height:1.1">${htmlEscape(destMain)}${destRegion ? ` <span style="font-size:12px;color:#9a938c;font-weight:700">${htmlEscape(destRegion)}</span>` : ""}</div>
      ${ticketHtml}
      <div style="margin-top:6px">${bodyHtml}</div>
      <div class="foot">
        <span class="wm">wandr<span class="dot">.</span></span>
        <span>wandr-mauve.vercel.app</span>
        <span class="spacer"></span>
        <span>${htmlEscape(AI_DISCLAIMER)}</span>
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
        @keyframes wrollin{from{opacity:0;transform:translateY(6px)}}
        @keyframes wrollout{to{opacity:0;transform:translateY(-6px)}}
        @keyframes wghostbreathe{0%,100%{opacity:.45}50%{opacity:.8}}
        @keyframes wghostshim{to{background-position:-220% 0}}
        @keyframes wtravel{0%{transform:translateX(-52px);opacity:0}8%{opacity:1}72%{transform:translateX(52px);opacity:1}82%{transform:translateX(52px);opacity:0}100%{transform:translateX(52px);opacity:0}}
        @keyframes wpark{50%{transform:scale(1.25)}}
        @keyframes wparkring{0%{transform:scale(.5);opacity:.7}70%,100%{transform:scale(1.9);opacity:0}}
        @keyframes wonce{0%{box-shadow:0 0 0 0 rgba(201,100,66,0)}25%{box-shadow:0 0 0 5px rgba(201,100,66,.28)}100%{box-shadow:0 0 0 0 rgba(201,100,66,0)}}
        @keyframes warrive{0%,66%{transform:scale(.35);opacity:0}74%{transform:scale(1);opacity:.8}92%{transform:scale(2.1);opacity:0}100%{transform:scale(2.1);opacity:0}}
        @media (prefers-reduced-motion:reduce){.wroll-in,.wroll-out,.wghost,.wghost-bar,.wtravel,.warrive,.wpark,.wparkring{animation:none!important}.wtravel{opacity:1!important}}
        *{box-sizing:border-box}
      `}</style>


      {/* ── Main dashboard ── */}
      <div style={{ maxWidth:760, margin:"0 auto" }} className="no-print">

        {/* Header */}
        <div style={{ background:`radial-gradient(120% 90% at 18% 0%, rgba(201,100,66,.13), transparent 55%), ${T.bg1}`, borderBottom:`1px solid ${T.border}`, padding:"1.75rem 1.75rem 1.5rem" }}>
          {/* Brand bar — the mark is the way home (standard logo-to-home
              pattern). The trip is already persisted, so leaving is safe:
              it waits on the welcome shelf, one tap from resuming. */}
          <div style={{ marginBottom:"1.25rem" }}>
            <button onClick={onReset} aria-label="Back to home" title="Back to home"
              style={{ background:"transparent", border:"none", padding:0, cursor:"pointer", display:"inline-block" }}>
              <WandrLogo size="sm" showTrail={false} globe="animated" />
            </button>
          </div>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, flexWrap:"wrap", marginBottom:10 }}>
            <div>
              <div style={{ fontSize:T.fs.micro, letterSpacing:".2em", textTransform:"uppercase", color:T.accent, fontWeight:700, marginBottom:5 }}>{isBucket ? "My bucket list" : "My trip"}</div>
              <div style={{ fontSize:T.fs.hero, fontWeight:800, color:T.ink, lineHeight:1.08, letterSpacing:"-.015em" }}>{destMain}</div>
              {destRegion && (
                <div style={{ fontSize:T.fs.meta, color:T.hint, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", marginTop:4 }}>{destRegion}</div>
              )}
            </div>
            <div style={{ display:"flex", gap:7, alignItems:"flex-start" }}>
              {!online && (
                <span title="Your saved trip is readable offline. Building or editing needs a connection."
                  style={{ fontSize:T.fs.label, fontWeight:700, color:T.muted, background:T.bg3, border:`1px solid ${T.border}`, borderRadius:T.r.pill, padding:"4px 9px", whiteSpace:"nowrap" }}>
                  ● Offline
                </span>
              )}
              {otherTrips.length > 0 && (
                <div style={{ position:"relative" }}>
                  <button onClick={() => setSwitcherOpen(v => !v)}
                    style={{ fontSize:T.fs.meta, color:T.muted, background:T.bg3, border:`1px solid ${T.border}`, borderRadius:T.r.sm, padding:"5px 10px", cursor:"pointer", fontFamily:T.font }}>
                    Switch ▾
                  </button>
                  {switcherOpen && (
                    <>
                      {/* Click-away closes the menu — no dead-end open state. */}
                      <div onClick={() => setSwitcherOpen(false)} style={{ position:"fixed", inset:0, zIndex:30 }} />
                      <div className="fade-up"
                        style={{ position:"absolute", top:"calc(100% + 4px)", right:0, zIndex:31, minWidth:190, background:T.bg1, border:`1px solid ${T.border}`, borderRadius:T.r.md, overflow:"hidden", boxShadow:"0 8px 24px rgba(0,0,0,.5)" }}>
                        {otherTrips.map((t, i) => (
                          <button key={t.id}
                            onClick={() => { setSwitcherOpen(false); onSwitchTrip?.(t.id); }}
                            style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 12px", background:"transparent", border:"none", borderTop: i === 0 ? "none" : `1px solid ${T.border}`, cursor:"pointer", fontFamily:T.font }}>
                            <div style={{ fontSize:T.fs.body, fontWeight:700, color:T.ink }}>{t.destination}</div>
                            <div style={{ fontSize:T.fs.label, color:T.hint, marginTop:1 }}>
                              {t.tripStyle === "bucket"
                                ? `${countIdeas(t.categories)} ideas`
                                : [t.answers?.dates?.start, t.answers?.dates?.end].every(Boolean)
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
                onClick={() => { if (online && !building) { setEditSheetStage(isBucket ? "trip-details" : null); setEditSheetOpen(true); } }}
                disabled={!online || building}
                title={!online ? "Editing needs a connection" : building ? "One sec — still curating this trip" : undefined}
                style={{ fontSize:T.fs.meta, color:T.accent, background:"transparent", border:`1px solid ${T.accent}`, borderRadius:T.r.sm, padding:"5px 12px", cursor:online&&!building?"pointer":"not-allowed", opacity:online&&!building?1:.45, fontFamily:T.font, fontWeight:600 }}
              >
                Edit trip
              </button>
              <button onClick={onReset} style={{ fontSize:T.fs.meta, color:T.muted, background:T.bg3, border:`1px solid ${T.border}`, borderRadius:T.r.sm, padding:"5px 12px", cursor:"pointer", fontFamily:T.font }}>New trip</button>
            </div>
          </div>
          {/* Boarding-pass ticket — dates + vitals as one object (design pick 1B).
              trip.season (the full sentence) now lives only in the PDF export;
              the stub shows a short derived label instead. */}
          {(() => {
            const stubLabel = { fontSize:T.fs.micro, letterSpacing:".18em", textTransform:"uppercase", color:T.hint, fontWeight:700 };
            const notch = { position:"absolute", width:22, height:22, borderRadius:"50%", background:T.bg1, border:`1px solid ${T.border2}`, top:-11 };
            const stubs = tripStubs;
            // One rail, two tickets: Depart→Return (itinerary) and
            // Ideas→Picked (bucket) seat this exact center, extracted so the
            // two variants can never drift. Ticket center notes (design pick
            // 2A, 2026-08-11): the ticket's earth retired — the logo keeps the
            // real globe, the PDF keeps its static twin. The ember departs the
            // hollow left ring, streams the dotted rail, arrives right with a
            // soft pulse, and runs ALWAYS — one traveler on the rail in every
            // state, curating included. Pulse pivot is baked into an attribute
            // translate() group — CSS transform-origin on SVG children drifts.
            const railCenter = (
              <div style={{ position:"relative", flex:1, height:26, minWidth:48 }}>
                <svg viewBox="0 0 120 26" style={{ display:"block", width:"100%", height:26, overflow:"visible" }} aria-hidden="true">
                  <line x1="14" y1="13" x2="106" y2="13" stroke={T.border2} strokeWidth="1.6" strokeDasharray="0.1 5" strokeLinecap="round" />
                  <circle cx="8" cy="13" r="2.4" fill="none" stroke={T.muted} strokeWidth="1.3" />
                  <circle cx="112" cy="13" r="2.4" fill={T.accent} />
                  <g transform="translate(112,13)">
                    <circle className="warrive" r="3" fill="none" stroke={T.accent} strokeWidth="1.2" opacity="0" style={{ animation:"warrive 3.4s ease-out infinite" }} />
                  </g>
                  {/* Right Now (1A): on trip days the ember stops commuting and
                      PARKS at today's position along the rail, breathing — the
                      rail becomes a progress bar for the trip you're on. Pivot
                      baked into the translate() group (SVG transform-origin
                      drifts). Other days: the ember travels A → B as shipped;
                      it rests mid-rail when animation is off (reduced motion /
                      VITE_NO_MOTION harness). */}
                  {todayInfo ? (
                    <g transform={`translate(${todayInfo.totalDays === 1 ? 60 : 8 + 104 * (todayInfo.dayNum - 1) / (todayInfo.totalDays - 1)},13)`}>
                      <circle r="4.5" fill={T.accentHover} opacity=".18" />
                      <circle className="wpark" r="2.6" fill={T.accentHover} style={{ animation:"wpark 2.4s ease-in-out infinite" }} />
                      <circle className="wparkring" r="4" fill="none" stroke={T.accentHover} strokeWidth="1" opacity="0" style={{ animation:"wparkring 2.4s ease-out infinite" }} />
                    </g>
                  ) : (
                    <g className="wtravel" style={{ animation:"wtravel 3.4s ease-in-out infinite" }}>
                      <line x1="49" y1="13" x2="56.5" y2="13" stroke={T.accentHover} strokeWidth="1.5" strokeLinecap="round" opacity=".45" />
                      <circle cx="60" cy="13" r="4.5" fill={T.accentHover} opacity=".18" />
                      <circle cx="60" cy="13" r="2.4" fill={T.accentHover} />
                    </g>
                  )}
                </svg>
              </div>
            );
            return (
              <div style={{ position:"relative", marginTop:4, background:T.bg2, border:`1px solid ${T.border2}`, borderRadius:T.r.lg, overflow:"hidden" }}>
                <div style={{ position:"absolute", right:12, top:14, bottom:14, width:13, background:`repeating-linear-gradient(180deg, ${T.border2} 0 2px, transparent 2px 5px)`, opacity:.5, borderRadius:2 }} />
                {/* Bucket ticket (1F mode): Depart/Return have no meaning, so
                    the rail's endpoints become the list's own journey — IDEAS
                    curated → PICKED by the traveler. Same ember, same rail. */}
                {isBucket && (
                  <>
                    <div style={{ display:"flex", alignItems:"center", gap:14, padding:"15px 38px 13px 18px" }}>
                      <div>
                        <div style={stubLabel}>Ideas</div>
                        <div style={{ fontSize:19 /* off-ramp: matches the DEPART/RETURN numeral tier */, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums" }}>{building ? "…" : ideaCount}</div>
                      </div>
                      {railCenter}
                      <div style={{ textAlign:"right" }}>
                        <div style={stubLabel}>Picked</div>
                        <div style={{ fontSize:19 /* off-ramp: matches the DEPART/RETURN numeral tier */, fontWeight:800, color:pickedCount ? T.ink : T.hint, fontVariantNumeric:"tabular-nums" }}>{building ? "…" : pickedCount}</div>
                      </div>
                    </div>
                    <div style={{ position:"relative", borderTop:`1.5px dashed ${T.border2}`, margin:"0 26px" }}>
                      <div style={{ ...notch, left:-37 }} />
                      <div style={{ ...notch, right:-37 }} />
                    </div>
                  </>
                )}
                {dep && ret && (
                  <>
                    <div style={{ display:"flex", alignItems:"center", gap:14, padding:"15px 38px 13px 18px" }}>
                      <div>
                        <div style={stubLabel}>Depart</div>
                        <div style={{ fontSize:19 /* off-ramp: ticket DEPART/RETURN dates — hero-tier numerals, title(17) visibly demotes them */, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums" }}>{dep}</div>
                      </div>
                      {railCenter}
                      <div style={{ textAlign:"right" }}>
                        <div style={stubLabel}>Return</div>
                        <div style={{ fontSize:19 /* off-ramp: ticket DEPART/RETURN dates — hero-tier numerals, title(17) visibly demotes them */, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums" }}>{ret}</div>
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
                      <div style={{ fontSize:T.fs.body, fontWeight:700, color:T.ink, marginTop:1 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          {/* Tagline + highlights removed 2026-08-05 (design pick 3A): they
              restated what the itinerary shows, and cutting them let the whole
              meta build call die. Ticket → itinerary, nothing in between. */}
          {debugMsg && (
            <div style={{ marginTop:10, padding:"6px 10px", background:"rgba(200,80,60,.12)", border:"1px solid rgba(200,80,60,.3)", borderRadius:T.r.sm, fontSize:T.fs.meta, color:"#f08070" }}>
              {"Couldn't load full trip data — some sections may be missing. You can still generate your itinerary below."}
              <div style={{ marginTop:4, opacity:0.7 }}>{debugMsg}</div>
            </div>
          )}
        </div>

        <div style={{ padding:"1.25rem", background:T.bg0, minHeight:400 }}>

          {/* One-time "save these as your defaults?" prompt (first-time users) */}
          {showProfilePrompt && (
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", background:"#2a1a12", border:`1px solid ${T.accent}`, borderRadius:T.r.md, marginBottom:12 }}>
              <div style={{ flex:1, fontSize:T.fs.body, color:T.ink, lineHeight:1.4 }}>
                Save these as your <strong style={{ color:T.accent }}>defaults</strong>? Skip the questions next time.
              </div>
              <button onClick={onSaveProfile}
                style={{ padding:"7px 14px", borderRadius:T.r.md, fontSize:T.fs.body, fontWeight:700, color:T.white, background:T.accent, border:"none", cursor:"pointer", fontFamily:T.font, flexShrink:0 }}>
                Save
              </button>
              <button onClick={onDismissProfilePrompt}
                style={{ padding:"7px 4px", fontSize:T.fs.body, fontWeight:600, color:T.hint, background:"none", border:"none", cursor:"pointer", fontFamily:T.font, flexShrink:0 }}>
                Not now
              </button>
            </div>
          )}

          {/* Happening during your trip — real MLB games at the destination (§7) */}
          {Array.isArray(tripGames) && tripGames.length > 0 && !eventsDismissed && (
            <div style={{ padding:"13px 15px", background:T.bg1, border:`1px solid ${T.border2}`, borderRadius:T.r.md, marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:9 }}>
                <Glyph name="ticket" size={15} color={T.accent} />
                <span style={{ flex:1, fontSize:T.fs.body, fontWeight:800, color:T.ink }}>Happening during your trip</span>
                <button onClick={() => setEventsDismissed(true)} title="Dismiss"
                  style={{ padding:"2px 6px", fontSize:T.fs.body, color:T.hint, background:"none", border:"none", cursor:"pointer", fontFamily:T.font, flexShrink:0 }}>✕</button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {tripGames.slice(0, 4).map((g, i) => {
                  const favShort = g.yours ? TEAM_SHORT[g.role === "away" ? g.away : g.home] : null;
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"baseline", gap:8, fontSize:T.fs.body,
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
                  <div style={{ fontSize:T.fs.meta, color:T.hint, marginTop:1 }}>+{tripGames.length - 4} more</div>
                )}
              </div>
            </div>
          )}

          {/* Right Now mode (1A): on trip days, today leads with the one verb.
              Needs a parsed plan that actually covers today; hidden while the
              build or a full generation is in flight. */}
          {!building && !isBucket && todayInfo && planModel?.days?.[todayInfo.dayNum - 1] && (
            <TodayPanel
              todayInfo={todayInfo}
              day={planModel.days[todayInfo.dayNum - 1]}
              dayIdx={todayInfo.dayNum - 1}
              online={online}
              planLoading={planLoading}
              onRework={onReworkDay}
              reworkUndo={reworkUndo}
              onUndoRework={onUndoRework}
            />
          )}

          {/* Itinerary */}
          <div>
              {/* Curating row (build in flight) vs Generate CTA (no plan yet —
                  the manual fallback after a failed build, or a resumed trip
                  without a plan) vs status row (design pick 2A). On a normal
                  build the itinerary auto-starts, so the CTA is never seen. */}
              {building ? (
                <>
                  <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:10, rowGap:8, padding:"4px 2px 12px", borderBottom:`1px solid ${T.border}`, marginBottom:12 }}>
                    <span style={{ width:7, height:7, borderRadius:"50%", background:T.accent, boxShadow:"0 0 0 3px rgba(201,100,66,.14)", flexShrink:0, animation:"pulse 1.2s ease-in-out infinite" }} />
                    <span style={{ fontSize:T.fs.body, fontWeight:800, color:T.ink }}>{isBucket ? "Curating your ideas" : "Curating your trip"}</span>
                    <RollingMsg text={buildingMsg || "finding the good stuff…"} />
                  </div>
                  <GhostDays nights={trip.nights} />
                </>
              ) : isBucket ? (
                /* Bucket mode: the curated list IS the product — no generate,
                   no plan machinery, no dates. Check-off persists via App. */
                <BucketBoard trip={trip} onTogglePick={onTogglePick}
                  onExport={exportToPdf} onCopy={copyBucketList} copied={copied} />
              ) : !planText && !planLoading ? (() => {
                const hero = MODES[0];
                return (
                  <button onClick={() => online && onGenerate(hero.id)} disabled={!online}
                    style={{ width:"100%", display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:T.r.md, background:T.bg1, border:`1px solid ${T.border2}`, cursor:online?"pointer":"not-allowed", opacity:online?1:.5, fontFamily:T.font, marginBottom:8, textAlign:"left", transition:"all .15s" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:T.fs.ui, fontWeight:800, color:T.ink, marginBottom:2 }}>{hero.label}</div>
                      <div style={{ fontSize:T.fs.body, color:T.muted }}>{online ? hero.desc : "Needs a connection"}</div>
                    </div>
                    <div style={{ fontSize:T.fs.meta, fontWeight:700, color:T.hint, background:T.bg3, padding:"4px 10px", borderRadius:T.r.pill, flexShrink:0 }}>
                      Generate →
                    </div>
                  </button>
                );
              })() : (
                <div style={{ position:"relative", display:"flex", flexWrap:"wrap", alignItems:"center", gap:10, rowGap:8, padding:"4px 2px 12px", borderBottom:`1px solid ${T.border}`, marginBottom:12 }}>
                  <StardustBurst burstKey={readyBurst} origin={{ left: 4, top: "40%" }} />
                  <span style={{ width:7, height:7, borderRadius:"50%", background:T.accent, boxShadow:"0 0 0 3px rgba(201,100,66,.14)", flexShrink:0, animation:planLoading?"pulse 1.2s ease-in-out infinite":"pulse 2.4s ease-in-out infinite" }} />
                  <span style={{ fontSize:T.fs.body, fontWeight:800, color:T.ink }}>Full itinerary</span>
                  <span style={{ fontSize:T.fs.meta, color:T.hint }}>
                    {planLoading ? "writing your days…" : generatedAt ? `generated ${timeAgo(generatedAt)}` : ""}
                  </span>
                  {/* One toolbar for every itinerary action (audit R3) —
                      Copy/Export used to float in their own row inside the
                      plan card, leaving a dead band of empty space. */}
                  <div style={{ display:"flex", gap:7, marginLeft:"auto" }}>
                    {!planLoading && planText && (
                      <>
                        <button onClick={copyPlan}
                          style={{ fontSize:T.fs.meta, fontWeight:600, color:copied==="error"?"#f08070":copied?T.ink:T.muted, background:copied?T.bg3:"transparent", border:`1px solid ${T.border}`, borderRadius:T.r.sm, padding:"5px 12px", cursor:"pointer", fontFamily:T.font, transition:"all .15s" }}>
                          {copied === "error" ? "Copy failed" : copied ? "✓ Copied" : "Copy"}
                        </button>
                        <button onClick={exportToPdf}
                          style={{ fontSize:T.fs.meta, fontWeight:600, color:T.muted, background:"transparent", border:`1px solid ${T.border}`, borderRadius:T.r.sm, padding:"5px 12px", cursor:"pointer", fontFamily:T.font }}>
                          Export PDF
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => { if (online && !planLoading) { setEditSheetStage("full-itinerary"); setEditSheetOpen(true); } }}
                      disabled={!online || planLoading}
                      title={online ? "Rework this itinerary — with your direction" : "Needs a connection"}
                      style={{ fontSize:T.fs.meta, fontWeight:600, color:T.accent, background:"transparent", border:`1px solid ${T.accent}`, borderRadius:T.r.sm, padding:"5px 12px", cursor:online&&!planLoading?"pointer":"not-allowed", opacity:online&&!planLoading?1:.45, fontFamily:T.font }}>
                      ↻ Regenerate
                    </button>
                  </div>
                </div>
              )}
              {/* Patch error banner (day-edit failure — plan text is preserved) */}
              {patchError && !planLoading && (
                <div style={{ display:"flex", alignItems:"center", gap:9, padding:"10px 14px", background:"rgba(180,60,40,.12)", border:"1px solid rgba(180,60,40,.3)", borderRadius:T.r.md, marginBottom:10, fontSize:T.fs.body, color:"#f08070" }}>
                  <Glyph name="warning" size={14} color="#f08070" />
                  <span>{patchError}</span>
                </div>
              )}
              {/* Plan check (§15 #13/#14) — only unambiguous, actionable defects.
                  Accent, not the red error treatment: the plan is usable, these
                  are things to look at. Hidden while streaming, when the day
                  count is legitimately mid-flight. */}
              {FEATURES.planCheck && !planLoading && planIssues.length > 0 && (
                <div style={{ padding:"11px 14px", background:"rgba(201,100,66,.09)", border:`1px solid rgba(201,100,66,.32)`, borderRadius:T.r.md, marginBottom:10 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <Glyph name="warning" size={13} color={T.accent} />
                    <span style={{ fontSize:T.fs.label, fontWeight:700, color:T.accent, letterSpacing:".06em", textTransform:"uppercase" }}>
                      {planIssues.length === 1 ? "One thing to check" : `${planIssues.length} things to check`}
                    </span>
                  </div>
                  <ul style={{ margin:0, paddingLeft:17, display:"flex", flexDirection:"column", gap:3 }}>
                    {planIssues.map((p, i) => (
                      <li key={`${p.code}-${i}`} style={{ fontSize:T.fs.body, color:T.ink, lineHeight:1.5 }}>{p.message}</li>
                    ))}
                  </ul>
                  <button
                    onClick={() => { if (online && !planLoading) { setEditSheetStage("full-itinerary"); setEditSheetOpen(true); } }}
                    disabled={!online || planLoading}
                    style={{ marginTop:9, fontSize:T.fs.meta, fontWeight:600, color:T.accent, background:"transparent", border:`1px solid ${T.accent}`, borderRadius:T.r.sm, padding:"5px 12px", cursor:online&&!planLoading?"pointer":"not-allowed", opacity:online&&!planLoading?1:.45, fontFamily:T.font }}>
                    Rebuild this itinerary
                  </button>
                </div>
              )}
              {/* Loading spinner */}
              {planLoading && !planText && (
                <div style={{ display:"flex", alignItems:"center", gap:9, padding:"1.25rem 0", fontSize:T.fs.body, color:T.muted }}>
                  <div style={{ width:18, height:18, border:`1.5px solid ${T.border}`, borderTopColor:T.accent, borderRadius:"50%", animation:"spin .7s linear infinite" }} />
                  Writing your {MODES.find(m => m.id === planMode)?.label?.toLowerCase()}…
                </div>
              )}
              {/* Plan output */}
              {planText && (
                // Flat itinerary (design pick 10B): blocks sit on the page —
                // the old bg1 wrapper card earned nothing and cost width.
                <div style={{ marginTop:4 }}>
                  {/* Editable blocks once a full itinerary has finished streaming;
                      Md stays the fallback (during streaming, other modes, or if parsing yielded nothing). */}
                  {FEATURES.editableItinerary && !planLoading && planMode === "full" && planModel?.days?.length ? (
                    <ItineraryEditor model={planModel} categories={trip?.categories} onEditActivity={onEditActivity} onDeleteActivity={onDeleteActivity} onReorderDay={onReorderDay} onMoveActivity={onMoveActivity} onMoveToBucket={onMoveToBucket} onTweakActivity={onTweakActivity} tweakingId={tweakingId} />
                  ) : (
                    <Md text={planText} />
                  )}
                  {planLoading && (
                    <span style={{ display:"inline-block", width:7, height:14, background:T.accent, marginLeft:3, animation:"blink 1s step-end infinite", borderRadius:1 }} />
                  )}
                  {!planLoading && (
                    <div style={{ marginTop:"1.25rem", paddingTop:"1rem", borderTop:`1px solid ${T.border}`, fontSize:T.fs.meta, color:T.hint, lineHeight:1.6 }}>
                      {AI_DISCLAIMER}
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
        tripStyle={trip.tripStyle}
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
