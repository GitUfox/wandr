/**
 * Dashboard — the post-interview trip view.
 *
 * Manages its own print-modal state (only relevant here).
 * Everything else — trip data, plan state — comes from App.jsx via props.
 */
import { useState, useEffect, useRef } from "react";
import { MODES, T, FEATURES, AI_DISCLAIMER, NO_MOTION } from "../lib/constants.js";
import { chipSt, fieldSt, primaryBtnSt } from "../lib/styles.js";
import { useOnline } from "../hooks/useOnline.js";
import { useTimeFormat } from "../hooks/useTimeFormat.js";
import { showSaveTripCard, arr, formatShortDate, ticketDate, timeAgo, splitDetails, matchTipToActivity, displayTime, findGroundedVenue, countIdeas, tripDayIndex, parseTime, formatTime } from "../lib/utils.js";
import { bucketTicketRow, bucketPrintBody, bucketPlainText } from "../lib/printBucket.js";
import { parsePlan } from "../lib/planModel.js";
import { TEAM_SHORT } from "../lib/mlbTeams.js";
import Md from "./Md.jsx";
import BucketBoard from "./BucketBoard.jsx";
import ItineraryEditor from "./ItineraryEditor.jsx";
import TripinLogo from "./TripinLogo.jsx";
import EditTripSheet from "./EditTripSheet.jsx";
import SettingsSheet from "./SettingsSheet.jsx";
import ProfileChip from "./ProfileChip.jsx";
import SyncStatusLine from "./SyncStatusLine.jsx";
import SaveTripCard, { readSaveCardDismissed, writeSaveCardDismissed } from "./SaveTripCard.jsx";
import { useAccount } from "../hooks/useAccount.js";
import StationSymbol from "./StationSymbol.jsx";
import Glyph from "./Glyphs.jsx";
import { packingNudge, packingTotals } from "../lib/packing.js";

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
  const msgStyle = { fontSize:T.fs.body, color:T.muted };
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
  const shimAccent = "linear-gradient(90deg, rgba(227,38,47,.10) 25%, rgba(227,38,47,.22) 45%, rgba(227,38,47,.10) 65%)";
  const barStyle = (extra) => ({ height:9, borderRadius:5, backgroundSize:"220% 100%", animation:"wghostshim 2.4s linear infinite", ...extra });
  // Deliberately uneven widths — real itineraries are ragged, and identical
  // skeletons read as a broken repeat rather than a preview.
  const layouts = [["38%", ["62%","46%","57%"]], ["30%", ["52%","66%"]], ["34%", ["58%","44%","50%"]]];
  return (
    <div aria-hidden="true">
      {layouts.slice(0, count).map(([titleW, lines], i) => (
        <div key={i} className="wghost" style={{ borderTop:`3px solid ${T.border}`, padding:"14px 0 8px", marginBottom:14, animation:"wghostbreathe 3.2s ease-in-out infinite", animationDelay:`${i * 0.5}s` }}>
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
    <div key={undoAt} style={{ padding:"14px 16px 16px", background:T.bg1, border:`3px solid ${T.ink}`, borderRadius:T.r.md, marginBottom:16 }}>
      <div style={{ display:"flex", alignItems:"baseline", flexWrap:"wrap", gap:"2px 10px" }}>
        <span style={{ fontFamily:T.fontDay, fontSize:T.fs.title, fontWeight:900, letterSpacing:"-.02em", color:T.ink }}>
          Today · Day {todayInfo.dayNum} of {todayInfo.totalDays}
        </span>
        <span style={{ fontSize:T.fs.body, color:T.muted }}>{dateLine}</span>
      </div>

      {upNext ? (
        <div style={{ marginTop:12 }}>
          <div style={{ fontSize:T.fs.body, fontWeight:700, color:T.muted, marginBottom:4 }}>Up next</div>
          <div style={{ display:"flex", gap:12, alignItems:"center" }}>
            <StationSymbol kind="stop" size={24} />
            <span style={{ flex:1, minWidth:0, fontSize:T.fs.ui, fontWeight:700, color:T.ink }}>{clean(upNext.title)}</span>
            <span style={{ fontFamily:T.fontMono, fontSize:T.fs.ui, fontWeight:900, color:T.ink, fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap", flexShrink:0 }}>{displayTime(clean(upNext.time))}</span>
          </div>
          {upcoming.length > 1 && (
            <div style={{ fontSize:T.fs.body, color:T.muted, marginTop:6 }}>then {upcoming.length - 1} more {upcoming.length - 1 === 1 ? "stop" : "stops"} today</div>
          )}
        </div>
      ) : (
        <div style={{ marginTop:12, fontSize:T.fs.body, color:T.muted }}>All scheduled stops for today are done.</div>
      )}

      {pending && planLoading ? (
        <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:14, fontSize:T.fs.ui, color:T.ink, fontWeight:700 }}>
          <span style={{ width:14, height:14, border:`2px solid ${T.border}`, borderTopColor:T.ink, borderRadius:"50%", display:"inline-block", animation:"spin .7s linear infinite" }} />
          Reworking your {daypart}…
        </div>
      ) : upNext && (
        <>
          <button onClick={() => online && !planLoading && setOpen(o => !o)} disabled={!online || planLoading} aria-expanded={open}
            title={online ? undefined : "Reworking your day needs a connection"}
            style={open
              ? { ...primaryBtnSt(true), width:"100%", marginTop:14, background:"transparent", color:T.ink, border:`2px solid ${T.ink}` }
              : { ...primaryBtnSt(true), width:"100%", marginTop:14, cursor:online && !planLoading ? "pointer" : "not-allowed", opacity:online ? 1 : .5 }}>
            {open ? "Never mind" : `Change my ${daypart}`}
          </button>
          <div style={{ maxHeight:open ? 300 : 0, opacity:open ? 1 : 0, overflow:"hidden", transition:NO_MOTION ? "none" : "max-height .28s ease, opacity .22s ease" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:12 }}>
              {RIGHT_NOW_CHIPS.map(chip => {
                const on = reasons.includes(chip.id);
                return (
                  <button key={chip.id} aria-pressed={on} onClick={() => toggleReason(chip.id)}
                    style={{ ...chipSt(on, { small:true }), display:"inline-flex", alignItems:"center", gap:6 }}>
                    {chip.glyph && <Glyph name={chip.glyph} size={12} color="currentColor" />}
                    {chip.label}
                  </button>
                );
              })}
            </div>
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={280}
              onKeyDown={e => e.key === "Enter" && submit()}
              aria-label="Anything else"
              placeholder="Anything else? e.g. we're near the university now"
              style={{ ...fieldSt, marginTop:10, fontSize:T.fs.body }} />
            <button onClick={submit} disabled={!online} style={{ ...primaryBtnSt(true), width:"100%", marginTop:10, background:T.ink }}>
              Rework from <span style={{ fontVariantNumeric:"tabular-nums" }}>{displayTime(fromTime)}</span> →
            </button>
          </div>
        </>
      )}

      {showUndo && reworkUndo && (
        <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:12, background:T.bg2, borderRadius:T.r.pill, padding:"6px 6px 6px 16px", fontSize:T.fs.body, color:T.ink }}>
          <span>Rest of today reworked</span>
          <button onClick={onUndoRework}
            style={{ marginLeft:"auto", minHeight:40, color:T.ink, fontWeight:900, fontSize:T.fs.body, padding:"0 16px", border:`2px solid ${T.ink}`, borderRadius:T.r.pill, background:T.bg1, cursor:"pointer", fontFamily:T.font }}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

/* ── TripStrip: the trip as a strip of day lines ─────────────────────────────
   Transit Diagram (direction E). This replaces the boarding-pass ticket and
   its ember rail. A dated trip is one color bar per day (T.line, in day
   order) between the two dates. On a trip day, a station ring sits on today's
   bar (Right Now mode, 1A), so the strip is also the progress bar for the
   trip you are on. A bucket list has no dates: it shows one station symbol
   per idea, filled when picked. The stubs (nights, budget, party) are the
   same data the PDF prints, so the two cannot drift. Static: no motion here. */
const MAX_STRIP_DAYS = 14, MAX_STRIP_IDEAS = 18;
// ticketDate() gives "NOV 19" for the PDF. The screen shows "Nov 19".
const sentenceMonth = s => String(s || "").replace(/[A-Z]{2,}/g, m => m[0] + m.slice(1).toLowerCase());

export function TripStrip({ dep, ret, nights, todayInfo, isBucket, ideaCount = 0, pickedCount = 0, building, stubs = [] }) {
  const dateSt = { fontFamily:T.fontMono, fontSize:T.fs.title, fontWeight:900, letterSpacing:"-.02em", color:T.ink, fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap" };
  const totalDays = todayInfo?.totalDays || (nights ? nights + 1 : 0);
  const bars = Math.min(totalDays, MAX_STRIP_DAYS);
  const todayBar = todayInfo ? Math.min(todayInfo.dayNum, bars) - 1 : -1;
  const dots = Math.min(ideaCount, MAX_STRIP_IDEAS);
  return (
    <div>
      {isBucket && (
        <>
          <div style={dateSt}>{building ? "Curating…" : `${ideaCount} ${ideaCount === 1 ? "idea" : "ideas"} · ${pickedCount} picked`}</div>
          {!building && dots > 0 && (
            <div aria-hidden="true" style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:10 }}>
              {Array.from({ length: dots }, (_, i) => <StationSymbol key={i} kind={i < pickedCount ? "done" : "stop"} size={16} />)}
            </div>
          )}
        </>
      )}
      {dep && ret && (
        <>
          <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:12 }}>
            <span style={dateSt}>{sentenceMonth(dep)}</span>
            <span style={dateSt}>{sentenceMonth(ret)}</span>
          </div>
          {bars > 0 && (
            <div role="img" aria-label={todayInfo ? `Day ${todayInfo.dayNum} of ${todayInfo.totalDays}` : `${totalDays} days`}
              style={{ display:"flex", gap:3, marginTop:10 }}>
              {Array.from({ length: bars }, (_, i) => (
                <span key={i} style={{ position:"relative", flex:1, height:12, background:T.line[i % T.line.length] }}>
                  {i === todayBar && (
                    <span style={{ position:"absolute", left:"50%", top:"50%", transform:"translate(-50%,-50%)" }}>
                      <StationSymbol kind="stop" size={26} />
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </>
      )}
      {stubs.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 22px", marginTop:12 }}>
          {stubs.map(([l, v]) => (
            <span key={l} style={{ fontSize:T.fs.body, color:T.muted }}>
              {l} <strong style={{ fontWeight:900, color:T.ink }}>{v}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Header action: an outlined pill.
const hdrBtn = {
  minHeight:40, padding:"0 16px", borderRadius:T.r.pill, border:`2px solid ${T.ink}`,
  background:"transparent", color:T.ink, fontSize:T.fs.body, fontWeight:700, fontFamily:T.font, cursor:"pointer",
};

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
  onOpenPacking,
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
  const [showAccount, setShowAccount] = useState(false); // identity chip → account card
  const account = useAccount();
  useEffect(() => { if (account.linkExpired) setShowAccount(true); }, [account.linkExpired]); // expired sign-in link
  // Save-this-trip card (spec P0-2): once per device. Sign-in retires it too.
  const [saveCardDismissed, setSaveCardDismissed] = useState(readSaveCardDismissed);
  const showSaveCard = showSaveTripCard({ trip, account, dismissed: saveCardDismissed });
  function dismissSaveCard() { writeSaveCardDismissed(); setSaveCardDismissed(true); }
  const online = useOnline();
  // The Settings sheet opens from this screen (identity chip). Subscribing
  // re-renders every time on screen when the 12h/24h format changes.
  useTimeFormat();

  // The "itinerary ready" stardust burst (8C) left with the Transit Diagram
  // redesign. The arrival moment returns in the motion step, as a line that
  // draws from stop to stop.

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
            <circle cx="112" cy="13" r="2.4" fill="#E3262F"/>
            <g transform="translate(60,13) rotate(-20)">
              <ellipse rx="16" ry="5" fill="none" stroke="#c9c2ba" stroke-width=".9"/>
            </g>
            <g transform="translate(60,13) rotate(-23.5)">
              <circle r="10" fill="#E3262F"/>
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
              <ellipse cx="8" cy="13.9" rx="1.7" ry="5.4" fill="#E3262F"/>
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
        bodyHtml += `<div class="prebox"><div class="p-label" style="color:#E3262F;margin-bottom:3px">Before you go</div>${dayTips.map(t => `<div class="tipline">${rich(t)}</div>`).join("")}</div>`;
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
      <title>${htmlEscape(trip.destination)} — Tripin ${isBucket ? "Bucket List" : "Itinerary"}</title>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;700;900&display=swap" rel="stylesheet">
      <style>
        /* Editorial Pass faces on paper (same roles as the screen — see
           constants.js). Erode is self-hosted; this window is about:blank, so
           the URL must be absolute or it silently resolves nowhere. */
        /* 4A print hygiene: margin:0 removes the browser's own header/footer
           (about:blank, timestamp, page counts) — Chrome renders those in the
           page margin, so no margin means no chrome. The body padding below is
           therefore the ONLY physical margin the sheet gets. */
        @page { margin: 0; }
        /* Letter-width column: the on-screen preview matches what prints
           instead of stretching the ticket across a desktop monitor. */
        body { font-family: 'Figtree', system-ui, sans-serif; margin: 0 auto; max-width: 720px; padding: 40px 40px 74px; background: #fff; color: #1a1a1a; box-sizing: border-box; }
        /* Print bottom padding must clear the fixed footer (~34px) or the last
           line of every page runs beneath it. */
        @media print { body { padding: 34px 36px 68px; max-width: none; } }
        .wm { font-weight: 900; font-size: 16px; color: #111; letter-spacing: -.04em; }
        .p-label { font-family: 'Figtree', sans-serif; font-size: 8px; letter-spacing: .12em; text-transform: uppercase; color: #9a938c; font-weight:700; }
        .p-date { font-family: 'Figtree', sans-serif; font-size: 15px; font-weight:700; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .ticket { position: relative; background: #faf8f6; border: 1px solid #e5e0da; border-radius: 12px; overflow: hidden; margin: 12px 0 6px; }
        .barcode { position: absolute; right: 10px; top: 12px; bottom: 12px; width: 11px; border-radius: 2px;
                   background: repeating-linear-gradient(180deg, #d8d2cb 0 2px, transparent 2px 5px); }
        .perf { position: relative; border-top: 1.5px dashed #d8d2cb; margin: 0 22px; }
        .notch { position: absolute; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 1px solid #e5e0da; top: -9px; }
        .dayhead { display: flex; align-items: center; gap: 9px; font-family: 'Figtree', sans-serif; font-size: 16.5px; font-weight:900; margin: 24px 0 4px; break-after: avoid; }
        .daychip { background: #E3262F; color: #fff; font-family: 'Figtree', sans-serif; font-size: 9.5px; font-weight:700; border-radius: 6px; padding: 3px 6px; font-variant-numeric: tabular-nums; }
        .h2 { font-family: 'Figtree', sans-serif; font-size: 16.5px; font-weight:900; color: #0d0d0d; margin: 24px 0 8px; padding-bottom: 5px; border-bottom: 1px solid #e8e8e8; }
        .h3 { font-family: 'Figtree', sans-serif; font-size: 9.5px; font-weight:700; color: #E3262F; text-transform: uppercase; letter-spacing: .1em; margin: 14px 0 6px; }
        .prose { font-family: 'Figtree', sans-serif; font-weight:400; font-size: 12px; color: #333; line-height: 1.6; margin: 0 0 4px; }
        .prose.food { font-size: 10.5px; color: #555; }
        /* 1B day cards: time rail | content. break-inside keeps a stop whole
           across page breaks — the tip belongs to its card, not the next page. */
        .card { display: grid; grid-template-columns: 76px 1fr; gap: 12px; padding: 10px 0 11px; /* 76 fits "10:00 AM" in Martian Mono at 11px + the rail's 10px padding */
                border-bottom: 1px solid #f0eeeb; break-inside: avoid; }
        .rail { text-align: right; border-right: 2px solid #E3262F; padding-right: 10px; }
        .rail .tm { font-family: 'Figtree', sans-serif; font-size: 11px; font-weight:700; letter-spacing: -.02em; color: #0d0d0d; font-variant-numeric: tabular-nums; line-height: 1.2; }
        .rail .du { font-family: 'Figtree', sans-serif; font-size: 7px; font-weight:700; color: #9a938c; letter-spacing: .04em; text-transform: uppercase; margin-top: 3px; }
        .c-ttl { font-size: 12.5px; font-weight: 800; color: #0d0d0d; line-height: 1.3; letter-spacing: -.005em; }
        /* 3B fact chips — same engine as the on-screen blocks (splitDetails). */
        .chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 5px 0 2px; }
        .chip { font-size: 8.5px; font-weight: 700; padding: 2.5px 7px; border-radius: 4px;
                border: 1px solid #e5e0da; color: #6b655f; background: #fbfaf9; white-space: nowrap; }
        .chip.hot { border-color: #e8c4b4; color: #E3262F; background: #fdf5f2; }
        .c-desc { font-family: 'Figtree', sans-serif; font-weight:400; font-size: 10.5px; color: #555; line-height: 1.55; margin-top: 3px; }
        /* Pick A print form: the grounded venue's real street address. */
        .c-addr { display: flex; align-items: center; gap: 4px; font-size: 8.5px; color: #9a938c; margin-top: 3px; }
        /* 2B: a tip rendered with the stop it belongs to. */
        .c-tip { display: flex; gap: 7px; margin-top: 6px; padding: 5px 9px; background: #fbf7f4;
                 border-left: 2.5px solid #E3262F; border-radius: 0 4px 4px 0; break-inside: avoid; }
        .c-tip .bang { color: #E3262F; font-weight: 800; font-size: 9px; line-height: 1.55; }
        .c-tip span { font-family: 'Figtree', sans-serif; font-weight:400; font-size: 9.5px; color: #6b5f57; line-height: 1.55; }
        /* Day-level tips that name no single venue. */
        .prebox { border: 1px solid #e5e0da; border-left: 2.5px solid #E3262F; border-radius: 0 5px 5px 0;
                  padding: 8px 11px; margin: 10px 0 4px; background: #fdfbfa; break-inside: avoid; }
        .prebox .tipline { font-family: 'Figtree', sans-serif; font-weight:400; font-size: 9.5px; color: #6b5f57; line-height: 1.55; margin-top: 2px; }
        /* Bucket-list print cards: check ring column instead of the time rail. */
        .shelfcount { font-size: 9px; font-weight: 700; color: #9a938c; margin-left: 8px; letter-spacing: .04em; text-transform: none; }
        .bcard { display: grid; grid-template-columns: 22px 1fr; gap: 10px; padding: 9px 0 10px;
                 border-bottom: 1px solid #f0eeeb; break-inside: avoid; }
        .bring { width: 15px; height: 15px; border-radius: 50%; border: 1.5px solid #d8d2cb; margin-top: 1px;
                 font-size: 9px; font-weight: 800; color: #fff; display: flex; align-items: center; justify-content: center; }
        .bring.on { background: #E3262F; border-color: #E3262F; }
        .foot { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 720px;
                box-sizing: border-box; display: flex; align-items: center; gap: 10px;
                background: #fff; border-top: 1px solid #e8e4e0; padding: 8px 20px 12px; font-size: 8.5px; color: #9a938c; }
        @media print { .foot { max-width: none; } }
        .foot .wm { font-size: 10px; }
        .foot .spacer { flex: 1; }
      </style>
    </head><body>
      <div style="text-align:center;margin-bottom:14px"><span class="wm">Tripin</span></div>
      <div class="p-label" style="color:#E3262F;margin-bottom:4px">${isBucket ? "My bucket list" : "My trip"}</div>
      <div style="font-family:'Figtree', sans-serif;font-size:30px;font-weight:900;letter-spacing:0;line-height:1.05">${htmlEscape(destMain)}${destRegion ? ` <span style="font-family:'Figtree', sans-serif;font-size:10px;color:#9a938c;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${htmlEscape(destRegion)}</span>` : ""}</div>
      ${ticketHtml}
      <div style="margin-top:6px">${bodyHtml}</div>
      <div class="foot">
        <span class="wm">Tripin</span>
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
        @keyframes wrollin{from{opacity:0;transform:translateY(6px)}}
        @keyframes wrollout{to{opacity:0;transform:translateY(-6px)}}
        @keyframes wghostbreathe{0%,100%{opacity:.45}50%{opacity:.8}}
        @keyframes wghostshim{to{background-position:-220% 0}}
        @media (prefers-reduced-motion:reduce){.wroll-in,.wroll-out,.wghost,.wghost-bar{animation:none!important}}
        *{box-sizing:border-box}
      `}</style>


      {/* ── Main dashboard ── */}
      <div style={{ maxWidth:760, margin:"0 auto" }} className="no-print">

        {/* Header. Transit Diagram (direction E): no card, no ticket. The
            destination is the headline and the trip is a strip of day lines.
            The mark is the way home (standard logo-to-home pattern). The trip
            is already persisted, so leaving is safe: it waits on the welcome
            list, one tap from resuming. */}
        <div style={{ padding:"10px 1.5rem 1.25rem", borderBottom:`3px solid ${T.ink}` }}>
          <div style={{ minHeight:44, marginBottom:18, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
            <button onClick={onReset} aria-label="Back to home" title="Back to home"
              style={{ minHeight:44, background:"transparent", border:"none", padding:0, cursor:"pointer", display:"flex", alignItems:"center" }}>
              <TripinLogo size="xs" />
            </button>
            {/* Identity chip — same component and seat as the welcome corner. */}
            <ProfileChip onOpen={() => setShowAccount(true)} />
          </div>
          <div style={{ fontSize:T.fs.body, fontWeight:700, color:T.muted, marginBottom:4 }}>{isBucket ? "My bucket list" : "My trip"}</div>
          <h1 style={{ margin:0, fontFamily:T.fontHero, fontSize:T.fs.display, fontWeight:900, color:T.ink, lineHeight:.95, letterSpacing:"-.04em", overflowWrap:"anywhere" }}>{destMain}</h1>
          {destRegion && (
            <div style={{ fontSize:T.fs.ui, fontWeight:500, color:T.muted, marginTop:6 }}>{destRegion}</div>
          )}
          <div style={{ marginTop:18 }}>
            <TripStrip dep={dep} ret={ret} nights={trip.nights} todayInfo={todayInfo} isBucket={isBucket}
              ideaCount={ideaCount} pickedCount={pickedCount} building={building} stubs={tripStubs} />
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"center", marginTop:16 }}>
            <button
              onClick={() => { if (online && !building) { setEditSheetStage(isBucket ? "trip-details" : null); setEditSheetOpen(true); } }}
              disabled={!online || building}
              title={!online ? "Editing needs a connection" : building ? "One sec — still curating this trip" : undefined}
              style={{ ...hdrBtn, cursor:online&&!building?"pointer":"not-allowed", opacity:online&&!building?1:.45 }}
            >
              Edit trip
            </button>
            {otherTrips.length > 0 && (
              <div style={{ position:"relative" }}>
                <button onClick={() => setSwitcherOpen(v => !v)} aria-expanded={switcherOpen} style={hdrBtn}>
                  Switch ▾
                </button>
                {switcherOpen && (
                  <>
                    {/* Click-away closes the menu — no dead-end open state. */}
                    <div onClick={() => setSwitcherOpen(false)} style={{ position:"fixed", inset:0, zIndex:30 }} />
                    <div className="fade-up"
                      style={{ position:"absolute", top:"calc(100% + 6px)", left:0, zIndex:31, minWidth:220, background:T.bg1, border:`2px solid ${T.ink}`, borderRadius:T.r.md, overflow:"hidden" }}>
                      {otherTrips.map((t, i) => (
                        <button key={t.id}
                          onClick={() => { setSwitcherOpen(false); onSwitchTrip?.(t.id); }}
                          style={{ display:"block", width:"100%", minHeight:52, textAlign:"left", padding:"8px 14px", background:"transparent", border:"none", borderTop: i === 0 ? "none" : `1px solid ${T.border}`, cursor:"pointer", fontFamily:T.font }}>
                          <div style={{ fontSize:T.fs.ui, fontWeight:900, color:T.ink }}>{t.destination}</div>
                          <div style={{ fontSize:T.fs.meta, color:T.muted, marginTop:1 }}>
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
            <button onClick={onReset} style={hdrBtn}>New trip</button>
            {!online && (
              <span title="Your saved trip is readable offline. Building or editing needs a connection."
                style={{ fontSize:T.fs.body, fontWeight:700, color:T.muted, whiteSpace:"nowrap" }}>
                Offline
              </span>
            )}
          </div>
          {/* Sync status — hidden while building: a skeleton trip is not
              saved anywhere yet, so "Saved" would be untrue for it. */}
          {!building && <SyncStatusLine onSignIn={() => setShowAccount(true)} style={{ marginTop: 12 }} />}
          {/* Tagline + highlights removed 2026-08-05 (design pick 3A): they
              restated what the itinerary shows, and cutting them let the whole
              meta build call die. Ticket → itinerary, nothing in between. */}
          {debugMsg && (
            <div style={{ marginTop:10, padding:"6px 10px", background:T.accentSoft, border:`1px solid ${T.danger}`, borderRadius:T.r.sm, fontSize:T.fs.body, color:T.danger }}>
              {"Couldn't load full trip data — some sections may be missing. You can still generate your itinerary below."}
              <div style={{ marginTop:4, opacity:0.7 }}>{debugMsg}</div>
            </div>
          )}
        </div>

        <div style={{ padding:"1.25rem 1.5rem", background:T.bg0, minHeight:400 }}>

          {/* One-time "Save this trip" sign-in ask (spec P0-2) */}
          {showSaveCard && (
            <SaveTripCard onSignIn={() => { dismissSaveCard(); setShowAccount(true); }} onDismiss={dismissSaveCard} />
          )}

          {/* One-time "save these as your defaults?" prompt (first-time users) */}
          {showProfilePrompt && (
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", background:T.bg1, border:`2px solid ${T.ink}`, borderRadius:T.r.md, marginBottom:16 }}>
              <div style={{ flex:1, fontSize:T.fs.body, color:T.ink, lineHeight:1.4 }}>
                Save these as your <strong>defaults</strong>? Skip the questions next time.
              </div>
              <button onClick={onSaveProfile}
                style={{ minHeight:40, padding:"0 16px", borderRadius:T.r.pill, fontSize:T.fs.body, fontWeight:900, color:T.white, background:T.ink, border:"none", cursor:"pointer", fontFamily:T.font, flexShrink:0 }}>
                Save
              </button>
              <button onClick={onDismissProfilePrompt}
                style={{ minHeight:40, padding:"0 6px", fontSize:T.fs.body, fontWeight:700, color:T.muted, background:"none", border:"none", cursor:"pointer", fontFamily:T.font, flexShrink:0 }}>
                Not now
              </button>
            </div>
          )}

          {/* Happening during your trip — real MLB games at the destination (§7) */}
          {Array.isArray(tripGames) && tripGames.length > 0 && !eventsDismissed && (
            <div style={{ padding:"13px 15px", background:T.bg1, border:`2px solid ${T.ink}`, borderRadius:T.r.md, marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:9 }}>
                <Glyph name="ticket" size={16} color={T.ink} />
                <span style={{ flex:1, fontSize:T.fs.ui, fontWeight:900, color:T.ink }}>Happening during your trip</span>
                <button onClick={() => setEventsDismissed(true)} title="Dismiss"
                  style={{ padding:"2px 6px", fontSize:T.fs.body, color:T.hint, background:"none", border:"none", cursor:"pointer", fontFamily:T.font, flexShrink:0 }}>✕</button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {tripGames.slice(0, 4).map((g, i) => {
                  const favShort = g.yours ? TEAM_SHORT[g.role === "away" ? g.away : g.home] : null;
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"baseline", gap:8, fontSize:T.fs.body,
                      ...(g.yours ? { borderLeft:`6px solid ${T.line[0]}`, paddingLeft:9 } : {}) }}>
                      <span style={{ color:T.ink, fontWeight:900, flexShrink:0, width:64, fontVariantNumeric:"tabular-nums" }}>{formatShortDate(g.date)}</span>
                      <span style={{ lineHeight:1.4 }}>
                        {g.yours && (
                          <span style={{ display:"block", color:T.accentInk, fontWeight:900, marginBottom:1 }}>
                            Your {favShort} {g.role === "away" ? "are in town" : "are home"}
                          </span>
                        )}
                        <span style={{ color:T.ink }}>{g.away} <span style={{ color:T.muted }}>@</span> {g.home}</span>
                        {g.venue && <span style={{ color:T.muted }}> · {g.venue}</span>}
                      </span>
                    </div>
                  );
                })}
                {tripGames.length > 4 && (
                  <div style={{ fontSize:T.fs.body, color:T.muted, marginTop:1 }}>+{tripGames.length - 4} more</div>
                )}
              </div>
            </div>
          )}

          {/* Packing row (1C entry + 3C nudge, 2026-10-17). Always the way to
              the packing screen for dated trips; inside the 7-day window it
              carries the ONE nudge line packingNudge() also gives the welcome
              shelf stub, so the two surfaces can never disagree. Accent
              treatment while the nudge is live, quiet otherwise. Bucket trips
              have no dates and no packing. */}
          {!building && !isBucket && onOpenPacking && (() => {
            const nudge = packingNudge(trip);
            const started = !!trip.packing?.shelves?.length;
            const pt = packingTotals(trip.packing);
            const hot = !!nudge && nudge.kind !== "closed";
            const label = nudge ? nudge.long : started ? `Packing · ${pt.packed} / ${pt.total}` : "Packing list";
            const hint = nudge || started ? null : "Seeded from this trip: dates, nights, interests";
            return (
              <button onClick={onOpenPacking} data-testid="packing-row"
                style={{ width:"100%", minHeight:60, display:"flex", alignItems:"center", gap:12, padding:"10px 12px", marginBottom:16, textAlign:"left", cursor:"pointer", fontFamily:T.font,
                  background: hot ? T.accentSoft : "transparent", border:"none", borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}` }}>
                <Glyph name="trip" size={18} color={T.ink} />
                <span style={{ flex:1, minWidth:0 }}>
                  <span style={{ display:"block", fontSize:T.fs.ui, fontWeight:hot ? 900 : 700, color:T.ink }}>{label}</span>
                  {hint && <span style={{ display:"block", fontSize:T.fs.body, color:T.muted, marginTop:1 }}>{hint}</span>}
                </span>
                <span style={{ fontSize:T.fs.body, color:T.accentInk, fontWeight:900, flexShrink:0 }}>Open →</span>
              </button>
            );
          })()}

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
                  <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:10, rowGap:8, padding:"4px 0 14px", marginBottom:8 }}>
                    <span style={{ width:14, height:14, border:`2px solid ${T.border}`, borderTopColor:T.ink, borderRadius:"50%", flexShrink:0, animation:"spin .7s linear infinite" }} />
                    <span style={{ fontFamily:T.fontDay, fontSize:T.fs.title, fontWeight:900, letterSpacing:"-.02em", color:T.ink }}>{isBucket ? "Curating your ideas" : "Curating your trip"}</span>
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
                    style={{ width:"100%", display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:T.r.md, background:T.bg1, border:`3px solid ${T.ink}`, cursor:online?"pointer":"not-allowed", opacity:online?1:.5, fontFamily:T.font, marginBottom:8, textAlign:"left" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:T.fontDay, fontSize:T.fs.title, fontWeight:900, letterSpacing:"-.02em", color:T.ink, marginBottom:2 }}>{hero.label}</div>
                      <div style={{ fontSize:T.fs.body, color:T.muted }}>{online ? hero.desc : "Needs a connection"}</div>
                    </div>
                    <div style={{ fontSize:T.fs.body, fontWeight:900, color:T.white, background:T.accent, padding:"10px 16px", borderRadius:T.r.pill, flexShrink:0 }}>
                      Generate →
                    </div>
                  </button>
                );
              })() : (
                <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:10, rowGap:8, padding:"4px 0 14px", marginBottom:8 }}>
                  {planLoading && <span style={{ width:14, height:14, border:`2px solid ${T.border}`, borderTopColor:T.ink, borderRadius:"50%", flexShrink:0, animation:"spin .7s linear infinite" }} />}
                  <h2 style={{ margin:0, fontFamily:T.fontDay, fontSize:T.fs.title, fontWeight:900, letterSpacing:"-.02em", color:T.ink }}>Full itinerary</h2>
                  <span style={{ fontSize:T.fs.body, color:T.muted }}>
                    {planLoading ? "writing your days…" : generatedAt ? `generated ${timeAgo(generatedAt)}` : ""}
                  </span>
                  {/* One toolbar for every itinerary action (audit R3) —
                      Copy/Export used to float in their own row inside the
                      plan card, leaving a dead band of empty space. */}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, width:"100%" }}>
                    {!planLoading && planText && (
                      <>
                        <button onClick={copyPlan}
                          style={{ ...hdrBtn, color:copied==="error"?T.danger:T.ink, background:copied?T.bg2:"transparent" }}>
                          {copied === "error" ? "Copy failed" : copied ? "✓ Copied" : "Copy"}
                        </button>
                        <button onClick={exportToPdf} style={hdrBtn}>
                          Export PDF
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => { if (online && !planLoading) { setEditSheetStage("full-itinerary"); setEditSheetOpen(true); } }}
                      disabled={!online || planLoading}
                      title={online ? "Rework this itinerary — with your direction" : "Needs a connection"}
                      style={{ ...hdrBtn, cursor:online&&!planLoading?"pointer":"not-allowed", opacity:online&&!planLoading?1:.45 }}>
                      ↻ Regenerate
                    </button>
                  </div>
                </div>
              )}
              {/* Patch error banner (day-edit failure — plan text is preserved) */}
              {patchError && !planLoading && (
                <div style={{ display:"flex", alignItems:"center", gap:9, padding:"10px 14px", background:T.accentSoft, border:`1px solid ${T.danger}`, borderRadius:T.r.md, marginBottom:12, fontSize:T.fs.body, color:T.danger }}>
                  <Glyph name="warning" size={14} color={T.danger} />
                  <span>{patchError}</span>
                </div>
              )}
              {/* Plan check (§15 #13/#14) — only unambiguous, actionable defects.
                  Accent, not the red error treatment: the plan is usable, these
                  are things to look at. Hidden while streaming, when the day
                  count is legitimately mid-flight. */}
              {FEATURES.planCheck && !planLoading && planIssues.length > 0 && (
                <div style={{ padding:"12px 14px", background:T.bg1, border:`2px solid ${T.ink}`, borderRadius:T.r.md, marginBottom:16 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <Glyph name="warning" size={15} color={T.ink} />
                    <span style={{ fontSize:T.fs.ui, fontWeight:900, color:T.ink }}>
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
                    style={{ ...hdrBtn, marginTop:10, cursor:online&&!planLoading?"pointer":"not-allowed", opacity:online&&!planLoading?1:.45 }}>
                    Rebuild this itinerary
                  </button>
                </div>
              )}
              {/* Loading spinner */}
              {planLoading && !planText && (
                <div style={{ display:"flex", alignItems:"center", gap:9, padding:"1.25rem 0", fontSize:T.fs.body, color:T.muted }}>
                  <div style={{ width:18, height:18, border:`2px solid ${T.border}`, borderTopColor:T.ink, borderRadius:"50%", animation:"spin .7s linear infinite" }} />
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
                    <div style={{ marginTop:"1.25rem", paddingTop:"1rem", borderTop:`1px solid ${T.border}`, fontSize:T.fs.body, color:T.muted, lineHeight:1.6 }}>
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
      {/* Account card — opened by the identity chip. Same sheet as welcome,
          minus "Clear my data": the wipe reloads the app, which would destroy
          a build or stream in flight. That action stays on the welcome screen. */}
      <SettingsSheet open={showAccount} onClose={() => setShowAccount(false)} tripCount={trips.length} focusAccount showData={false} />
    </div>
  );
}
