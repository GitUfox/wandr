/**
 * PackingList — the packing screen (design pick 1C, 2026-10-17).
 *
 * Purely presentational over trip.packing: every write goes out through
 * onChange(nextPacking) → App.updatePacking (persistTrip + sync). The pure
 * mutations live in lib/packing.js so the screen owns only view state:
 * filter, search, the selected item (action bar), collapsed shelves, toast.
 *
 * TRANSIT DIAGRAM (redesign direction E, 2026-11-20): no ticket. Progress is
 * one green line with a station at the packed position; the end of the line
 * is "bags closed". Shelves are ruled sections, items are rows, and the pack
 * control is a station symbol (ring = to pack, disc = packed). The tap-a-name
 * action bar (count / Last call / Remove) and nights-aware counts are the
 * same as before.
 */
import { useState, useEffect, useRef } from "react";
import { T, INPUT_CAPS, NO_MOTION } from "../lib/constants.js";
import { useIsWide } from "../hooks/useIsWide.js";
import { parseISODate, ticketDate } from "../lib/utils.js";

// ticketDate() gives "OCT 24" for the PDF. The screen shows "Oct 24".
const sentenceMonth = s => String(s || "").replace(/[A-Z]{2,}/g, m => m[0] + m.slice(1).toLowerCase());
import {
  applyNights, packingTotals, seedPacking, latestPackingSource, tripAdds, tripSeason, findItem,
  toggleItem, toggleLast, setQty, removeItem, restoreItem, addItem, addShelf, unpackAll, STARTER_SHELVES,
} from "../lib/packing.js";
import StationSymbol from "./StationSymbol.jsx";
import { chipSt, fieldSt, outlineBtnSt, titleSt, motion } from "../lib/styles.js";
import Glyph from "./Glyphs.jsx";

// Shared with every packing control. Transit Diagram (direction E): labels
// are sentence case, numerals are heavy and tabular, buttons are ink pills.
const KICK = { fontSize:T.fs.body, fontWeight:700, color:T.muted };
const MONO = { fontFamily:T.fontMono, fontWeight:900, fontVariantNumeric:"tabular-nums" };
const BTN  = { ...outlineBtnSt, display:"inline-flex", alignItems:"center", justifyContent:"center", gap:7, whiteSpace:"nowrap" };
const FILL = { background:T.ink, color:T.white };
const INPUT = { ...fieldSt, padding:"0 14px", minHeight:48, fontSize:T.fs.body, minWidth:0 };
// Packing progress is the green line (go). The day lines keep the other colors.
const PACK_LINE = T.line[2];
// One easing for the fill and the station, so they stay together.
const PACK_TRAVEL = "PROP .6s cubic-bezier(.2,.8,.2,1)";

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

// The pack control is a station: ring = to pack, filled disc = packed.
function Ring({ packed, name, onToggle }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={packed} aria-label={`${packed ? "Unpack" : "Pack"} ${name}`}
      style={{ width:44, height:44, margin:"0 -9px", flexShrink:0, cursor:"pointer", padding:0, background:"transparent", border:"none",
        display:"flex", alignItems:"center", justifyContent:"center" }}>
      <StationSymbol kind={packed ? "done" : "stop"} size={26} />
    </button>
  );
}

function Tag({ children, dim }) {
  return <span style={{ fontSize:T.fs.meta, fontWeight:700, color:dim?T.muted:T.ink, border:`2px solid ${dim?T.border:T.ink}`, borderRadius:T.r.pill, padding:"1px 9px", lineHeight:1.4, whiteSpace:"nowrap", textDecoration:"none" }}>{children}</span>;
}

