import { useState, useRef, useEffect } from "react";
import { stream, consumeStream, complete } from "../lib/api.js";
import { buildPlanPrompt, buildEditDayPrompt, buildRightNowPrompt, buildTweakActivityPrompt } from "../lib/prompts.js";
import { spliceDayInPlan, resequenceTimes, bucketOf, retimeIntoBucket, sortDayByTime, matchTipToActivity, pruneOrphanTips } from "../lib/utils.js";
import { parsePlan, serializePlan } from "../lib/planModel.js";
import { planKeyFor, deletePlan, mirrorLegacyPlan } from "../lib/tripStore.js";
import { scheduleSyncPush } from "../lib/sync.js";

export function useGenerate() {
  const [planText, setPlanText]       = useState("");
  const [planModel, setPlanModel]     = useState(null); // structured, editable plan (null until a generation completes)
  const [planMode, setPlanMode]       = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [patchError, setPatchError]   = useState("");
  const [tweakingId, setTweakingId]   = useState(null); // id of the activity currently being AI-tweaked
  const [reworkUndo, setReworkUndo]   = useState(null); // { prevText, at } — held after a Right Now rework for the Undo toast
  const [generatedAt, setGeneratedAt] = useState(null); // epoch ms of the last AI (re)generation — manual edits don't bump it
  const streamRef  = useRef("");
  const modelRef   = useRef(null); // mirrors planModel — avoids stale closures in edit handlers
  const abortRef   = useRef(null);
  // Which trip the in-memory plan belongs to. A ref, not state, because the
  // persistence effect below must read the CURRENT owner at write time — a
  // value captured in a render closure could write trip A's plan under trip B's
  // key after a switch. Set by generate/patchDay (from the trip they receive)
  // and by restorePlan/clearSavedPlan (explicitly).
  const planOwnerRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Persist the completed/edited plan so a reload (or Resume) keeps it.
  // Guarded on planModel (null while streaming) so we never write mid-stream;
  // fires once on completion and again on every edit. Bails without an owner
  // so an orphan plan can never be written under a wrong or missing id.
  useEffect(() => {
    if (!planOwnerRef.current || !planModel || !planText || planLoading) return;
    const payload = JSON.stringify({ planText, planMode, generatedAt });
    try { localStorage.setItem(planKeyFor(planOwnerRef.current), payload); } catch { /* quota — ignore */ }
    mirrorLegacyPlan(payload); // rollback path — see tripStore.js
    scheduleSyncPush();        // no-op unless signed in
  }, [planModel, planText, planMode, planLoading, generatedAt]);

  // Adopt a freshly-built plan string as the editable model (and keep planText
  // in sync). Used after generation completes and after an AI day-patch.
  function adoptPlan(text) {
    const model = parsePlan(text);
    modelRef.current = model;
    setPlanModel(model);
  }

  // Commit an edited model: model is the source of truth, planText is
  // re-serialized so copy / PDF export / EditTripSheet all stay consistent.
  function commitModel(next) {
    modelRef.current = next;
    setPlanModel(next);
    const md = serializePlan(next);
    streamRef.current = md;
    setPlanText(md);
  }

  /** Inline-edit one activity's fields (time / title / details). */
  function editActivity(dayIdx, actId, patch) {
    const prev = modelRef.current;
    if (!prev) return;
    const before = prev.days[dayIdx]?.activities.find(a => a.id === actId);
    const renamed = before && patch.title !== undefined && patch.title !== before.title;
    commitModel({
      ...prev,
      days: prev.days.map((d, i) => {
        if (i !== dayIdx) return d;
        const activities = d.activities.map(act => act.id === actId ? { ...act, ...patch } : act);
        // Tips follow their card: a rename strands the old venue's tip unless
        // it still matches (typo fixes keep theirs — see pruneOrphanTips).
        return { ...d, activities, tips: renamed ? pruneOrphanTips(d.tips, before.title, activities.map(a => a.title)) : d.tips };
      }),
    });
  }

  /** Remove one activity from a day (its pinned tips leave with it). */
  function removeActivity(dayIdx, actId) {
    const prev = modelRef.current;
    if (!prev) return;
    const gone = prev.days[dayIdx]?.activities.find(a => a.id === actId);
    commitModel({
      ...prev,
      days: prev.days.map((d, i) => {
        if (i !== dayIdx) return d;
        const activities = d.activities.filter(act => act.id !== actId);
        return { ...d, activities, tips: gone ? pruneOrphanTips(d.tips, gone.title, activities.map(a => a.title)) : d.tips };
      }),
    });
  }

  /**
   * Replace a day's activity order (from a within-day drag reorder).
   * Re-times the day so clock times stay ascending after the move (§6 #4).
   */
  function reorderDayActivities(dayIdx, newActivities) {
    const prev = modelRef.current;
    if (!prev) return;
    const resequenced = resequenceTimes(newActivities);
    commitModel({
      ...prev,
      days: prev.days.map((d, i) => i !== dayIdx ? d : { ...d, activities: resequenced }),
    });
  }

  /**
   * AI-tweak one activity in place: a scoped complete() call that replaces just
   * this activity's fields (id and position preserved). trip provides context.
   */
  async function tweakActivity(dayIdx, actId, instruction, trip) {
    if (tweakingId) return;
    const prev = modelRef.current;
    const act = prev?.days[dayIdx]?.activities.find(a => a.id === actId);
    if (!act) return;

    setTweakingId(actId);
    setPatchError("");
    const controller = new AbortController();
    try {
      const prompt = buildTweakActivityPrompt(trip, prev.days[dayIdx].label, act, instruction);
      const data = await complete([{ role: "user", content: prompt }], 1000, controller.signal);
      const raw  = data.content?.find(b => b.type === "text")?.text || "";
      // Reuse the tested parser by wrapping the row in a throwaway day header.
      const parsed = parsePlan(`## Day 1 — tweak\n\n${raw}`);
      const fresh  = parsed.days[0]?.activities[0];
      if (!fresh) throw new Error("Couldn't read the AI's update. Please try again.");

      // Replace by id wherever it now lives (it may have been moved meanwhile).
      const cur = modelRef.current;
      commitModel({
        ...cur,
        days: cur.days.map(d => {
          if (!d.activities.some(a => a.id === actId)) return d;
          const activities = d.activities.map(a => a.id === actId
            ? { ...a, time: fresh.time, title: fresh.title, details: fresh.details }
            : a);
          // Tips follow their card: the outgoing venue's tip must not survive
          // as a stranded "Before you go" line (2026-08-11 Flagstaff report).
          return { ...d, activities, tips: pruneOrphanTips(d.tips, act.title, activities.map(a => a.title)) };
        }),
      });
    } catch (e) {
      if (e?.name === "AbortError") return;
      const msg = e.message || "";
      const isNet = /failed to fetch|network|load failed/i.test(msg);
      setPatchError(isNet ? "Couldn't reach the server. Please try again." : (msg || "Couldn't update that activity. Please try again."));
    } finally {
      setTweakingId(null);
    }
  }

  /**
   * Move one activity from one day to the end of another.
   * Re-times the destination day so the moved activity slots into the day's
   * own time range instead of keeping its origin-day time (§6 #4).
   */
  function moveActivity(fromDayIdx, actId, toDayIdx) {
    const prev = modelRef.current;
    if (!prev || fromDayIdx === toDayIdx) return;
    const act = prev.days[fromDayIdx]?.activities.find(a => a.id === actId);
    if (!act) return;
    // Tips follow their card across days: a tip pinned to the moved venue
    // (and to no venue staying behind) travels with it instead of stranding
    // in the origin day's "Before you go".
    const remainTitles = prev.days[fromDayIdx].activities.filter(a => a.id !== actId).map(a => a.title);
    const traveling = (prev.days[fromDayIdx].tips || []).filter(tip =>
      matchTipToActivity(tip, [act.title]) >= 0 && matchTipToActivity(tip, remainTitles) < 0);
    commitModel({
      ...prev,
      days: prev.days.map((d, i) => {
        if (i === fromDayIdx) return { ...d, activities: d.activities.filter(a => a.id !== actId), tips: (d.tips || []).filter(t => !traveling.includes(t)) };
        if (i === toDayIdx)   return { ...d, activities: resequenceTimes([...d.activities, act]), tips: [...(d.tips || []), ...traveling] };
        return d;
      }),
    });
  }

  /**
   * Move an activity into a different time-of-day bucket (Buckets view, §6 #5).
   * Re-times it into the target bucket's range, then re-sorts the day so the
   * Timeline view stays consistent. No-op if it's already in that bucket.
   */
  function moveActivityToBucket(dayIdx, actId, bucket) {
    const prev = modelRef.current;
    if (!prev) return;
    const day = prev.days[dayIdx];
    const act = day?.activities.find(a => a.id === actId);
    if (!act || bucketOf(act.time) === bucket) return;
    const targetMembers = day.activities.filter(a => a.id !== actId && bucketOf(a.time) === bucket);
    const newTime = retimeIntoBucket(bucket, targetMembers);
    const updated = day.activities.map(a => a.id === actId ? { ...a, time: newTime } : a);
    commitModel({
      ...prev,
      days: prev.days.map((d, i) => i !== dayIdx ? d : { ...d, activities: sortDayByTime(updated) }),
    });
  }

  /**
   * Generate (or re-generate) a plan in the given mode.
   * editInstruction — optional free-text instruction for Full Itinerary / Specific Activities edits.
   * editType        — "activities" | null — controls prompt framing.
   * events          — verified local events (useLocalEvents().forPrompt); omitted
   *                   or unresolved means the prompt simply carries no events block.
   */
  async function generate(mode, trip, editInstruction = null, editType = null, events = null) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    planOwnerRef.current = trip?.id || null; // this plan belongs to this trip
    setPlanMode(mode);
    setPlanLoading(true);
    setPlanText("");
    setPlanModel(null);
    modelRef.current = null;
    setPatchError("");
    streamRef.current = "";

    const prompt = buildPlanPrompt(mode, trip, editInstruction, editType, events);

    try {
      const res = await stream([{ role: "user", content: prompt }], 8000, controller.signal);
      await consumeStream(res, chunk => {
        streamRef.current += chunk;
        setPlanText(streamRef.current);
      }, controller.signal);
      // Parse the completed plan into the editable model (skip if aborted).
      if (!controller.signal.aborted) {
        adoptPlan(streamRef.current);
        setGeneratedAt(Date.now());
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
      // Sanitise: never show raw browser network errors (e.g. "Failed to fetch") to the user
      const msg = e.message || "";
      const isBrowserNetworkError = /failed to fetch|network|load failed/i.test(msg);
      setPlanText(
        isBrowserNetworkError
          ? "Couldn't connect to the server. Please check it's running and try again."
          : msg || "Something went wrong generating your plan. Please try again."
      );
    } finally {
      if (!controller.signal.aborted) setPlanLoading(false);
    }
  }

  /**
   * Shared single-day patch plumbing: extract the day block, ask the AI for a
   * replacement via buildPrompt(dayContent), splice it back in. Used by
   * patchDay (Edit Trip → Specific Day) and reworkDay (Right Now mode) — ONE
   * implementation so the two paths can never drift.
   *
   * captureUndo — Right Now commits instantly (design pick 3A); the pre-patch
   * planText is kept so the Undo toast can restore it.
   */
  async function runDayPatch(dayIndex, buildPrompt, trip, { captureUndo = false } = {}) {
    if (planLoading) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    planOwnerRef.current = trip?.id || planOwnerRef.current;
    setPlanLoading(true);
    setPatchError("");

    // Extract the current day block from planText
    const currentPlan = planText;
    const re = /^## Day \d+ —/gm;
    const positions = [];
    let m;
    while ((m = re.exec(currentPlan)) !== null) positions.push(m.index);
    const start = positions[dayIndex] ?? 0;
    const end   = dayIndex + 1 < positions.length ? positions[dayIndex + 1] : currentPlan.length;
    const dayContent = currentPlan.slice(start, end).trim();

    const prompt = buildPrompt(dayContent);

    try {
      const data = await complete([{ role: "user", content: prompt }], 3000, controller.signal);
      const raw  = data.content?.find(b => b.type === "text")?.text || "";
      if (!raw) throw new Error("No response from AI. Please try again.");
      const newPlan = spliceDayInPlan(currentPlan, dayIndex, raw);
      if (captureUndo) setReworkUndo({ prevText: currentPlan, at: Date.now() });
      setPlanText(newPlan);
      streamRef.current = newPlan;
      adoptPlan(newPlan); // keep the editable model in sync after an AI day-patch
      setGeneratedAt(Date.now());
      return true;
    } catch (e) {
      if (e?.name === "AbortError") return false;
      const msg = e.message || "";
      const isBrowserNetworkError = /failed to fetch|network|load failed/i.test(msg);
      // Don't overwrite existing planText — show error separately
      setPatchError(
        isBrowserNetworkError
          ? "Couldn't reach the server. Please check it's running and try again."
          : msg || "Something went wrong updating the day. Please try again."
      );
      return false;
    } finally {
      if (!controller.signal.aborted) setPlanLoading(false);
    }
  }

  /**
   * Patch a single day in the current plan using complete() (non-streaming).
   * dayIndex — 0-based (0 = Day 1) · dayLabel — full label string ·
   * instruction — user's change instruction (empty means "refresh").
   */
  async function patchDay(dayIndex, dayLabel, instruction, trip) {
    return runDayPatch(dayIndex, dayContent => buildEditDayPrompt(dayLabel, dayContent, instruction, trip), trip);
  }

  /**
   * Right Now mode (picks 1A+2A+3A): rework the REST of today from fromTime,
   * committing instantly with the previous day held for Undo.
   * opts — { fromTime, reasons: ["raining", ...], note }
   */
  async function reworkDay(dayIndex, dayLabel, opts, trip) {
    return runDayPatch(dayIndex, dayContent => buildRightNowPrompt(dayLabel, dayContent, opts, trip), trip, { captureUndo: true });
  }

  /** Restore the plan as it was before the last Right Now rework. */
  function undoRework() {
    const prev = reworkUndo?.prevText;
    if (!prev) return;
    streamRef.current = prev;
    setPlanText(prev);
    adoptPlan(prev);
    setReworkUndo(null);
  }

  function resetPlan() {
    abortRef.current?.abort();
    abortRef.current = null;
    setPlanText("");
    setPlanModel(null);
    modelRef.current = null;
    setPlanMode(null);
    setPlanLoading(false);
    setPatchError("");
    setGeneratedAt(null);
    setReworkUndo(null); // an undo must never resurrect a different trip's plan
    streamRef.current = "";
  }

  /**
   * Restore a previously-saved plan (from localStorage) into state.
   * Re-parses planText into the model so the editable view is consistent.
   * Returns true if a plan was restored.
   */
  function restorePlan(tripId) {
    // Abort explicitly, not via resetPlan's side effect: switching trips while
    // a generation is streaming MUST cancel it. Otherwise that response lands
    // after the owner has changed and writes the previous trip's itinerary under
    // this trip. Stated here so a future refactor of resetPlan can't silently
    // remove the guarantee.
    abortRef.current?.abort();
    // Claim ownership first, then load — so a trip with no saved plan still
    // resets cleanly instead of leaving the previous trip's plan on screen.
    planOwnerRef.current = tripId || null;
    resetPlan();
    if (!tripId) return false;
    let saved;
    try { saved = JSON.parse(localStorage.getItem(planKeyFor(tripId)) || "null"); } catch { saved = null; }
    if (!saved?.planText) return false;
    streamRef.current = saved.planText;
    setPlanText(saved.planText);
    setPlanMode(saved.planMode || null);
    setGeneratedAt(typeof saved.generatedAt === "number" ? saved.generatedAt : null); // legacy plans predate the field
    adoptPlan(saved.planText);
    return true;
  }

  /**
   * Clear a trip's saved plan and reset in-memory state (rebuild / reset).
   * Pass the trip id to delete that trip's plan; omit it to only reset memory.
   */
  function clearSavedPlan(tripId) {
    if (tripId) deletePlan(tripId);
    planOwnerRef.current = null;
    resetPlan();
  }

  return { planText, planModel, planMode, planLoading, patchError, tweakingId, generatedAt, reworkUndo, generate, patchDay, reworkDay, undoRework, resetPlan, restorePlan, clearSavedPlan, editActivity, removeActivity, reorderDayActivities, moveActivity, moveActivityToBucket, tweakActivity };
}
