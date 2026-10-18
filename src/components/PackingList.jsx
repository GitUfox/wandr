/**
 * PackingList — the packing screen (design pick 1C, 2026-10-17).
 *
 * Purely presentational over trip.packing: every write goes out through
 * onChange(nextPacking) → App.updatePacking (persistTrip + sync). The pure
 * mutations live in lib/packing.js so the screen owns only view state:
 * filter, search, the selected item (action bar), collapsed shelves, toast.
 *
 * Shape ports the standalone artifact: boarding-pass ticket with the ember
 * PARKED at the packing position on the rail, Young Serif shelves, check
 * rings, tap-a-name action bar (count / Last call / Remove), nights-aware
 * counts, and the bags-closed burst. Fonts follow the Editorial Pass roles.
 */
import { useState, useEffect, useRef } from "react";
import { T, INPUT_CAPS, NO_MOTION } from "../lib/constants.js";
import { useIsWide } from "../hooks/useIsWide.js";
import { parseISODate, ticketDate } from "../lib/utils.js";
import {
  applyNights, packingTotals, seedPacking, latestPackingSource, tripAdds, tripSeason, findItem,
  toggleItem, toggleLast, setQty, removeItem, restoreItem, addItem, addShelf, unpackAll, STARTER_SHELVES,
} from "../lib/packing.js";
import StardustBurst from "./StardustBurst.jsx";
import Glyph from "./Glyphs.jsx";

const KICK = { fontFamily:T.fontMono, fontSize:T.fs.micro, letterSpacing:".12em", textTransform:"uppercase", color:T.hint, fontWeight:400 };
const MONO = { fontFamily:T.fontMono, fontWeight:400, fontVariantNumeric:"tabular-nums" };
const BTN  = { display:"inline-flex", alignItems:"center", justifyContent:"center", gap:7, minHeight:40, padding:"0 14px", borderRadius:T.r.sm, background:T.bg2, border:`1px solid ${T.border}`, color:T.muted, fontWeight:600, fontSize:T.fs.meta, cursor:"pointer", fontFamily:T.font, whiteSpace:"nowrap" };
const INPUT = { background:T.bg0, border:`1px solid ${T.border}`, borderRadius:T.r.md, padding:"0 12px", minHeight:44, fontSize:T.fs.body, color:T.ink, fontFamily:T.font, outline:"none", width:"100%", minWidth:0 };

function daysUntil(iso) {
  const d = parseISODate(iso);
  if (!d) return null;
  return Math.round((d - new Date().setHours(0, 0, 0, 0)) / 86400000);
}
function departsLine(iso) {
  const d = daysUntil(iso);
  if (d === null) return null;
  if (d > 1) return `Departs in ${d} days`;
  if (d === 1) return "Departs tomorrow";
  if (d === 0) return "Departs today";
  return d === -1 ? "Departed yesterday" : `Departed ${-d} days ago`;
}
function monthName(iso) {
  const d = parseISODate(iso);
  return d ? d.toLocaleDateString("en-US", { month: "long" }) : "";
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

function Ring({ packed, name, onToggle, pop }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={packed} aria-label={`${packed ? "Unpack" : "Pack"} ${name}`}
      className={pop ? "wpk-pop" : undefined}
      style={{ width:26, height:26, borderRadius:"50%", flexShrink:0, cursor:"pointer", padding:0, position:"relative",
        background: packed ? T.accent : "transparent", border:`1.5px solid ${packed ? T.accent : T.border2}`,
        display:"flex", alignItems:"center", justifyContent:"center", transition:"background .15s, border-color .15s" }}>
      {/* 9px hit-slop keeps the 44px target without growing the ring */}
      <span aria-hidden="true" style={{ position:"absolute", inset:-9 }} />
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"
        style={{ stroke:T.white, strokeWidth:2.4, fill:"none", strokeLinecap:"round", strokeLinejoin:"round", opacity:packed?1:0, transform:packed?"scale(1)":"scale(.5)", transition:NO_MOTION?"none":"opacity .15s, transform .2s cubic-bezier(.2,1.4,.4,1)" }}>
        <polyline points="5 12.5 10 17.5 19 7" />
      </svg>
    </button>
  );
}

