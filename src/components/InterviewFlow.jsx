/**
 * InterviewFlow — the 6-step trip interview screen.
 *
 * Receives all form state and handlers from App.jsx via props.
 * Owns no app state of its own — purely presentational. The one exception is
 * `expanded` (which interest-chip groups are showing all options): pure UI
 * state, doesn't feed the answer payload, doesn't need to survive step nav.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { STEPS, T } from "../lib/constants.js";
import { MLB_TEAMS } from "../lib/mlbTeams.js";
import DateRangePicker from "./DateRangePicker.jsx";

// Interest chips that reveal the favorite-team picker (§7 personalization).
const BASEBALL_TAGS = ["Baseball", "Spring-training"];
const TEAM_OPTIONS = [...MLB_TEAMS].sort((a, b) => a.name.localeCompare(b.name));
import DictationButton from "./DictationButton.jsx";
import BudgetTiers from "./BudgetTiers.jsx";

// Mic position for single-line inputs (anchored to the input's top, so the
// wrapper's bottom margin doesn't throw off vertical centering).
const INPUT_MIC = { top: 5, bottom: "auto", right: 8, width: 28, height: 28 };

const inputSt = {
  width:"100%", padding:"10px 14px", border:`1px solid ${T.border}`, borderRadius:8,
  background:T.bg3, color:T.ink, outline:"none", fontSize:13.5, fontFamily:T.font,
  marginBottom:"1.25rem", colorScheme:"dark", boxSizing:"border-box",
};


const STEP_VARIANTS = {
  enter:  (dir) => ({ x: dir > 0 ? 32 : -32, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   (dir) => ({ x: dir > 0 ? -32 : 32, opacity: 0 }),
};
const STEP_TRANSITION = { duration: 0.18, ease: [0.25, 0.1, 0.25, 1] };

export default function InterviewFlow({
  step,
  direction,
  onWelcome, onAdvance, onBack,
  cur, setCur,
  chips, setChips,
  priorityChips, setPriorityChips,
  teams, setTeams,
  kids, setKids,
  avoidText, setAvoidText,
  budget, setBudget,
  d1, setD1, d2, setD2,
  logStay, setLogStay,
  logTransport, setLogTransport,
  logPace, setLogPace,
  logFocus, setLogFocus,
  logRhythm, setLogRhythm,
  isValid,
}) {
  const S   = STEPS[step];
  const pct = Math.round((step / STEPS.length) * 100);
  const [expanded, setExpanded] = useState(new Set());

  function toggleChip(o) {
    if (S.singleSelect) {
      setChips(p => p.includes(o) ? [] : [o]);
      if (S.id === "party") setKids("");
    } else {
      setChips(p => p.includes(o) ? p.filter(x => x !== o) : [...p, o]);
    }
  }

  return (
    <div style={{ minHeight:"100vh", width:"100%", background:T.bg0, fontFamily:T.font }}>
      <style>{`html,body,#root{background:${T.bg0}!important;margin:0;padding:0;min-height:100vh;width:100%} *{box-sizing:border-box}
        /* Chips bold on select; reserve the bold width up front so toggling
           weight never changes the chip size (no flex-wrap reflow). */
        .wandr-chip{position:relative}
        .wandr-chip::after{content:attr(data-label);display:block;height:0;overflow:hidden;visibility:hidden;font-weight:700;pointer-events:none}`}</style>
      <div style={{ maxWidth:560, margin:"0 auto", padding:"2rem 1.5rem", minHeight:"100vh" }}>

        {/* Breadcrumb + progress bar */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:"2.25rem" }}>
          <button onClick={onWelcome} style={{ fontSize:12, color:T.hint, padding:0, background:"none", border:"none", cursor:"pointer", fontFamily:T.font }}>Wandr</button>
          <div style={{ fontSize:12, color:T.border }}>/</div>
          <div style={{ flex:1, height:2, background:T.bg3, borderRadius:1 }}>
            <div style={{ width:`${pct}%`, height:"100%", background:T.accent, borderRadius:1, transition:"width .4s ease" }} />
          </div>
          <span style={{ fontSize:11, color:T.hint, minWidth:36, textAlign:"right" }}>{step+1} / {STEPS.length}</span>
        </div>

        <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          variants={STEP_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={STEP_TRANSITION}
        >

        <div style={{ fontSize:22, fontWeight:700, lineHeight:1.25, marginBottom:S.sub?6:"1.5rem", color:T.ink }}>{S.q}</div>
        {S.sub && <p style={{ fontSize:13, color:T.muted, marginBottom:"1.5rem", lineHeight:1.6 }}>{S.sub}</p>}

        {/* ── Text ── */}
        {S.type === "text" && (
          <input type="text" value={cur} onChange={e => setCur(e.target.value)}
            onKeyDown={e => e.key === "Enter" && isValid && onAdvance()} placeholder={S.ph} autoFocus style={inputSt} />
        )}

        {/* ── Logistics ── */}
        {S.type === "logistics" && (
          <div style={{ marginBottom:"1.25rem", display:"flex", flexDirection:"column", gap:18 }}>

            {/* Getting around */}
            <div>
              <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".12em", color:T.hint, marginBottom:8 }}>Getting around</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                {["Car", "Transit / Rideshare", "Walking / Cycling"].map(o => {
                  const sel = logTransport === o;
                  return (
                    <button key={o} className="wandr-chip" data-label={o} onClick={() => setLogTransport(p => p === o ? "" : o)}
                      style={{ padding:"7px 14px", fontSize:12.5, borderRadius:100, background:sel?"#2a1a12":T.bg2, border:sel?`1.5px solid ${T.accent}`:`1px solid ${T.border}`, color:sel?T.accent:T.muted, fontWeight:sel?700:400, cursor:"pointer", fontFamily:T.font, transition:"all .15s" }}>
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pace */}
            <div>
              <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".12em", color:T.hint, marginBottom:8 }}>Pace</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                {["Slow", "Balanced", "Fast"].map(o => {
                  const sel = logPace === o;
                  return (
                    <button key={o} className="wandr-chip" data-label={o} onClick={() => setLogPace(p => p === o ? "" : o)}
                      style={{ padding:"7px 14px", fontSize:12.5, borderRadius:100, background:sel?"#2a1a12":T.bg2, border:sel?`1.5px solid ${T.accent}`:`1px solid ${T.border}`, color:sel?T.accent:T.muted, fontWeight:sel?700:400, cursor:"pointer", fontFamily:T.font, transition:"all .15s" }}>
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Rhythm — when the day starts/ends (distinct from Pace = how much per day) */}
            <div>
              <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".12em", color:T.hint, marginBottom:8 }}>Rhythm</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                {["Early riser", "Flexible", "Night owl"].map(o => {
                  const sel = logRhythm === o;
                  return (
                    <button key={o} className="wandr-chip" data-label={o} onClick={() => setLogRhythm(p => p === o ? "" : o)}
                      style={{ padding:"7px 14px", fontSize:12.5, borderRadius:100, background:sel?"#2a1a12":T.bg2, border:sel?`1.5px solid ${T.accent}`:`1px solid ${T.border}`, color:sel?T.accent:T.muted, fontWeight:sel?700:400, cursor:"pointer", fontFamily:T.font, transition:"all .15s" }}>
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* What are you after? */}
            <div>
              <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".12em", color:T.hint, marginBottom:8 }}>What are you after?</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                {["Famous sights", "Hidden gems", "Mix of both"].map(o => {
                  const sel = logFocus === o;
                  return (
                    <button key={o} className="wandr-chip" data-label={o} onClick={() => setLogFocus(p => p === o ? "" : o)}
                      style={{ padding:"7px 14px", fontSize:12.5, borderRadius:100, background:sel?"#2a1a12":T.bg2, border:sel?`1.5px solid ${T.accent}`:`1px solid ${T.border}`, color:sel?T.accent:T.muted, fontWeight:sel?700:400, cursor:"pointer", fontFamily:T.font, transition:"all .15s" }}>
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Where are you staying — optional */}
            <div>
              <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".12em", color:T.hint, marginBottom:5 }}>
                Where are you staying? <span style={{ fontWeight:400, letterSpacing:"normal", textTransform:"none", color:T.hint, opacity:.6 }}>· optional</span>
              </div>
              <input type="text" value={logStay} onChange={e => setLogStay(e.target.value)}
                placeholder="Times Square · Downtown · West Village · Countryside"
                style={{...inputSt, marginBottom:0}} />
            </div>
          </div>
        )}

        {/* ── Textarea + file upload ── */}
        {S.type === "textarea+upload" && (
          <>
            <div style={{ position:"relative", marginBottom:"1.25rem" }}>
              <textarea value={cur} onChange={e => setCur(e.target.value)} placeholder={S.ph} rows={4}
                style={{...inputSt, marginBottom:0, lineHeight:1.7, resize:"none", paddingRight:48}} />
              <DictationButton value={cur} onChange={setCur} />
            </div>
            {S.id === "notes" && (
              <div style={{ marginTop:2, marginBottom:"1.25rem" }}>
                {/* Dedicated avoid field — fed to the AVOID prompt instruction as a hard exclusion */}
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:T.hint, textTransform:"uppercase", letterSpacing:".1em", marginBottom:8 }}>Anything to avoid?</div>
                  <div style={{ position:"relative" }}>
                    <input type="text" value={avoidText || ""} onChange={e => setAvoidText(e.target.value)}
                      placeholder="e.g. crowds · seafood · long hikes · touristy spots"
                      style={{...inputSt, paddingRight:40}} />
                    <DictationButton value={avoidText || ""} onChange={setAvoidText} style={INPUT_MIC} />
                  </div>
                  <div style={{ fontSize:11, color:T.hint, marginTop:6 }}>Hard no's — we'll keep these out of every suggestion.</div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Date range ── */}
        {S.type === "daterange" && (
          <DateRangePicker d1={d1} setD1={setD1} d2={d2} setD2={setD2} />
        )}

        {/* ── Chips only ── */}
        {S.type === "chips" && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:"1.25rem" }}>
            {S.opts.map(o => {
              const sel = chips.includes(o);
              return (
                <button key={o} className="wandr-chip" data-label={o} onClick={() => toggleChip(o)}
                  style={{ padding:"7px 14px", fontSize:12.5, borderRadius:100, background:sel?T.accent:T.bg2, border:sel?`1.5px solid ${T.accent}`:`1px solid ${T.border}`, color:sel?T.white:T.muted, fontWeight:sel?700:400, cursor:"pointer", fontFamily:T.font, transition:"all .15s" }}>
                  {o}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Chips + text (interests / party) ── */}
        {S.type === "chips+text" && (
          <div style={{ marginBottom:"1.25rem" }}>
            {/* Grouped chips (interests) — each group shows its curated default
                tags; "Show N more" reveals the rest, so ~60 tags across 9
                groups doesn't render as one overwhelming wall of chips. */}
            {S.groups ? (
              <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:10 }}>
                {S.groups.map(group => {
                  const isOpen  = expanded.has(group.label);
                  const count   = group.defaultCount ?? group.opts.length;
                  const visible = isOpen ? group.opts : group.opts.slice(0, count);
                  const hidden  = group.opts.length - count;
                  return (
                    <div key={group.label}>
                      <div style={{ fontSize:10, fontWeight:700, color:T.hint, textTransform:"uppercase", letterSpacing:".1em", marginBottom:6 }}>{group.label}</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
                        {visible.map(o => {
                          const sel  = chips.includes(o);
                          const prio = priorityChips.includes(o);
                          return (
                            <button key={o} className="wandr-chip" data-label={o}
                              onClick={() => {
                                const isSel = chips.includes(o);
                                setChips(p => isSel ? p.filter(x => x !== o) : [...p, o]);
                                if (isSel) setPriorityChips(pc => pc.filter(x => x !== o)); // deselect drops priority
                              }}
                              style={{ padding:"6px 13px", fontSize:12, borderRadius:100, background:sel?"#2a1a12":T.bg2, border:sel?`1.5px solid ${T.accent}`:`1px solid ${T.border}`, color:sel?T.accent:T.muted, fontWeight:sel?700:400, cursor:"pointer", fontFamily:T.font, transition:"all .15s" }}>
                              {o}
                              {sel && (
                                <span onClick={e => { e.stopPropagation(); setPriorityChips(pc => pc.includes(o) ? pc.filter(x => x !== o) : [...pc, o]); }}
                                  title={prio ? "Priority — wins scheduling conflicts" : "Mark as a priority"}
                                  style={{ marginLeft:5, fontSize:13, lineHeight:1, color:prio?T.accent:T.hint, cursor:"pointer" }}>
                                  {prio ? "★" : "☆"}
                                </span>
                              )}
                            </button>
                          );
                        })}
                        {hidden > 0 && (
                          <button onClick={() => setExpanded(p => {
                              const next = new Set(p);
                              next.has(group.label) ? next.delete(group.label) : next.add(group.label);
                              return next;
                            })}
                            style={{ padding:"6px 4px", fontSize:11.5, fontWeight:600, color:T.accent, background:"none", border:"none", cursor:"pointer", fontFamily:T.font }}>
                            {isOpen ? "Show less" : `Show ${hidden} more →`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Flat chips (party step) */
              <>
                <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:10 }}>
                  {S.opts.map(o => {
                    const sel = chips.includes(o);
                    return (
                      <button key={o} className="wandr-chip" data-label={o} onClick={() => toggleChip(o)}
                        style={{ padding:"7px 14px", fontSize:12.5, borderRadius:100, background:sel?T.accent:T.bg2, border:sel?`1.5px solid ${T.accent}`:`1px solid ${T.border}`, color:sel?T.white:T.muted, fontWeight:sel?700:400, cursor:"pointer", fontFamily:T.font, transition:"all .15s" }}>
                        {o}
                      </button>
                    );
                  })}
                </div>
                {/* Kids sub-question — shown when a group is selected (not Solo) */}
                {S.id === "party" && chips.length > 0 && !chips.includes("Solo") && (
                  <div style={{ marginBottom:10, padding:"12px 14px", background:T.bg2, borderRadius:10, border:`1px solid ${T.border}` }}>
                    <div style={{ fontSize:12, fontWeight:700, color:T.muted, marginBottom:8 }}>Any kids?</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {["No kids", "Under 5", "5 to 12", "Teens"].map(o => {
                        const sel = kids === o;
                        return (
                          <button key={o} className="wandr-chip" data-label={o} onClick={() => setKids(k => k === o ? "" : o)}
                            style={{ padding:"6px 12px", fontSize:12, borderRadius:100, background:sel?"#2a1a12":T.bg3, border:sel?`1.5px solid ${T.accent}`:`1px solid ${T.border}`, color:sel?T.accent:T.muted, fontWeight:sel?700:400, cursor:"pointer", fontFamily:T.font, transition:"all .15s" }}>
                            {o}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
            <div style={{ position:"relative" }}>
              <input type="text" value={cur} onChange={e => setCur(e.target.value)}
                placeholder={S.ph}
                style={{...inputSt, marginBottom:0, fontSize:12.5, paddingRight:40}} />
              <DictationButton value={cur} onChange={setCur} style={INPUT_MIC} />
            </div>
            {S.id === "interests" && chips.length > 0 && (
              <div style={{ marginTop:8 }}>
                <span style={{ fontSize:11, color:T.accent }}>{chips.length} interest{chips.length !== 1 ? "s" : ""} selected</span>
                <span style={{ fontSize:11, color:T.hint, marginLeft:8 }}>
                  · tap ☆ to prioritize{priorityChips.length > 0 ? ` (★ ${priorityChips.length})` : ""}
                </span>
              </div>
            )}
            {/* Favorite-team picker — appears only when baseball is an interest (§7).
                We flag your team's games at any destination, home or away. */}
            {S.id === "interests" && chips.some(c => BASEBALL_TAGS.includes(c)) && (
              <div style={{ marginTop:12, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <span style={{ fontSize:12, color:T.ink }}>⚾ Favorite team?</span>
                <select value={teams[0] || ""} onChange={e => setTeams(e.target.value ? [e.target.value] : [])}
                  style={{ flex:"1 1 180px", minWidth:0, padding:"7px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg3, color:teams[0] ? T.ink : T.hint, outline:"none", fontSize:12.5, fontFamily:T.font, colorScheme:"dark" }}>
                  <option value="">No favorite (just love the game)</option>
                  {TEAM_OPTIONS.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {/* ── Budget ── */}
        {S.type === "budget" && (
          <div style={{ marginBottom:"1.25rem" }}>
            <BudgetTiers value={budget} onChange={setBudget} />
          </div>
        )}

        </motion.div>
        </AnimatePresence>

        {/* ── Navigation ── */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:".5rem" }}>
          <button onClick={step > 0 ? onBack : onWelcome} style={{ fontSize:12.5, color:T.hint, padding:"8px 0", background:"none", border:"none", cursor:"pointer", fontFamily:T.font }}>← Back</button>
          <button onClick={onAdvance} disabled={!isValid}
            style={{ background:isValid?T.accent:T.bg3, color:isValid?T.white:T.hint, padding:"10px 26px", borderRadius:8, fontSize:13, fontWeight:700, cursor:isValid?"pointer":"default", border:"none", fontFamily:T.font, transition:"all .15s" }}>
            {step === STEPS.length - 1 ? "Build my trip →" : "Continue →"}
          </button>
        </div>
        {S.id === "notes" && (
          <p style={{ fontSize:11, color:T.hint, textAlign:"center", marginTop:12 }}>Optional — tap Continue to skip</p>
        )}

      </div>
    </div>
  );
}
