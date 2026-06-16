/**
 * InterviewFlow — the 6-step trip interview screen.
 *
 * Receives all form state and handlers from App.jsx via props.
 * Owns no state of its own — purely presentational.
 */
import { AnimatePresence, motion } from "framer-motion";
import { STEPS, T } from "../lib/constants.js";
import DateRangePicker from "./DateRangePicker.jsx";

const inputSt = {
  width:"100%", padding:"10px 14px", border:`1px solid ${T.border}`, borderRadius:8,
  background:T.bg3, color:T.ink, outline:"none", fontSize:13.5, fontFamily:T.font,
  marginBottom:"1.25rem", colorScheme:"dark", boxSizing:"border-box",
};

const AVOID_OPTS = {
  "Food & Drink":      ["Tourist trap restaurants","Skip fine dining"],
  "Outdoors & Active": ["Skip beaches","Skip strenuous hikes"],
  "Culture & Arts":    ["Skip museums","Skip guided tours"],
  "Local Life":        ["Skip nightlife","Skip shopping"],
  "Sports & Events":   ["Skip live sports"],
};

const UNIVERSAL_AVOIDS = [
  "Crowded tourist spots","Anything early morning","Religious sites","Extreme sports","Shopping malls",
];

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
  avoidMode, setAvoidMode,
  avoidChips, setAvoidChips,
  budget, setBudget,
  d1, setD1, d2, setD2,
  logStay, setLogStay,
  logTransChips, setLogTransChips,
  logTransText, setLogTransText,
  uploadedFiles, uploadError, fileInputRef,
  handleFiles, removeFile,
  isValid,
}) {
  const S   = STEPS[step];
  const pct = Math.round((step / STEPS.length) * 100);

  function toggleChip(o) {
    if (S.singleSelect) {
      setChips(p => p.includes(o) ? [] : [o]);
    } else {
      setChips(p => p.includes(o) ? p.filter(x => x !== o) : [...p, o]);
    }
  }

  return (
    <div style={{ minHeight:"100vh", width:"100%", background:T.bg0, fontFamily:T.font }}>
      <style>{`html,body,#root{background:${T.bg0}!important;margin:0;padding:0;min-height:100vh;width:100%} *{box-sizing:border-box}`}</style>
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

        <div style={{ fontSize:22, fontWeight:700, lineHeight:1.25, marginBottom:6, color:T.ink }}>{S.q}</div>
        <p style={{ fontSize:13, color:T.muted, marginBottom:"1.5rem", lineHeight:1.6 }}>{S.sub}</p>

        {/* ── Text ── */}
        {S.type === "text" && (
          <input type="text" value={cur} onChange={e => setCur(e.target.value)}
            onKeyDown={e => e.key === "Enter" && isValid && onAdvance()} placeholder={S.ph} autoFocus style={inputSt} />
        )}

        {/* ── Logistics ── */}
        {S.type === "logistics" && (
          <div style={{ marginBottom:"1.25rem" }}>
            <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".12em", color:T.hint, marginBottom:5 }}>Where are you staying?</div>
            <input type="text" value={logStay} onChange={e => setLogStay(e.target.value)}
              placeholder="Airbnb in Trastevere · Hotel near city centre · Staying with family in Shinjuku"
              style={{...inputSt, marginBottom:12}} />
            <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".12em", color:T.hint, marginBottom:8 }}>How are you getting around?</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:8 }}>
              {[
                ["Own / rented car", ["I have my own vehicle","Renting a car"]],
                ["Rideshare / taxi",  ["Rideshare / taxi app"]],
                ["Public transit",    ["Public transit"]],
                ["Walk / cycle",      ["Walking mostly","Cycling"]],
                ["Scooter / moto",    ["Scooter / moto"]],
                ["Borrowed car",      ["Using a family / friend's car"]],
              ].map(([label, vals]) => {
                const sel = vals.some(v => logTransChips.includes(v));
                return (
                  <button key={label} onClick={() => {
                    setLogTransChips(p => {
                      const hasAny = vals.some(v => p.includes(v));
                      return hasAny ? p.filter(x => !vals.includes(x)) : [...p, ...vals.filter(v => !p.includes(v))];
                    });
                  }} style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 11px", borderRadius:9, background:sel?"#2a1a12":T.bg2, border:sel?`1.5px solid ${T.accent}`:`1px solid ${T.border}`, color:sel?T.accent:T.muted, fontWeight:sel?700:400, cursor:"pointer", fontFamily:T.font, fontSize:12, transition:"all .15s", textAlign:"left" }}>
                    {label}
                  </button>
                );
              })}
            </div>
            <input type="text" value={logTransText} onChange={e => setLogTransText(e.target.value)}
              placeholder="e.g. Borrowing a family car, also plan to use rideshare at night"
              style={{...inputSt, marginBottom:0, fontSize:12.5}} />
          </div>
        )}

        {/* ── Textarea + file upload ── */}
        {S.type === "textarea+upload" && (
          <>
            <textarea value={cur} onChange={e => setCur(e.target.value)} placeholder={S.ph} rows={4}
              style={{...inputSt, lineHeight:1.7, resize:"vertical"}} />
            {S.id === "notes" && (
              <div style={{ marginTop:2, marginBottom:"1.25rem" }}>
                <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.txt,.csv,.json"
                  style={{ display:"none" }} onChange={e => handleFiles(e.target.files)} />
                {uploadedFiles.length === 0 ? (
                  <button onClick={() => fileInputRef.current?.click()}
                    style={{ display:"flex", alignItems:"center", gap:7, padding:"7px 12px", fontSize:12, color:T.hint, background:"transparent", border:`1px dashed ${T.border}`, borderRadius:8, cursor:"pointer", fontFamily:T.font }}>
                    Attach files (itinerary, bookings, photos)
                  </button>
                ) : (
                  <div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:6 }}>
                      {uploadedFiles.map((f, i) => (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:8, background:T.bg3, border:`1px solid ${T.border}`, borderRadius:8, padding:"7px 10px" }}>
                          {f.isImage && f.preview
                            ? <img src={f.preview} alt={f.name} style={{ width:32, height:32, borderRadius:4, objectFit:"cover", flexShrink:0 }} />
                            : <span style={{ fontSize:11, color:T.hint, flexShrink:0, fontWeight:700, letterSpacing:".05em" }}>{f.name.endsWith(".pdf")?"PDF":f.name.endsWith(".csv")?"CSV":"TXT"}</span>
                          }
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:600, color:T.ink, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</div>
                            <div style={{ fontSize:10, color:T.hint }}>{f.size}</div>
                          </div>
                          <button onClick={() => removeFile(i)} style={{ fontSize:13, color:T.hint, background:"none", border:"none", cursor:"pointer", padding:"2px 6px" }}>✕</button>
                        </div>
                      ))}
                    </div>
                    {uploadedFiles.length < 5 && (
                      <button onClick={() => fileInputRef.current?.click()}
                        style={{ fontSize:11, color:T.hint, background:"transparent", border:"none", cursor:"pointer", fontFamily:T.font, padding:0 }}>
                        + Add another file
                      </button>
                    )}
                  </div>
                )}
                {uploadError && (
                  <div style={{ fontSize:11, color:"#f08070", marginTop:6, padding:"5px 8px", background:"rgba(200,80,60,.1)", borderRadius:5 }}>{uploadError}</div>
                )}
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
                <button key={o} onClick={() => toggleChip(o)}
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
            {/* Love / Skip toggle — interests step only */}
            {S.id === "interests" && (
              <div style={{ display:"flex", background:T.bg2, borderRadius:8, padding:3, marginBottom:14, border:`1px solid ${T.border}` }}>
                {[["What I love", false], ["What to skip", true]].map(([label, mode]) => (
                  <button key={label} onClick={() => setAvoidMode(mode)}
                    style={{ flex:1, padding:"7px 0", fontSize:12, fontWeight:700, borderRadius:6, background:avoidMode===mode?T.bg3:"transparent", color:avoidMode===mode?T.ink:T.hint, border:avoidMode===mode?`1px solid ${T.border}`:"1px solid transparent", cursor:"pointer", fontFamily:T.font, transition:"all .15s" }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {/* Grouped chips (interests) */}
            {S.groups ? (
              <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:10 }}>
                {S.groups.map(group => {
                  const opts         = avoidMode ? (AVOID_OPTS[group.label] || []) : group.opts;
                  const extraAvoids  = avoidMode && group.label === "Food & Drink" ? UNIVERSAL_AVOIDS : [];
                  const allOpts      = [...opts, ...extraAvoids];
                  if (allOpts.length === 0) return null;
                  return (
                    <div key={group.label}>
                      <div style={{ fontSize:10, fontWeight:700, color:T.hint, textTransform:"uppercase", letterSpacing:".1em", marginBottom:6 }}>{group.label}</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                        {allOpts.map(o => {
                          const activeList = avoidMode ? avoidChips : chips;
                          const setActive  = avoidMode ? setAvoidChips : setChips;
                          const sel        = activeList.includes(o);
                          const selColor   = avoidMode ? "#e07070" : T.accent;
                          const selBg      = avoidMode ? "#251515" : "#2a1a12";
                          const selBdr     = avoidMode ? "#602020" : T.accent;
                          return (
                            <button key={o} onClick={() => setActive(p => p.includes(o) ? p.filter(x => x !== o) : [...p, o])}
                              style={{ padding:"6px 13px", fontSize:12, borderRadius:100, background:sel?selBg:T.bg2, border:sel?`1.5px solid ${selBdr}`:`1px solid ${T.border}`, color:sel?selColor:T.muted, fontWeight:sel?700:400, cursor:"pointer", fontFamily:T.font, transition:"all .15s" }}>
                              {o}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Flat chips (party step) */
              <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:10 }}>
                {S.opts.map(o => {
                  const sel = chips.includes(o);
                  return (
                    <button key={o} onClick={() => toggleChip(o)}
                      style={{ padding:"7px 14px", fontSize:12.5, borderRadius:100, background:sel?T.accent:T.bg2, border:sel?`1.5px solid ${T.accent}`:`1px solid ${T.border}`, color:sel?T.white:T.muted, fontWeight:sel?700:400, cursor:"pointer", fontFamily:T.font, transition:"all .15s" }}>
                      {o}
                    </button>
                  );
                })}
              </div>
            )}
            <input type="text" value={cur} onChange={e => setCur(e.target.value)}
              placeholder={avoidMode && S.id === "interests" ? "e.g. No early museums, skip beach clubs" : S.ph}
              style={{...inputSt, marginBottom:0, fontSize:12.5}} />
            {S.id === "interests" && (chips.length > 0 || avoidChips.length > 0) && (
              <div style={{ display:"flex", gap:10, marginTop:8 }}>
                {chips.length > 0      && <span style={{ fontSize:11, color:T.accent }}>{chips.length} interests</span>}
                {avoidChips.length > 0 && <span style={{ fontSize:11, color:"#e07070" }}>{avoidChips.length} to skip</span>}
              </div>
            )}
          </div>
        )}

        {/* ── Budget ── */}
        {S.type === "budget" && (
          <div style={{ marginBottom:"1.25rem" }}>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {[
                [50,  "$",    "Budget",    "Hostels, street food, local transport"],
                [120, "$$",   "Mid-range", "3-star hotels, sit-down restaurants"],
                [250, "$$$",  "Upper",     "Boutique stays, fine dining"],
                [450, "$$$$", "Luxury",    "5-star, private experiences"],
                [0,   "~",    "Hosted",    "Staying with family or friends"],
              ].map(([v, tier, label, desc]) => {
                const sel = budget === v;
                return (
                  <button key={v} onClick={() => setBudget(v)}
                    style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 14px", borderRadius:10, background:sel?"#2a1a12":T.bg1, border:sel?`1.5px solid ${T.accent}`:`1px solid ${T.border}`, cursor:"pointer", fontFamily:T.font, textAlign:"left", transition:"all .15s" }}>
                    <div style={{ fontSize:12, fontWeight:800, color:sel?T.accent:T.hint, letterSpacing:"-.01em", width:32, textAlign:"center", flexShrink:0 }}>{tier}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:sel?T.accent:T.ink, marginBottom:1 }}>{label}{v > 0 ? ` · ~$${v}/day` : ""}</div>
                      <div style={{ fontSize:11.5, color:sel?"#a06040":T.hint }}>{desc}</div>
                    </div>
                    {sel && <span style={{ fontSize:14, color:T.accent }}>✓</span>}
                  </button>
                );
              })}
            </div>
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
        {(S.id === "avoid" || S.id === "notes") && (
          <p style={{ fontSize:11, color:T.hint, textAlign:"center", marginTop:12 }}>Optional — tap Continue to skip</p>
        )}

      </div>
    </div>
  );
}