function Tag({ children, dim }) {
  return <span style={{ ...KICK, letterSpacing:".1em", color:dim?T.hint:T.accentHover, border:`1px solid ${dim?T.border:"rgba(201,100,66,.5)"}`, borderRadius:4, padding:"2px 5px", lineHeight:1.2, whiteSpace:"nowrap" }}>{children}</span>;
}

function Item({ item, selected, onToggle, onSelect, onQty, onLast, onRemove, pop }) {
  const q = item.qty || 1;
  return (
    <li style={{ borderRadius:T.r.md, background:selected?T.bg2:"transparent", transition:"background .15s" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, minHeight:48, padding:"4px 8px 4px 10px" }}>
        <Ring packed={item.packed} name={item.name} onToggle={onToggle} pop={pop} />
        <button type="button" onClick={onSelect} aria-expanded={selected}
          style={{ flex:1, minWidth:0, textAlign:"left", background:"transparent", border:"none", cursor:"pointer", fontFamily:T.font, padding:"8px 0", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap",
            fontSize:T.fs.ui, fontWeight:500, color:item.packed?T.muted:T.ink, textDecoration:item.packed?"line-through":"none", textDecorationColor:T.hint, textDecorationThickness:"1px", lineHeight:1.3, overflowWrap:"anywhere" }}>
          {item.name}
          {item.last && <Tag dim={item.packed}>Last call</Tag>}
          {item.why && <Tag dim>Added · {item.why}</Tag>}
        </button>
        <span title={item.rule ? `Follows your nights (${item.rule})` : "Quantity"}
          style={{ ...MONO, fontSize:T.fs.label, color:item.packed?T.hint:(q===1&&!item.rule)?T.hint:T.muted, whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
          {item.rule && <i aria-hidden="true" style={{ width:4, height:4, borderRadius:"50%", background:T.accentHover }} />}×{q}
        </span>
      </div>
      {selected && (
        <div className="wpk-in" style={{ display:"flex", alignItems:"stretch", gap:6, padding:"0 10px 10px 48px", flexWrap:"wrap" }}>
          <div aria-label="Quantity" style={{ display:"flex", alignItems:"center", background:T.bg3, border:`1px solid ${T.border}`, borderRadius:T.r.sm }}>
            <button type="button" aria-label="One fewer" onClick={() => onQty(q - 1)} disabled={q <= 1}
              style={{ width:44, minHeight:44, background:"transparent", border:"none", color:q<=1?T.hint:T.muted, cursor:q<=1?"default":"pointer", fontSize:T.fs.ui, fontFamily:T.font }}>−</button>
            <span style={{ ...MONO, fontSize:T.fs.label, minWidth:"3.5ch", textAlign:"center", color:T.ink }}>×{q}</span>
            <button type="button" aria-label="One more" onClick={() => onQty(q + 1)}
              style={{ width:44, minHeight:44, background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:T.fs.ui, fontFamily:T.font }}>+</button>
          </div>
          <button type="button" onClick={onLast} aria-pressed={item.last}
            style={{ ...BTN, minHeight:44, background:T.bg3, color:item.last?T.accentHover:T.ink, borderColor:item.last?T.accent:T.border }}>Last call</button>
          <button type="button" onClick={onRemove}
            style={{ ...BTN, minHeight:44, background:T.bg3, color:T.muted }}><Glyph name="x" size={12} /> Remove</button>
          <div style={{ flex:"1 0 100%", fontSize:T.fs.meta, color:T.hint, padding:"2px 2px 0" }}>
            {item.rule ? "Count follows your nights. Change it here to pin a fixed number."
              : item.why ? `Added for this trip because you picked ${item.why}.`
              : item.last ? "Last call means you pack it the morning you leave." : ""}
          </div>
        </div>
      )}
    </li>
  );
}

function SeedCard({ trip, source, onSeed }) {
  const base = source ? source.packing.shelves : STARTER_SHELVES;
  const baseCount = base.reduce((n, s) => n + s.items.length, 0);
  const adds = tripAdds(trip, base.flatMap(s => s.items.map(i => i.name)));
  const season = tripSeason(trip);
  const nights = Number.isFinite(Number(trip.nights)) && trip.nights !== null ? `${trip.nights} ${trip.nights === 1 ? "night" : "nights"}` : null;
  const when = [trip.destination, monthName(trip.answers?.dates?.start) && `in ${monthName(trip.answers?.dates?.start)}`].filter(Boolean).join(" ");
  return (
    <div style={{ background:T.bg1, border:`1px solid ${T.border2}`, borderRadius:T.r.lg, padding:"16px 18px 18px", marginBottom:14 }}>
      <div style={{ fontFamily:T.fontDay, fontWeight:400, fontSize:T.fs.title, color:T.ink, marginBottom:6 }}>Packing for {trip.destination}</div>
      <p style={{ margin:"0 0 10px", fontSize:T.fs.body, color:T.muted, lineHeight:1.5 }}>
        {source
          ? <>Your list from <b style={{ color:T.ink, fontWeight:700 }}>{source.destination}</b>, {baseCount} things, nothing packed yet.{nights ? ` Counts refit to ${nights}.` : ""}</>
          : <>Starter list, {baseCount} things.{nights ? ` Counts follow your ${nights}.` : " Counts stay fixed — this list has no dates."}</>}
      </p>
      {adds.length > 0 && (
        <>
          <div style={{ ...KICK, color:T.muted, marginBottom:7 }}>Added for {when}{season ? ` · ${season}` : ""}</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
            {adds.map(a => (
              <span key={a.name} style={{ fontSize:T.fs.meta, fontWeight:600, padding:"5px 9px", borderRadius:T.r.pill, background:T.bg3, border:"1px solid rgba(201,100,66,.6)", color:T.ink }}>{a.name}</span>
            ))}
          </div>
        </>
      )}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {source ? (
          <>
            <button type="button" onClick={() => onSeed(source)} style={{ ...BTN, background:T.accent, borderColor:T.accent, color:T.white }}>Use my list</button>
            <button type="button" onClick={() => onSeed(null)} style={BTN}>Starter list</button>
          </>
        ) : (
          <button type="button" onClick={() => onSeed(null)} style={{ ...BTN, background:T.accent, borderColor:T.accent, color:T.white }}>Start packing</button>
        )}
      </div>
    </div>
  );
}

/* ── the screen ─────────────────────────────────────────────────────────── */

export default function PackingList({ trip, trips = [], onChange, onBack }) {
  const isWide = useIsWide(820);
  const [filter, setFilter] = useState("all");   // all | togo | packed | last
  const [q, setQ]           = useState("");
  const [sel, setSel]       = useState(null);
  const [closed, setClosed] = useState({});
  const [toast, setToast]   = useState(null);     // { text, undo? }
  const [pop, setPop]       = useState(null);     // item id whose ring just filled
  const [burst, setBurst]   = useState(0);
  const [resetArmed, setResetArmed] = useState(false);
  const [newShelf, setNewShelf]     = useState("");
  const [drafts, setDrafts]         = useState({}); // add-input text per shelf
  const toastTimer = useRef(null);
  const wasDone = useRef(null);

  const packing = trip?.packing?.shelves?.length ? applyNights(trip.packing, trip.nights) : null;
  const totals  = packingTotals(packing);
  const done    = totals.total > 0 && totals.togo === 0;
  const source  = packing ? null : latestPackingSource(trips, trip?.id);
  const filtering = filter !== "all" || q.trim() !== "";
  const query = q.trim().toLowerCase();

  // Bags-closed moment: fires on the transition only, never on load.
  useEffect(() => {
    if (wasDone.current === false && done) setBurst(k => k + 1);
    wasDone.current = done;
  }, [done]);
  useEffect(() => {
    if (!resetArmed) return;
    const t = setTimeout(() => setResetArmed(false), 4000);
    return () => clearTimeout(t);
  }, [resetArmed]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setSel(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function commit(next) { onChange?.(applyNights(next, trip.nights)); }
  function showToast(text, undo) {
    clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 6000 : 2200);
  }
  function visible(item) {
    if (filter === "togo" && item.packed) return false;
    if (filter === "packed" && !item.packed) return false;
    if (filter === "last" && !item.last) return false;
    if (query && !item.name.toLowerCase().includes(query)) return false;
    return true;
  }
  function onToggle(item) {
    if (!item.packed && !NO_MOTION) { setPop(item.id); setTimeout(() => setPop(p => (p === item.id ? null : p)), 650); }
    commit(toggleItem(packing, item.id));
  }
  function onRemove(item) {
    const f = findItem(packing, item.id);
    setSel(null);
    commit(removeItem(packing, item.id));
    showToast(`Removed ${item.name}`, () => commit(restoreItem(removeItem(packing, item.id), f.shelf.id, f.item, f.index)));
  }
  function onAdd(e, shelf) {
    e.preventDefault();
    const raw = drafts[shelf.id] || "";
    const next = addItem(packing, shelf.id, raw);
    if (next === packing) return;
    setDrafts(d => ({ ...d, [shelf.id]: "" }));
    if (filter === "packed" || filter === "last" || query) { setFilter("all"); setQ(""); }
    commit(next);
  }
  function onNewShelf(e) {
    e.preventDefault();
    const next = addShelf(packing, newShelf);
    if (next === packing) return;
    setNewShelf("");
    commit(next);
  }
  function onUnpackAll() {
    if (totals.packed === 0) { showToast("Nothing was packed"); return; }
    const before = packing;
    commit(unpackAll(packing));
    showToast("Everything unpacked", () => commit(before));
  }
  function onReset() {
    if (!resetArmed) { setResetArmed(true); return; }
    setResetArmed(false);
    const before = packing;
    setSel(null);
    commit(seedPacking(trip, null));
    showToast("Starter list restored", () => commit(before));
  }

  /* status line under the ticket */
  let msg;
  if (!packing) msg = null;
  else if (totals.total === 0) msg = <>Nothing on the list yet. Add a few things below.</>;
  else if (done) msg = <><b style={{ color:T.ink, fontWeight:700 }}>Bags closed.</b> Everything is packed. Have a great trip.</>;
  else if (totals.packed === 0) msg = <><b style={{ color:T.ink, fontWeight:700 }}>{totals.togo}</b> things to pack.{totals.last ? <> <b style={{ color:T.ink, fontWeight:700 }}>{totals.last}</b> wait for the morning you leave.</> : null}</>;
  else if (totals.togo === totals.lastTogo) msg = <>Only <b style={{ color:T.ink, fontWeight:700 }}>last call</b> items left. Pack those the morning you leave.</>;
  else msg = <><b style={{ color:T.ink, fontWeight:700 }}>{totals.togo}</b> to go.{totals.lastTogo ? <> <b style={{ color:T.ink, fontWeight:700 }}>{totals.lastTogo}</b> of those are last call.</> : null}</>;

  const start = trip?.answers?.dates?.start;
  const tripline = [departsLine(start), ticketDate(start), trip?.nights != null && `${trip.nights} ${trip.nights === 1 ? "night" : "nights"}`].filter(Boolean);
  const emberLeft = `calc(7px + (100% - 14px) * ${totals.pct / 100})`;
  const notch = { position:"absolute", width:22, height:22, borderRadius:"50%", background:T.bg0, border:`1px solid ${T.border2}`, top:-11 };
  const filters = [["all", "All", null], ["togo", "To pack", totals.togo], ["packed", "Packed", totals.packed], ["last", "Last call", totals.lastTogo]];

  const shelvesEl = packing && packing.shelves.map(shelf => {
    const vis = shelf.items.filter(visible);
    if (filtering && vis.length === 0) return null;
    const ct = shelf.items.length, cp = shelf.items.filter(i => i.packed).length;
    const isClosed = !!closed[shelf.id] && !filtering;
    const complete = ct > 0 && cp === ct;
    return (
      <section key={shelf.id} style={{ background:T.bg1, border:`1px solid ${complete ? "rgba(201,100,66,.45)" : T.border}`, borderRadius:T.r.lg, overflow:"hidden", transition:"border-color .3s" }}>
        <button type="button" onClick={() => setClosed(c => ({ ...c, [shelf.id]: !c[shelf.id] }))} aria-expanded={!isClosed}
          style={{ display:"flex", alignItems:"center", gap:12, width:"100%", textAlign:"left", padding:"14px 12px 12px 18px", background:"transparent", border:"none", cursor:"pointer", fontFamily:T.font }}>
          <h2 style={{ margin:0, fontFamily:T.fontDay, fontWeight:400, fontSize:T.fs.title, color:T.ink, lineHeight:1.2, flex:1, minWidth:0, overflowWrap:"anywhere" }}>{shelf.name}</h2>
          <span style={{ ...MONO, fontSize:T.fs.label, color:complete?T.accentHover:T.muted, whiteSpace:"nowrap" }}>{cp} / {ct}</span>
          <span aria-hidden="true" style={{ width:34, height:34, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:T.muted }}>
            <span style={{ width:7, height:7, borderRight:`1.6px solid currentColor`, borderBottom:`1.6px solid currentColor`, transform:isClosed?"rotate(-45deg)":"rotate(45deg) translate(-1px,-1px)", transition:"transform .25s" }} />
          </span>
        </button>
        <div style={{ height:2, background:T.bg0 }}><div style={{ height:"100%", width:`${ct ? Math.round(cp / ct * 100) : 0}%`, background:T.accent, transition:NO_MOTION?"none":"width .5s cubic-bezier(.2,.8,.2,1)" }} /></div>
        {!isClosed && (
          <div>
            {ct === 0 ? <div style={{ padding:"14px 18px 10px", color:T.hint, fontSize:T.fs.meta }}>Empty shelf. Add the first thing below.</div>
              : vis.length === 0 ? <div style={{ padding:"10px 18px 12px", color:T.hint, fontSize:T.fs.meta }}>Nothing on this shelf matches.</div>
              : (
                <ul style={{ listStyle:"none", margin:0, padding:"6px 8px" }}>
                  {vis.map(item => (
                    <Item key={item.id} item={item} selected={sel === item.id} pop={pop === item.id}
                      onToggle={() => onToggle(item)}
                      onSelect={() => setSel(s => (s === item.id ? null : item.id))}
                      onQty={(n) => commit(setQty(packing, item.id, n))}
                      onLast={() => commit(toggleLast(packing, item.id))}
                      onRemove={() => onRemove(item)} />
                  ))}
                </ul>
              )}
            <form onSubmit={(e) => onAdd(e, shelf)} style={{ display:"flex", gap:8, padding:"6px 12px 12px", borderTop:`1px solid ${T.border}` }}>
              <input type="text" value={drafts[shelf.id] || ""} onChange={(e) => setDrafts(d => ({ ...d, [shelf.id]: e.target.value }))}
                maxLength={INPUT_CAPS.packingItem} autoComplete="off" aria-label={`Add to ${shelf.name}`}
                placeholder={`Add to ${shelf.name}, like Hat or Shirts x3`} style={{ ...INPUT, flex:1 }} />
              <button type="submit" style={{ ...BTN, minHeight:44 }}>Add</button>
            </form>
          </div>
        )}
      </section>
    );
  }).filter(Boolean);

  return (
    <div style={{ minHeight:"100vh", background:T.bg0, color:T.ink, fontFamily:T.font, padding:"18px max(16px, env(safe-area-inset-left)) 96px max(16px, env(safe-area-inset-right))" }}>
      <style>{`
        @keyframes wpkpark{50%{transform:translate(-50%,-50%) scale(1.25)}}
        @keyframes wpkring{0%{transform:translate(-50%,-50%) scale(.5);opacity:.7}70%,100%{transform:translate(-50%,-50%) scale(1.9);opacity:0}}
        @keyframes wpkin{from{opacity:0;transform:translateY(6px)}}
        @keyframes wpkonce{0%{box-shadow:0 0 0 0 rgba(201,100,66,0)}25%{box-shadow:0 0 0 6px rgba(201,100,66,.28)}100%{box-shadow:0 0 0 0 rgba(201,100,66,0)}}
        .wpk-in{animation:wpkin .25s ease}
        .wpk-pop{animation:wpkonce .6s ease-out}
        .wpk-ember{transition:left .9s cubic-bezier(.2,.8,.2,1)}
        .wpk-core{animation:wpkpark 2.4s ease-in-out infinite}
        .wpk-ring{animation:wpkring 2.4s ease-out infinite}
        ${NO_MOTION ? ".wpk-in,.wpk-pop,.wpk-core,.wpk-ring{animation:none!important}.wpk-ember{transition:none!important}" : ""}
        @media (prefers-reduced-motion:reduce){.wpk-in,.wpk-pop,.wpk-core,.wpk-ring{animation:none!important}.wpk-ember{transition:none!important}}
      `}</style>
      <div style={{ maxWidth:760, margin:"0 auto", display:"flex", flexDirection:"column", gap:18 }}>

        {/* top bar — the way back is the trip */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button type="button" onClick={onBack} aria-label="Back to the trip"
            style={{ ...BTN, minHeight:36, padding:"0 12px", background:"transparent" }}>← Trip</button>
          <span style={KICK}>Packing</span>
          <span style={{ ...KICK, color:T.muted, marginLeft:"auto", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{trip?.destination}</span>
        </div>

        {/* ticket */}
        <section aria-live="polite" style={{ position:"relative", background:`radial-gradient(120% 90% at 18% 0%, rgba(201,100,66,.13), transparent 55%), ${T.bg1}`, border:`1px solid ${T.border2}`, borderRadius:T.r.lg, overflow:"hidden" }}>
          <div aria-hidden="true" style={{ position:"absolute", right:12, top:14, bottom:14, width:13, borderRadius:2, opacity:.5, background:`repeating-linear-gradient(180deg, ${T.border2} 0 2px, transparent 2px 5px)` }} />
          <StardustBurst burstKey={burst} origin={{ right: 34, top: 22 }} />
          <div style={{ display:"flex", alignItems:"center", gap:14, padding:"16px 40px 14px 18px" }}>
            <div><div style={KICK}>Packed</div><div style={{ ...MONO, fontSize:17, color:T.ink, lineHeight:1.2 }}>{totals.packed}</div></div>
            <div aria-hidden="true" style={{ position:"relative", flex:1, height:26, minWidth:60 }}>
              <div style={{ position:"absolute", left:14, right:14, top:12, borderTop:`1.6px dotted ${T.border2}` }} />
              <span style={{ position:"absolute", left:4, top:10, width:6, height:6, borderRadius:"50%", border:`1.3px solid ${T.muted}` }} />
              <span style={{ position:"absolute", right:4, top:10, width:6, height:6, borderRadius:"50%", background:done?T.accent:T.border2, transition:"background .4s" }} />
              <div className="wpk-ember" style={{ position:"absolute", top:13, left:emberLeft, width:0, height:0 }}>
                <i style={{ position:"absolute", left:0, top:0, width:11, height:11, borderRadius:"50%", background:T.accentHover, opacity:.18, transform:"translate(-50%,-50%)" }} />
                <i className="wpk-core" style={{ position:"absolute", left:0, top:0, width:5.5, height:5.5, borderRadius:"50%", background:T.accentHover, transform:"translate(-50%,-50%)" }} />
                <i className="wpk-ring" style={{ position:"absolute", left:0, top:0, width:9, height:9, borderRadius:"50%", border:`1px solid ${T.accentHover}`, opacity:0, transform:"translate(-50%,-50%)" }} />
              </div>
            </div>
            <div style={{ textAlign:"right" }}><div style={KICK}>To go</div><div style={{ ...MONO, fontSize:17, color:done?T.hint:T.ink, lineHeight:1.2 }}>{totals.togo}</div></div>
          </div>
          <div style={{ position:"relative", borderTop:`1.5px dashed ${T.border2}`, margin:"0 26px" }}>
            <div style={{ ...notch, left:-37 }} /><div style={{ ...notch, right:-37 }} />
          </div>
          <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:14, padding:"16px 40px 6px 18px" }}>
            <h1 style={{ margin:0, fontFamily:T.fontHero, fontWeight:400, fontSize:T.fs.hero, lineHeight:1.05, letterSpacing:"-.01em", color:T.ink, minWidth:0, overflowWrap:"anywhere" }}>{trip?.destination}</h1>
            <div style={{ ...MONO, fontSize:17, color:totals.packed?T.ink:T.hint, whiteSpace:"nowrap", flexShrink:0 }}>{totals.pct}%</div>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:"6px 10px", padding:"0 40px 14px 18px" }}>
            {tripline.map((t, i) => <span key={i} style={{ ...KICK, color:T.muted }}>{i > 0 && <span aria-hidden="true" style={{ marginRight:10 }}>·</span>}{t}</span>)}
          </div>
          {msg && (
            <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", justifyContent:"space-between", gap:"8px 12px", padding:"12px 40px 14px 18px", borderTop:`1px solid ${T.border}`, background:"rgba(0,0,0,.18)" }}>
              <div className="wpk-in" key={String(totals.togo) + String(totals.lastTogo)} style={{ fontSize:T.fs.body, color:done?T.ink:T.muted, flex:"1 1 240px", minWidth:0 }}>{msg}</div>
            </div>
          )}
        </section>

        {!packing ? (
          <SeedCard trip={trip} source={source} onSeed={(src) => commit(seedPacking(trip, src))} />
        ) : (
          <>
            {/* controls */}
            <section style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"center" }}>
              <div role="group" aria-label="Show" style={{ display:"flex", background:T.bg1, border:`1px solid ${T.border}`, borderRadius:T.r.md, padding:3, gap:2, flex:"1 1 320px", minWidth:0 }}>
                {filters.map(([id, label, count]) => (
                  <button key={id} type="button" onClick={() => { setFilter(id); setSel(null); }} aria-pressed={filter === id}
                    style={{ flex:1, minHeight:38, padding:"0 8px", borderRadius:9, border:"none", cursor:"pointer", fontFamily:T.font, fontWeight:600, fontSize:T.fs.meta,
                      background:filter===id?T.bg3:"transparent", color:filter===id?T.ink:T.muted, display:"flex", alignItems:"center", justifyContent:"center", gap:6, whiteSpace:"nowrap" }}>
                    {label}{count ? <span style={{ ...MONO, fontSize:T.fs.micro, color:filter===id?T.accentHover:T.hint }}>{count}</span> : null}
                  </button>
                ))}
              </div>
              <div style={{ position:"relative", flex:"1 1 200px", minWidth:0 }}>
                <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} placeholder="Find an item" aria-label="Find an item" autoComplete="off"
                  style={{ ...INPUT, background:T.bg1, minHeight:46, paddingRight:40 }} />
                {q && (
                  <button type="button" onClick={() => setQ("")} aria-label="Clear search"
                    style={{ position:"absolute", right:4, top:"50%", transform:"translateY(-50%)", width:38, height:38, borderRadius:T.r.sm, background:"transparent", border:"none", color:T.muted, cursor:"pointer" }}><Glyph name="x" size={12} /></button>
                )}
              </div>
            </section>

            {/* shelves */}
            {shelvesEl.length > 0 ? (
              <main style={{ display:"grid", gridTemplateColumns:isWide?"1fr 1fr":"1fr", gap:14, alignItems:"start" }}>{shelvesEl}</main>
            ) : (
              <div style={{ background:T.bg1, border:`1px dashed ${T.border2}`, borderRadius:T.r.lg, padding:"28px 18px", textAlign:"center", color:T.muted }}>
                <h3 style={{ margin:"0 0 6px", fontFamily:T.fontDay, fontWeight:400, fontSize:T.fs.title, color:T.ink }}>
                  {query ? "No item called that" : filter === "togo" ? "Nothing left to pack" : filter === "packed" ? "Nothing packed yet" : "No last call items"}
                </h3>
                <p style={{ margin:"0 0 14px", fontSize:T.fs.body }}>
                  {query ? `Nothing matches "${q.trim()}". Add it to a shelf below.` : filter === "togo" ? "Every item is in the bag." : filter === "packed" ? "Tap a ring when something goes in the bag." : "Tap a name, then Last call, to mark things you pack the morning you leave."}
                </p>
                <button type="button" onClick={() => { setFilter("all"); setQ(""); }} style={BTN}>Show everything</button>
              </div>
            )}

            <form onSubmit={onNewShelf} style={{ display:"flex", gap:8, alignItems:"center" }}>
              <input type="text" value={newShelf} onChange={(e) => setNewShelf(e.target.value)} maxLength={INPUT_CAPS.packingShelf} autoComplete="off"
                placeholder="New shelf, like Beach or Camera" aria-label="New shelf name" style={{ ...INPUT, background:T.bg1, minHeight:46, flex:1 }} />
              <button type="submit" style={{ ...BTN, minHeight:46 }}>+ Shelf</button>
            </form>

            <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"center", justifyContent:"space-between", paddingTop:6, borderTop:`1px solid ${T.border}` }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                <button type="button" onClick={onUnpackAll} style={BTN}>Unpack everything</button>
                <button type="button" onClick={onReset} style={{ ...BTN, borderColor:resetArmed?T.danger:T.border, color:resetArmed?T.danger:T.muted }}>
                  {resetArmed ? "Tap again to reset" : "Reset to the starter list"}
                </button>
              </div>
              <div style={{ fontSize:T.fs.meta, color:T.hint, flex:"1 1 100%" }}>Tap a ring to pack it. Tap a name for count, Last call and remove. Counts with an ember dot follow your nights. Saved with this trip.</div>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div role="status" style={{ position:"fixed", left:"50%", bottom:"calc(18px + env(safe-area-inset-bottom, 0px))", transform:"translateX(-50%)", zIndex:20, maxWidth:"calc(100vw - 32px)",
          background:T.bg2, border:`1px solid ${T.border2}`, borderRadius:T.r.md, padding:"8px 10px 8px 14px", display:"flex", alignItems:"center", gap:12, fontSize:T.fs.meta, color:T.ink, boxShadow:"0 10px 30px rgba(0,0,0,.5)" }}
          className="wpk-in">
          <span>{toast.text}</span>
          {toast.undo && (
            <button type="button" onClick={() => { toast.undo(); setToast(null); }}
              style={{ ...BTN, minHeight:36, padding:"0 12px", background:T.bg3, color:T.accentHover, fontWeight:700 }}>Undo</button>
          )}
        </div>
      )}
    </div>
  );
}