function Item({ item, selected, onToggle, onSelect, onQty, onLast, onRemove }) {
  const q = item.qty || 1;
  return (
    <li style={{ borderTop:`1px solid ${T.border}`, borderRadius:selected?T.r.md:0, boxShadow:selected?`inset 0 0 0 2px ${T.ink}`:"none" }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, minHeight:56, padding:"4px 10px 4px 10px" }}>
        <Ring packed={item.packed} name={item.name} onToggle={onToggle} />
        <button type="button" onClick={onSelect} aria-expanded={selected}
          style={{ flex:1, minWidth:0, textAlign:"left", background:"transparent", border:"none", cursor:"pointer", fontFamily:T.font, padding:"10px 0", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap",
            fontSize:T.fs.ui, fontWeight:item.packed?400:700, color:item.packed?T.muted:T.ink, lineHeight:1.3, overflowWrap:"anywhere" }}>
          <span style={{ textDecoration:item.packed?"line-through":"none" }}>{item.name}</span>
          {item.last && <Tag dim={item.packed}>Last call</Tag>}
          {item.why && <Tag dim>Added · {item.why}</Tag>}
        </button>
        <span title={item.rule ? `Follows your nights (${item.rule})` : "Quantity"}
          style={{ ...MONO, fontSize:T.fs.ui, color:item.packed?T.muted:T.ink, whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
          {item.rule && <i aria-hidden="true" style={{ width:8, height:8, borderRadius:"50%", background:PACK_LINE }} />}×{q}
        </span>
      </div>
      {selected && (
        <div className="wpk-in" style={{ display:"flex", alignItems:"stretch", gap:6, padding:"0 10px 12px 50px", flexWrap:"wrap" }}>
          <div aria-label="Quantity" style={{ display:"flex", alignItems:"center", background:T.bg1, border:`2px solid ${T.ink}`, borderRadius:T.r.pill }}>
            <button type="button" aria-label="One fewer" onClick={() => onQty(q - 1)} disabled={q <= 1}
              style={{ width:44, minHeight:40, background:"transparent", border:"none", color:q<=1?T.hint:T.ink, cursor:q<=1?"default":"pointer", fontSize:T.fs.title, fontWeight:700, fontFamily:T.font }}>−</button>
            <span style={{ ...MONO, fontSize:T.fs.body, minWidth:"3.5ch", textAlign:"center", color:T.ink }}>×{q}</span>
            <button type="button" aria-label="One more" onClick={() => onQty(q + 1)}
              style={{ width:44, minHeight:40, background:"transparent", border:"none", color:T.ink, cursor:"pointer", fontSize:T.fs.title, fontWeight:700, fontFamily:T.font }}>+</button>
          </div>
          <button type="button" onClick={onLast} aria-pressed={item.last}
            style={{ ...chipSt(item.last, { small:true }), minHeight:44 }}>Last call</button>
          <button type="button" onClick={onRemove} style={BTN}><Glyph name="x" size={12} /> Remove</button>
          <div style={{ flex:"1 0 100%", fontSize:T.fs.meta, color:T.muted, padding:"2px 2px 0" }}>
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
    <div style={{ background:T.bg1, border:`2px solid ${T.ink}`, borderRadius:T.r.md, padding:"16px 18px 18px", marginBottom:14 }}>
      <div style={{ ...titleSt, marginBottom:6 }}>Packing for {trip.destination}</div>
      <p style={{ margin:"0 0 10px", fontSize:T.fs.body, color:T.muted, lineHeight:1.5 }}>
        {source
          ? <>Your list from <b style={{ color:T.ink, fontWeight:700 }}>{source.destination}</b>, {baseCount} things, nothing packed yet.{nights ? ` Counts refit to ${nights}.` : ""}</>
          : <>Starter list, {baseCount} things.{nights ? ` Counts follow your ${nights}.` : " Counts stay fixed — this list has no dates."}</>}
      </p>
      {adds.length > 0 && (
        <>
          <div style={{ ...KICK, color:T.ink, marginBottom:7 }}>Added for {when}{season ? ` · ${season}` : ""}</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
            {adds.map(a => (
              <span key={a.name} style={{ fontSize:T.fs.meta, fontWeight:700, padding:"4px 11px", borderRadius:T.r.pill, background:T.bg1, border:`2px solid ${T.ink}`, color:T.ink }}>{a.name}</span>
            ))}
          </div>
        </>
      )}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {source ? (
          <>
            <button type="button" onClick={() => onSeed(source)} style={{ ...BTN, ...FILL }}>Use my list</button>
            <button type="button" onClick={() => onSeed(null)} style={BTN}>Starter list</button>
          </>
        ) : (
          <button type="button" onClick={() => onSeed(null)} style={{ ...BTN, ...FILL }}>Start packing</button>
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
  const [resetArmed, setResetArmed] = useState(false);
  const [newShelf, setNewShelf]     = useState("");
  const [drafts, setDrafts]         = useState({}); // add-input text per shelf
  const toastTimer = useRef(null);

  const packing = trip?.packing?.shelves?.length ? applyNights(trip.packing, trip.nights) : null;
  const totals  = packingTotals(packing);
  const done    = totals.total > 0 && totals.togo === 0;
  const source  = packing ? null : latestPackingSource(trips, trip?.id);
  const filtering = filter !== "all" || q.trim() !== "";
  const query = q.trim().toLowerCase();

  // Bags-closed moment: the station reaches the end of the line and gives one
  // beat. It fires on the transition only, never on load.
  const wasDone = useRef(null);
  const [arrive, setArrive] = useState(0);
  useEffect(() => {
    if (wasDone.current === false && done) setArrive(k => k + 1);
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
  const tripline = [departsLine(start), sentenceMonth(ticketDate(start)), trip?.nights != null && `${trip.nights} ${trip.nights === 1 ? "night" : "nights"}`].filter(Boolean);
  const filters = [["all", "All", null], ["togo", "To pack", totals.togo], ["packed", "Packed", totals.packed], ["last", "Last call", totals.lastTogo]];

  const shelvesEl = packing && packing.shelves.map(shelf => {
    const vis = shelf.items.filter(visible);
    if (filtering && vis.length === 0) return null;
    const ct = shelf.items.length, cp = shelf.items.filter(i => i.packed).length;
    const isClosed = !!closed[shelf.id] && !filtering;
    const complete = ct > 0 && cp === ct;
    return (
      <section key={shelf.id} style={{ borderTop:`3px solid ${T.ink}` }}>
        <button type="button" onClick={() => setClosed(c => ({ ...c, [shelf.id]: !c[shelf.id] }))} aria-expanded={!isClosed}
          style={{ display:"flex", alignItems:"center", gap:12, width:"100%", textAlign:"left", padding:"12px 0 10px", minHeight:52, background:"transparent", border:"none", cursor:"pointer", fontFamily:T.font }}>
          <h2 style={{ ...titleSt, margin:0, lineHeight:1.2, flex:1, minWidth:0, overflowWrap:"anywhere" }}>{shelf.name}</h2>
          <span style={{ ...MONO, fontSize:T.fs.body, color:complete?T.ink:T.muted, whiteSpace:"nowrap" }}>{cp} / {ct}</span>
          <span aria-hidden="true" style={{ width:34, height:34, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:T.muted }}>
            <span style={{ width:8, height:8, borderRight:`2.5px solid ${T.ink}`, borderBottom:`2.5px solid ${T.ink}`, transform:isClosed?"rotate(-45deg)":"rotate(45deg) translate(-1px,-1px)", transition:"transform .25s" }} />
          </span>
        </button>
        <div style={{ height:6, background:T.border }}><div style={{ height:"100%", width:`${ct ? Math.round(cp / ct * 100) : 0}%`, background:PACK_LINE, transition:NO_MOTION?"none":"width .5s cubic-bezier(.2,.8,.2,1)" }} /></div>
        {!isClosed && (
          <div>
            {ct === 0 ? <div style={{ padding:"14px 0 10px", color:T.muted, fontSize:T.fs.body }}>Empty shelf. Add the first thing below.</div>
              : vis.length === 0 ? <div style={{ padding:"10px 0 12px", color:T.muted, fontSize:T.fs.body }}>Nothing on this shelf matches.</div>
              : (
                <ul style={{ listStyle:"none", margin:0, padding:0 }}>
                  {vis.map(item => (
                    <Item key={item.id} item={item} selected={sel === item.id}
                      onToggle={() => onToggle(item)}
                      onSelect={() => setSel(s => (s === item.id ? null : item.id))}
                      onQty={(n) => commit(setQty(packing, item.id, n))}
                      onLast={() => commit(toggleLast(packing, item.id))}
                      onRemove={() => onRemove(item)} />
                  ))}
                </ul>
              )}
            <form onSubmit={(e) => onAdd(e, shelf)} style={{ display:"flex", gap:8, padding:"12px 0 18px", borderTop:`1px solid ${T.border}` }}>
              <input type="text" value={drafts[shelf.id] || ""} onChange={(e) => setDrafts(d => ({ ...d, [shelf.id]: e.target.value }))}
                maxLength={INPUT_CAPS.packingItem} autoComplete="off" aria-label={`Add to ${shelf.name}`}
                placeholder={`Add to ${shelf.name}, like Hat or Shirts x3`} style={{ ...INPUT, flex:1 }} />
              <button type="submit" style={{ ...BTN, ...FILL, minHeight:48 }}>Add</button>
            </form>
          </div>
        )}
      </section>
    );
  }).filter(Boolean);

  return (
    <div style={{ minHeight:"100vh", background:T.bg0, color:T.ink, fontFamily:T.font, padding:"18px max(16px, env(safe-area-inset-left)) 96px max(16px, env(safe-area-inset-right))" }}>
      <style>{`
        @keyframes wpkin{from{opacity:0;transform:translateY(6px)}}
        .wpk-in{animation:wpkin .25s ease}
        ${NO_MOTION ? ".wpk-in{animation:none!important}" : ""}
        @media (prefers-reduced-motion:reduce){.wpk-in{animation:none!important}}
      `}</style>
      <div style={{ maxWidth:760, margin:"0 auto", display:"flex", flexDirection:"column", gap:18 }}>

        {/* top bar — the way back is the trip */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, minHeight:44 }}>
          <button type="button" onClick={onBack} aria-label="Back to the trip"
            style={{ minHeight:44, padding:0, background:"none", border:"none", cursor:"pointer", fontFamily:T.font, fontSize:T.fs.ui, fontWeight:700, color:T.ink, display:"flex", alignItems:"center", gap:6 }}>← Trip</button>
          <span style={{ ...KICK, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{trip?.destination}</span>
        </div>

        {/* Header. Transit Diagram: no ticket. Packing progress is one line
            with a station at the packed position. The end of the line is
            "bags closed". The station travels with the fill and gives one beat
            when it arrives. */}
        <section aria-live="polite">
          <h1 style={{ margin:0, fontFamily:T.fontHero, fontWeight:900, fontSize:T.fs.display, lineHeight:.95, letterSpacing:"-.04em", color:T.ink }}>Packing</h1>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"2px 10px", marginTop:8 }}>
            {tripline.map((t, i) => <span key={i} style={KICK}>{i > 0 && <span aria-hidden="true" style={{ marginRight:10 }}>·</span>}{t}</span>)}
          </div>
          <div role="progressbar" aria-label="Packed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={totals.pct}
            style={{ position:"relative", height:30, marginTop:16 }}>
            <div style={{ position:"absolute", left:13, right:13, top:10, height:10, background:T.border }}>
              {/* Motion: the fill and the station travel together along the line. */}
              <div style={{ width:`${totals.pct}%`, height:"100%", background:PACK_LINE, transition:NO_MOTION?"none":PACK_TRAVEL.replace("PROP", "width") }} />
              <span style={{ position:"absolute", top:"50%", left:`${totals.pct}%`, transform:"translate(-50%,-50%)", transition:NO_MOTION?"none":PACK_TRAVEL.replace("PROP", "left") }}>
                <span key={arrive} className={arrive ? motion("t-arrive") : undefined} style={{ display:"block" }}>
                  <StationSymbol kind={done ? "done" : "stop"} size={26} color={done ? PACK_LINE : T.ink} />
                </span>
              </span>
            </div>
            {!done && <span aria-hidden="true" style={{ position:"absolute", right:8, top:3, width:10, height:24, background:T.ink }} />}
          </div>
          <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:12, marginTop:6 }}>
            <div style={{ display:"flex", alignItems:"baseline", gap:6 }}><span style={KICK}>Packed</span><span style={{ ...MONO, fontSize:T.fs.title, color:T.ink }}>{totals.packed}</span></div>
            <div style={{ ...MONO, fontSize:T.fs.title, color:totals.packed?T.ink:T.muted }}>{totals.pct}%</div>
            <div style={{ display:"flex", alignItems:"baseline", gap:6 }}><span style={KICK}>To go</span><span style={{ ...MONO, fontSize:T.fs.title, color:done?T.muted:T.ink }}>{totals.togo}</span></div>
          </div>
          {msg && (
            <div className="wpk-in" key={String(totals.togo) + String(totals.lastTogo)} style={{ fontSize:T.fs.ui, color:done?T.ink:T.muted, marginTop:12, lineHeight:1.5 }}>{msg}</div>
          )}
        </section>

        {!packing ? (
          <SeedCard trip={trip} source={source} onSeed={(src) => commit(seedPacking(trip, src))} />
        ) : (
          <>
            {/* controls */}
            <section style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"center" }}>
              <div role="group" aria-label="Show" style={{ display:"flex", flexWrap:"wrap", gap:6, flex:"1 1 320px", minWidth:0 }}>
                {filters.map(([id, label, count]) => (
                  <button key={id} type="button" onClick={() => { setFilter(id); setSel(null); }} aria-pressed={filter === id}
                    style={{ ...chipSt(filter === id, { small:true }), display:"inline-flex", alignItems:"center", gap:6, whiteSpace:"nowrap" }}>
                    {label}{count ? <span style={{ ...MONO, fontSize:T.fs.meta }}>{count}</span> : null}
                  </button>
                ))}
              </div>
              <div style={{ position:"relative", flex:"1 1 200px", minWidth:0 }}>
                <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} placeholder="Find an item" aria-label="Find an item" autoComplete="off"
                  style={{ ...INPUT, paddingRight:44 }} />
                {q && (
                  <button type="button" onClick={() => setQ("")} aria-label="Clear search"
                    style={{ position:"absolute", right:4, top:"50%", transform:"translateY(-50%)", width:44, height:44, borderRadius:"50%", background:"transparent", border:"none", color:T.ink, cursor:"pointer" }}><Glyph name="x" size={12} /></button>
                )}
              </div>
            </section>

            {/* shelves */}
            {shelvesEl.length > 0 ? (
              <main style={{ display:"grid", gridTemplateColumns:isWide?"1fr 1fr":"1fr", gap:isWide?"8px 32px":8, alignItems:"start" }}>{shelvesEl}</main>
            ) : (
              <div style={{ background:T.bg1, border:`2px solid ${T.ink}`, borderRadius:T.r.md, padding:"28px 18px", textAlign:"center", color:T.muted }}>
                <h3 style={{ ...titleSt, margin:"0 0 6px" }}>
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
                placeholder="New shelf, like Beach or Camera" aria-label="New shelf name" style={{ ...INPUT, flex:1 }} />
              <button type="submit" style={{ ...BTN, minHeight:48 }}>+ Shelf</button>
            </form>

            <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"center", justifyContent:"space-between", paddingTop:14, borderTop:`3px solid ${T.ink}` }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                <button type="button" onClick={onUnpackAll} style={BTN}>Unpack everything</button>
                <button type="button" onClick={onReset} style={{ ...BTN, border:`2px solid ${resetArmed ? T.danger : T.ink}`, color:resetArmed?T.danger:T.ink }}>
                  {resetArmed ? "Tap again to reset" : "Reset to the starter list"}
                </button>
              </div>
              <div style={{ fontSize:T.fs.meta, color:T.muted, flex:"1 1 100%", lineHeight:1.5 }}>Tap a ring to pack it. Tap a name for count, Last call and remove. Counts with a green dot follow your nights. Saved with this trip.</div>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div role="status" style={{ position:"fixed", left:"50%", bottom:"calc(18px + env(safe-area-inset-bottom, 0px))", transform:"translateX(-50%)", zIndex:20, maxWidth:"calc(100vw - 32px)",
          background:T.ink, borderRadius:T.r.pill, padding:"6px 6px 6px 18px", minHeight:48, display:"flex", alignItems:"center", gap:12, fontSize:T.fs.body, fontWeight:700, color:T.white }}
          className="wpk-in">
          <span>{toast.text}</span>
          {toast.undo && (
            <button type="button" onClick={() => { toast.undo(); setToast(null); }}
              style={{ ...BTN, minHeight:36, padding:"0 14px", background:T.bg1, color:T.ink, fontWeight:900 }}>Undo</button>
          )}
        </div>
      )}
    </div>
  );
}
