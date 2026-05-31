/**
 * Dashboard — the post-interview trip view.
 *
 * Manages its own print-modal state (only relevant here).
 * Everything else — trip data, plan state, tab state — comes from App.jsx via props.
 */
import { useState } from "react";
import { MODES, CATS, T } from "../lib/constants.js";
import { arr } from "../lib/utils.js";
import Md from "./Md.jsx";

// Small colored square used in place of emoji category icons
function CatDot({ col }) {
  return <span style={{ width:7, height:7, borderRadius:1.5, background:col, display:"inline-block", flexShrink:0 }} />;
}

export default function Dashboard({
  trip,
  planText, planLoading, planMode,
  tab, setTab,
  expandedCat, setExpandedCat,
  debugMsg,
  onGenerate,
  onReset,
}) {
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [copied, setCopied] = useState(false);

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
    }).catch(() => {});
  }

  const cats     = trip.categories || {};
  const prac     = trip.practical  || {};
  const a        = trip.answers;
  const hasCats  = Object.values(cats).some(v => Array.isArray(v) && v.length > 0);
  const modeName = MODES.find(m => m.id === planMode)?.label || "Plan";

  function exportToPdf() {
    setShowPrintModal(true);
    setTimeout(() => window.print(), 400);
  }

  return (
    <div style={{ minHeight:"100vh", width:"100%", background:T.bg0, fontFamily:T.font }}>
      <style>{`
        html,body,#root{background:${T.bg0}!important;margin:0;padding:0;min-height:100vh;width:100%}
        @keyframes blink{50%{opacity:0}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box}
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .print-modal { position: static !important; background: #fff !important; padding: 0 !important; overflow: visible !important; }
          .print-content { max-width: 100% !important; box-shadow: none !important; border-radius: 0 !important; }
        }
      `}</style>

      {/* ── Print / PDF modal ── */}
      {showPrintModal && (
        <div className="print-modal" style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.85)", zIndex:9999, overflowY:"auto", padding:"2rem 1rem" }}>
          <div className="no-print" style={{ maxWidth:760, margin:"0 auto 1rem", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontSize:13, color:T.muted, fontFamily:T.font }}>
              Preview — use your browser's <strong style={{ color:T.ink }}>Print → Save as PDF</strong> option
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => window.print()} style={{ padding:"8px 18px", background:T.accent, color:"#fff", border:"none", borderRadius:7, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:T.font }}>Print / Save PDF</button>
              <button onClick={() => setShowPrintModal(false)} style={{ padding:"8px 14px", background:T.bg3, color:T.muted, border:`1px solid ${T.border}`, borderRadius:7, fontSize:13, cursor:"pointer", fontFamily:T.font }}>✕ Close</button>
            </div>
          </div>
          {/* Print-friendly white page */}
          <div className="print-content" style={{ maxWidth:760, margin:"0 auto", background:"#fff", borderRadius:8, padding:"40px", fontFamily:"'Helvetica Neue',Helvetica,sans-serif" }}>
            <div style={{ borderBottom:"2px solid #c96442", paddingBottom:16, marginBottom:24 }}>
              <div style={{ fontSize:28, fontWeight:800, color:"#0d0d0d", letterSpacing:"-.02em", marginBottom:4 }}>{trip.destination}</div>
              <div style={{ fontSize:13, color:"#666", fontStyle:"italic", marginBottom:12 }}>{trip.tagline}</div>
              <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
                {[
                  ["Dates",   [a.dates?.start, a.dates?.end].every(Boolean) ? `${a.dates.start} → ${a.dates.end}` : ""],
                  ["Nights",  trip.nights],
                  ["Budget",  a.budget === 0 ? "With family/friends" : `~${a.budget} USD/day`],
                  ["Party",   arr(a.party).split(",")[0]],
                  ["Season",  trip.season],
                ].filter(([, v]) => v).map(([l, v]) => (
                  <div key={l}>
                    <div style={{ fontSize:9, textTransform:"uppercase", letterSpacing:".08em", color:"#999", marginBottom:2 }}>{l}</div>
                    <div style={{ fontSize:12, color:"#1a1a1a", fontWeight:600 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display:"inline-block", background:"#c96442", color:"#fff", fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:100, textTransform:"uppercase", letterSpacing:".1em", marginBottom:20 }}>{modeName}</div>
            {planText.split("\n").map((line, idx) => {
              if (["TABLE:","ENDTABLE","FOOD:","ENDFOOD"].includes(line.trim())) return null;
              if (line.startsWith("## "))  return <div key={idx} style={{ fontSize:16, fontWeight:800, color:"#0d0d0d", margin:"24px 0 8px", paddingBottom:5, borderBottom:"1px solid #e8e8e8" }}>{line.slice(3)}</div>;
              if (line.startsWith("### ")) return <div key={idx} style={{ fontSize:11, fontWeight:700, color:"#c96442", textTransform:"uppercase", letterSpacing:".08em", margin:"14px 0 6px" }}>{line.slice(4)}</div>;
              if (line.trim().startsWith("TIPS:")) {
                const tips = line.replace("TIPS:", "").trim().split("|").map(t => t.trim()).filter(Boolean);
                return (
                  <div key={idx} style={{ display:"flex", gap:8, flexWrap:"wrap", margin:"8px 0 14px" }}>
                    {tips.map((t, i) => <span key={i} style={{ fontSize:11, background:"#f5f5f5", border:"1px solid #e0e0e0", borderRadius:4, padding:"4px 9px", color:"#555" }}>{t}</span>)}
                  </div>
                );
              }
              if (line.trim().startsWith("|") && !line.match(/^\|[-| ]+\|$/)) {
                const cells = line.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim().replace(/\*\*/g, ""));
                return (
                  <div key={idx} style={{ display:"flex", borderBottom:"1px solid #eee", fontSize:12 }}>
                    {cells.map((c, i) => <div key={i} style={{ padding:"7px 8px", flex:i===0?"0 0 16%":i===1?"0 0 30%":"1", color:i===0?"#c96442":"#333", fontWeight:i<=1?700:400, lineHeight:1.5, wordBreak:"break-word" }}>{c}</div>)}
                  </div>
                );
              }
              if (!line.trim()) return <div key={idx} style={{ height:6 }} />;
              const parts = line.split(/(\*\*[^*]+\*\*)/g);
              return <div key={idx} style={{ fontSize:12.5, color:"#333", lineHeight:1.65, marginBottom:3 }}>{parts.map((p, j) => p.startsWith("**") && p.endsWith("**") ? <strong key={j} style={{ color:"#0d0d0d" }}>{p.slice(2, -2)}</strong> : p)}</div>;
            })}
          </div>
        </div>
      )}

      {/* ── Main dashboard ── */}
      <div style={{ maxWidth:760, margin:"0 auto" }} className="no-print">

        {/* Header */}
        <div style={{ background:T.bg1, borderBottom:`1px solid ${T.border}`, padding:"1.75rem 1.75rem 1.375rem" }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, flexWrap:"wrap", marginBottom:10 }}>
            <div>
              <div style={{ fontSize:9, letterSpacing:".2em", textTransform:"uppercase", color:T.hint, marginBottom:3 }}>Your trip</div>
              <div style={{ fontSize:28, fontWeight:800, color:T.ink, lineHeight:1.1, marginBottom:5 }}>{trip.destination}</div>
              <div style={{ fontSize:12.5, color:T.muted, lineHeight:1.6, maxWidth:440, fontStyle:"italic" }}>{trip.tagline}</div>
              {Array.isArray(trip.highlights) && trip.highlights.length > 0 && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:8 }}>
                  {trip.highlights.map((h, i) => (
                    <span key={i} style={{ fontSize:11, padding:"2px 9px", background:T.bg2, border:`1px solid ${T.border}`, borderRadius:100, color:T.muted }}>
                      {h}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button onClick={onReset} style={{ fontSize:11, color:T.muted, background:T.bg3, border:`1px solid ${T.border}`, borderRadius:6, padding:"5px 12px", cursor:"pointer", fontFamily:T.font }}>New trip</button>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:20, paddingTop:10, borderTop:`1px solid ${T.border}` }}>
            {[
              ["Dates",  [a.dates?.start, a.dates?.end].every(Boolean) ? `${a.dates.start} → ${a.dates.end}` : ""],
              ["Nights", `${trip.nights}`],
              ["Budget", a.budget === 0 ? "With family/friends" : `~${a.budget} USD/day`],
              ["Party",  arr(a.party).split(",")[0]],
              ["Season", trip.season || ""],
            ].filter(([, v]) => v).map(([l, v]) => (
              <div key={l}>
                <div style={{ fontSize:8.5, textTransform:"uppercase", letterSpacing:".15em", color:T.hint }}>{l}</div>
                <div style={{ fontSize:11.5, color:T.ink, fontWeight:600, marginTop:1 }}>{v}</div>
              </div>
            ))}
          </div>
          {debugMsg && (
            <div style={{ marginTop:10, padding:"6px 10px", background:"rgba(200,80,60,.12)", border:"1px solid rgba(200,80,60,.3)", borderRadius:6, fontSize:11, color:"#f08070" }}>
              Couldn't load full trip data — some sections may be missing. Tap a plan mode below to generate your itinerary anyway.
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", alignItems:"center", borderBottom:`1px solid ${T.border}`, background:T.bg1, padding:"0 1rem" }}>
          {[["plan","Plan"], ["activities","Activities"], ["practical","Tips"]].map(([tb, l]) => (
            <button key={tb} onClick={() => setTab(tb)}
              style={{ fontFamily:T.font, padding:"11px 10px", fontSize:12, borderBottom:tab===tb?`2px solid ${T.accent}`:"2px solid transparent", borderTop:"none", borderLeft:"none", borderRight:"none", color:tab===tb?T.accent:T.hint, fontWeight:tab===tb?700:400, background:"transparent", marginBottom:-1, cursor:"pointer", transition:"color .15s" }}>
              {l}
            </button>
          ))}
          {!planMode && tab !== "plan" && (
            <button onClick={() => setTab("plan")}
              style={{ marginLeft:"auto", fontSize:11, color:T.accent, background:"transparent", border:`1px solid ${T.accent}`, borderRadius:100, padding:"3px 10px", cursor:"pointer", fontFamily:T.font, fontWeight:700, flexShrink:0 }}>
              Generate →
            </button>
          )}
        </div>

        <div style={{ padding:"1.25rem", background:T.bg0, minHeight:400 }}>

          {/* ── PLAN TAB ── */}
          {tab === "plan" && (
            <div>
              {/* Hero mode (full itinerary) */}
              {(() => {
                const hero = MODES[0];
                const isActive = planMode === hero.id;
                return (
                  <button onClick={() => onGenerate(hero.id)}
                    style={{ width:"100%", display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:12, background:isActive?"#2a1a12":T.bg1, border:isActive?`2px solid ${T.accent}`:`1px solid ${T.border2}`, cursor:"pointer", fontFamily:T.font, marginBottom:8, textAlign:"left", transition:"all .15s" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:800, color:isActive?T.accent:T.ink, marginBottom:2 }}>{hero.label}</div>
                      <div style={{ fontSize:12, color:isActive?"#a06040":T.muted }}>{hero.desc}</div>
                    </div>
                    <div style={{ fontSize:11, fontWeight:700, color:isActive?T.accent:T.hint, background:isActive?"#3a2a1a":T.bg3, padding:"4px 10px", borderRadius:100, flexShrink:0 }}>
                      {isActive && planLoading ? "…" : isActive ? "Active" : "Generate →"}
                    </div>
                  </button>
                );
              })()}
              {/* Secondary modes */}
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
                          style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 12px", fontSize:12, fontWeight:600, color:copied?T.ink:T.muted, background:copied?T.bg3:"transparent", border:`1px solid ${T.border}`, borderRadius:7, cursor:"pointer", fontFamily:T.font, transition:"all .15s" }}>
                          {copied ? "✓ Copied" : "Copy"}
                        </button>
                        <button onClick={exportToPdf}
                          style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", fontSize:12, fontWeight:600, color:T.accent, background:"transparent", border:`1px solid ${T.accent}`, borderRadius:7, cursor:"pointer", fontFamily:T.font }}>
                          Export PDF
                        </button>
                      </>
                    )}
                  </div>
                  <Md text={planText} />
                  {planLoading && (
                    <span style={{ display:"inline-block", width:7, height:14, background:T.accent, marginLeft:3, animation:"blink 1s step-end infinite", borderRadius:1 }} />
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── ACTIVITIES TAB ── */}
          {tab === "activities" && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {!hasCats && (
                <div style={{ background:T.bg1, border:`1px solid ${T.border}`, borderRadius:12, padding:"2rem", textAlign:"center" }}>
                  <div style={{ fontSize:15, fontWeight:700, color:T.ink, marginBottom:6 }}>No activities loaded</div>
                  <div style={{ fontSize:13, color:T.muted }}>The activity database couldn't be built. Try starting a new trip.</div>
                  {debugMsg && <div style={{ fontSize:11, color:T.accent, background:T.bg3, padding:"6px 10px", borderRadius:6, marginTop:8 }}>{debugMsg}</div>}
                </div>
              )}

              {/* Restaurant ideas — breakfast / lunch / dinner */}
              {["breakfast","lunch","dinner"].some(k => Array.isArray(cats[k]) && cats[k].length > 0) && (
                <div style={{ background:T.bg1, border:`1px solid ${T.border}`, borderRadius:12, overflow:"hidden" }}>
                  <div style={{ padding:"10px 14px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:T.ink }}>Restaurant Ideas</span>
                    <span style={{ fontSize:11, color:T.hint, marginLeft:"auto" }}>pick what works for you</span>
                  </div>
                  {["breakfast","lunch","dinner"].map(meal => {
                    const items = cats[meal];
                    if (!Array.isArray(items) || items.length === 0) return null;
                    const C = CATS[meal];
                    return (
                      <div key={meal} style={{ borderBottom:`1px solid ${T.border}` }}>
                        <div style={{ padding:"8px 14px 0", display:"flex", alignItems:"center", gap:6 }}>
                          <CatDot col={C.col} />
                          <span style={{ fontSize:11.5, fontWeight:700, color:C.col, textTransform:"uppercase", letterSpacing:".08em" }}>{C.label}</span>
                        </div>
                        <div style={{ padding:"0 14px 8px" }}>
                          {items.map((item, i) => (
                            <div key={i} style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10, padding:"8px 0", borderBottom:i<items.length-1?`1px solid ${T.border}`:"none" }}>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:12.5, fontWeight:700, color:T.ink, marginBottom:2 }}>{item.name}</div>
                                <div style={{ fontSize:12, color:T.muted, lineHeight:1.55 }}>{item.description}</div>
                                {item.mustOrder   && <div style={{ fontSize:11.5, color:C.col, marginTop:3 }}><span style={{ fontWeight:700, opacity:.7, marginRight:4 }}>Must try</span>{item.mustOrder}</div>}
                                {item.neighborhood && <div style={{ fontSize:11, color:T.hint, marginTop:2 }}>{item.neighborhood}</div>}
                                {item.proTip      && (
                                  <div style={{ fontSize:11, background:C.bg, color:C.col, padding:"4px 8px", borderRadius:4, marginTop:5, border:`1px solid ${C.border}`, lineHeight:1.55 }}>
                                    <span style={{ fontSize:9.5, fontWeight:700, textTransform:"uppercase", letterSpacing:".07em", opacity:.7, marginRight:5 }}>Pro tip</span>{item.proTip}
                                  </div>
                                )}
                              </div>
                              {item.price && <span style={{ fontSize:11, color:C.col, background:C.bg, padding:"2px 7px", borderRadius:5, border:`1px solid ${C.border}`, flexShrink:0 }}>{item.price}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Activity categories (nature, culture, etc.) */}
              {Object.entries(cats)
                .filter(([cat, items]) => !["breakfast","lunch","dinner"].includes(cat) && Array.isArray(items) && items.length > 0)
                .map(([cat, items], catIdx) => {
                  const C    = CATS[cat] || CATS.exploration;
                  const open = expandedCat === null ? catIdx === 0 : expandedCat === cat;
                  return (
                    <div key={cat} style={{ background:T.bg1, border:`1px solid ${T.border}`, borderRadius:12, overflow:"hidden" }}>
                      <button onClick={() => setExpandedCat(open ? null : cat)}
                        style={{ width:"100%", padding:"11px 14px", display:"flex", alignItems:"center", gap:9, background:open?C.bg:T.bg1, borderBottom:open?`1px solid ${C.border}`:"none", borderTop:"none", borderLeft:"none", borderRight:"none", borderRadius:0, cursor:"pointer", transition:"background .15s", fontFamily:T.font }}>
                        <CatDot col={C.col} />
                        <span style={{ fontSize:13, fontWeight:600, color:open?C.col:T.ink, flex:1, textAlign:"left" }}>{C.label}</span>
                        <span style={{ fontSize:11, color:T.hint }}>{items.length} places</span>
                        <span style={{ fontSize:10, color:T.hint, marginLeft:3 }}>{open?"▲":"▼"}</span>
                      </button>
                      {open && (
                        <div style={{ padding:"0 1rem .5rem", background:T.bg1 }}>
                          {items.map((item, i) => (
                            <div key={i} style={{ padding:"11px 0", borderBottom:i<items.length-1?`1px solid ${T.border}`:"none" }}>
                              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10 }}>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:13, fontWeight:700, marginBottom:3, color:T.ink }}>{item.name}</div>
                                  <div style={{ fontSize:12, color:T.muted, lineHeight:1.6 }}>{item.description}</div>
                                  {item.highlights && <div style={{ fontSize:11.5, color:T.muted, marginTop:4 }}>{item.highlights}</div>}
                                  {item.proTip     && (
                                    <div style={{ fontSize:11, background:C.bg, color:C.col, padding:"4px 8px", borderRadius:5, marginTop:6, lineHeight:1.55, border:`1px solid ${C.border}` }}>
                                      <span style={{ fontSize:9.5, fontWeight:700, textTransform:"uppercase", letterSpacing:".07em", opacity:.7, marginRight:5 }}>Pro tip</span>{item.proTip}
                                    </div>
                                  )}
                                </div>
                                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3, flexShrink:0, minWidth:65 }}>
                                  {item.price      && <span style={{ fontSize:10.5, color:C.col, background:C.bg, padding:"2px 7px", borderRadius:5, border:`1px solid ${C.border}` }}>{item.price}</span>}
                                  {item.duration   && <span style={{ fontSize:10.5, color:T.hint }}>{item.duration}</span>}
                                  {item.admission  && <span style={{ fontSize:10.5, color:T.hint }}>{item.admission}</span>}
                                  {item.difficulty && <span style={{ fontSize:10.5, color:T.hint }}>{item.difficulty}</span>}
                                  {item.bookAhead  && <span style={{ fontSize:9.5, color:T.accent, background:"#2a1a12", padding:"2px 6px", borderRadius:4, border:`1px solid #4a3020` }}>Book ahead</span>}
                                </div>
                              </div>
                              {Array.isArray(item.tags) && item.tags.length > 0 && (
                                <div style={{ display:"flex", gap:4, marginTop:7, flexWrap:"wrap" }}>
                                  {item.tags.map((tg, ti) => <span key={ti} style={{ fontSize:9.5, padding:"2px 7px", borderRadius:100, background:T.bg3, color:T.muted, border:`1px solid ${T.border}` }}>{tg}</span>)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

              {/* Photo spots */}
              {Array.isArray(trip.photoSpots) && trip.photoSpots.length > 0 && (
                <div style={{ background:T.bg1, border:`1px solid ${T.border}`, borderRadius:12, overflow:"hidden" }}>
                  <button onClick={() => setExpandedCat(expandedCat === "__photos__" ? null : "__photos__")}
                    style={{ width:"100%", padding:"11px 14px", display:"flex", alignItems:"center", gap:9, background:expandedCat==="__photos__"?"#1e1530":T.bg1, borderBottom:expandedCat==="__photos__"?"1px solid #352a50":"none", borderTop:"none", borderLeft:"none", borderRight:"none", borderRadius:0, cursor:"pointer", fontFamily:T.font }}>
                    <CatDot col="#b89cf5" />
                    <span style={{ fontSize:13, fontWeight:600, color:expandedCat==="__photos__"?"#b89cf5":T.ink, flex:1, textAlign:"left" }}>Photo spots</span>
                    <span style={{ fontSize:11, color:T.hint }}>{trip.photoSpots.length} spots</span>
                    <span style={{ fontSize:10, color:T.hint, marginLeft:3 }}>{expandedCat==="__photos__"?"▲":"▼"}</span>
                  </button>
                  {expandedCat === "__photos__" && (
                    <div style={{ padding:"0 1rem .75rem", background:T.bg1 }}>
                      {trip.photoSpots.map((spot, i) => {
                        const s = typeof spot === "string" ? { name:spot } : spot;
                        return (
                          <div key={i} style={{ padding:"10px 0", borderBottom:i<trip.photoSpots.length-1?`1px solid ${T.border}`:"none" }}>
                            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:12.5, fontWeight:700, color:T.ink, marginBottom:2 }}>{s.name}{s.neighborhood ? ` · ${s.neighborhood}` : ""}</div>
                                {s.what   && <div style={{ fontSize:12, color:T.muted, lineHeight:1.55 }}>{s.what}</div>}
                                {s.proTip && (
                                  <div style={{ fontSize:11, background:"#1e1a30", color:"#b89cf5", padding:"4px 8px", borderRadius:4, marginTop:5, border:"1px solid #352a50", lineHeight:1.55 }}>
                                    <span style={{ fontSize:9.5, fontWeight:700, textTransform:"uppercase", letterSpacing:".07em", opacity:.7, marginRight:5 }}>Pro tip</span>{s.proTip}
                                  </div>
                                )}
                              </div>
                              <div style={{ display:"flex", flexDirection:"column", gap:3, alignItems:"flex-end", flexShrink:0 }}>
                                {s.bestLight        && <span style={{ fontSize:10, color:"#f0d060", background:"#242010", padding:"2px 6px", borderRadius:4, border:"1px solid #404020" }}>{s.bestLight}</span>}
                                {s.goldenHourWindow && <span style={{ fontSize:10, color:"#f4a86a", background:"#2a1a12", padding:"2px 6px", borderRadius:4, border:"1px solid #4a3020" }}>{s.goldenHourWindow}</span>}
                                {s.lens             && <span style={{ fontSize:10, color:"#7dd87a", background:"#152015", padding:"2px 6px", borderRadius:4, border:"1px solid #254025" }}>{s.lens}</span>}
                                {s.gps              && <a href={`https://maps.google.com/?q=${encodeURIComponent(s.gps)}`} target="_blank" rel="noreferrer" style={{ fontSize:10, color:T.accent, background:T.bg3, padding:"2px 6px", borderRadius:4, textDecoration:"none" }}>Map →</a>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── PRACTICAL TAB ── */}
          {tab === "practical" && (
            <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
              {Object.keys(prac).length === 0 && (
                <div style={{ background:T.bg1, border:`1px solid ${T.border}`, borderRadius:12, padding:"2rem", textAlign:"center" }}>
                  <div style={{ fontSize:15, fontWeight:700, color:T.ink, marginBottom:6 }}>No tips loaded</div>
                  <div style={{ fontSize:13, color:T.muted }}>Try starting a new trip.</div>
                </div>
              )}
              {[
                ["Getting around",    prac.gettingAround],
                ["Best areas",        prac.bestAreas],
                ["Timing & rhythms",  prac.timing],
                ["Budget tips",       prac.budgetTips],
                ["Local insider tips",prac.localTips],
                ["Weather",           prac.weatherNote],
                ["Book ahead",        prac.bookAhead],
              ].filter(([, v]) => v).map(([title, body]) => (
                <div key={title} style={{ background:T.bg1, border:`1px solid ${T.border}`, borderRadius:10, padding:".875rem 1.125rem" }}>
                  <div style={{ fontSize:12.5, fontWeight:700, color:T.ink, marginBottom:5 }}>{title}</div>
                  <div style={{ fontSize:12.5, color:T.muted, lineHeight:1.75 }}>{body}</div>
                </div>
              ))}
              {Array.isArray(trip.avoidList) && trip.avoidList.length > 0 && (
                <div style={{ background:"#251515", border:"1px solid #402020", borderRadius:10, padding:".875rem 1.125rem" }}>
                  <div style={{ fontSize:12.5, fontWeight:700, color:"#f08080", marginBottom:7 }}>Skip these</div>
                  {trip.avoidList.map((av, i) => (
                    <div key={i} style={{ fontSize:12.5, color:"#c08080", marginBottom:4, paddingLeft:10, borderLeft:"2px solid #602020", lineHeight:1.5 }}>{av}</div>
                  ))}
                </div>
              )}
              {/* Trip profile summary */}
              <div style={{ background:T.bg2, border:`1px solid ${T.border}`, borderRadius:10, padding:".875rem 1.125rem" }}>
                <div style={{ fontSize:11, fontWeight:700, color:T.hint, textTransform:"uppercase", letterSpacing:".1em", marginBottom:9 }}>Your trip profile</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 }}>
                  {[
                    ["Destination", a.destination],
                    ["Stay",        a.logistics?.stay || a.stay],
                    ["Transport",   a.logistics?.transport ? arr(a.logistics.transport) : arr(a.transport)],
                    ["Budget",      a.budget === 0 ? "With family/friends" : `~${a.budget} USD/day`],
                    ["Notes",       a.notes],
                  ].filter(([, v]) => v).map(([l, v]) => (
                    <div key={l}>
                      <div style={{ fontSize:9, textTransform:"uppercase", letterSpacing:".1em", color:T.hint, marginBottom:1 }}>{l}</div>
                      <div style={{ fontSize:11.5, color:T.ink, lineHeight:1.5 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
