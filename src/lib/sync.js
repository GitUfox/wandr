/**
 * Account sync — Supabase mirror of the local trip store + traveler profile.
 *
 * Contract, in order of importance:
 *   1. FAIL SOFT. Signed out, unconfigured, offline, or erroring ⇒ the app is
 *      exactly the local-only app. No sync path may ever throw into the UI.
 *   2. LOCAL EVICTION NEVER DELETES REMOTE. tripStore's MAX_TRIPS eviction is a
 *      device-cache concern; the server is the superset. Only an explicit user
 *      delete (recordDeletion → tombstone) removes a server row. This holds
 *      structurally: tombstones are recorded ONLY in the delete handler.
 *   3. LAST WRITE WINS per trip, judged on the client's own savedAt stamp —
 *      the same field the store has carried since the v2 migration (it was
 *      designed for this moment).
 *   4. Deletions survive offline via tombstones (wandr_tombstones). Without
 *      them, a trip deleted offline would resurrect on the next pull — the
 *      classic sync bug, and exactly the silent-wrongness this app hunts.
 *      A tombstone loses only to a remote copy saved AFTER the deletion
 *      (the trip was genuinely re-saved on another device).
 *
 * The pure merge core (mergeTrips/pickProfile) is exported for tests and does
 * no I/O; everything storage- and network-facing wraps it.
 */

import { getSupabase, accountsConfigured } from "./supabaseClient.js";
import { loadTripStore, saveTripStore, planKeyFor } from "./tripStore.js";

const TOMBSTONE_KEY = "wandr_tombstones";
const PROFILE_KEY   = "wandr_profile";
const PUSH_DEBOUNCE_MS = 2500;

// ── Pure merge core ───────────────────────────────────────────────────────────

const ts = (v) => {
  const n = Date.parse(v || "");
  return Number.isFinite(n) ? n : 0;
};

/**
 * Merge local trips against remote rows under tombstones.
 * remoteRows: [{ id, data, plan, saved_at }] · tombstones: [{ id, at }]
 * Returns:
 *   merged        — the new local trip list (plans attached as _plan)
 *   pushIds       — local ids the server is missing or behind on
 *   deleteRemote  — tombstoned ids to delete server-side
 *   clearTombs    — tombstone ids resolved either way (applied or outlived)
 */
export function mergeTrips(localTrips, remoteRows, tombstones) {
  const local  = new Map((localTrips || []).map(t => [t.id, t]));
  const remote = new Map((remoteRows || []).map(r => [r.id, r]));
  const tombs  = new Map((tombstones || []).map(t => [t.id, t]));

  const merged = [], pushIds = [], deleteRemote = [], clearTombs = [];

  for (const [id, tomb] of tombs) {
    const r = remote.get(id);
    if (r && ts(r.saved_at) > ts(tomb.at)) {
      // Re-saved elsewhere after the local delete — the newer save wins and
      // the tombstone is spent. The row flows back in via the remote loop.
      clearTombs.push(id);
    } else {
      // Deletion wins: drop any remote copy, never re-adopt locally.
      if (r) deleteRemote.push(id);
      else clearTombs.push(id); // nothing to delete — tombstone already moot
      remote.delete(id);
      local.delete(id);
    }
  }

  for (const [id, t] of local) {
    const r = remote.get(id);
    if (!r) { merged.push(t); pushIds.push(id); continue; }
    if (ts(t.savedAt) >= ts(r.saved_at)) {
      merged.push(t);
      if (ts(t.savedAt) > ts(r.saved_at)) pushIds.push(id);
    } else {
      merged.push({ ...r.data, id, savedAt: r.saved_at, _plan: r.plan || null });
    }
    remote.delete(id);
  }

  // Remote-only trips — new devices inherit the account's library.
  for (const [id, r] of remote) {
    merged.push({ ...r.data, id, savedAt: r.saved_at, _plan: r.plan || null });
  }

  merged.sort((a, b) => ts(a.savedAt) - ts(b.savedAt)); // store is oldest-first
  return { merged, pushIds, deleteRemote, clearTombs };
}

/** LWW for the single profile snapshot (both carry their own savedAt). */
export function pickProfile(localProfile, remoteData) {
  if (!localProfile) return { winner: remoteData || null, push: false };
  if (!remoteData)   return { winner: localProfile, push: true };
  return ts(localProfile.savedAt) >= ts(remoteData.savedAt)
    ? { winner: localProfile, push: ts(localProfile.savedAt) > ts(remoteData.savedAt) }
    : { winner: remoteData, push: false };
}

// ── Tombstones ────────────────────────────────────────────────────────────────

function loadTombstones() {
  try { return JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || "[]") || []; }
  catch { return []; }
}

function saveTombstones(list) {
  try { localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

/** Call from the delete handler — the ONLY writer of tombstones (contract #2). */
export function recordDeletion(tripId) {
  if (!accountsConfigured()) return; // pure-local app needs no tombstones
  saveTombstones([...loadTombstones().filter(t => t.id !== tripId),
    { id: tripId, at: new Date().toISOString() }]);
}

// ── Session state (tiny subscribable store — no React in this module) ────────

const state = {
  configured: accountsConfigured(),
  email: null,
  syncing: false,
  lastSync: 0,        // bumps after every completed sync — App refreshes on it
  lastError: "",      // friendly copy only, never raw errors (house rule)
  pendingLink: false, // magic link sent, awaiting click
};
const listeners = new Set();

export function getAccount() { return { ...state }; }
export function subscribeAccount(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(patch) { Object.assign(state, patch); listeners.forEach(fn => fn(getAccount())); }

let inited = false;

/** Idempotent. Cheap no-op when accounts aren't configured. */
export async function initAccounts() {
  if (inited || !accountsConfigured()) return;
  inited = true;
  const sb = await getSupabase();
  if (!sb) return;
  const { data } = await sb.auth.getSession();
  if (data?.session?.user) {
    emit({ email: data.session.user.email, pendingLink: false });
    fullSync(); // adopt the account's library on load
  }
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
      emit({ email: session.user.email, pendingLink: false, lastError: "" });
      fullSync();
    }
    if (event === "SIGNED_OUT") emit({ email: null });
  });
}

export async function signIn(email) {
  const sb = await getSupabase();
  if (!sb) return false;
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) {
    emit({ lastError: "Couldn't send the sign-in link. Please try again." });
    return false;
  }
  emit({ pendingLink: true, lastError: "" });
  return true;
}

/** Signs out of the account. The device's local copy of trips stays put. */
export async function signOut() {
  const sb = await getSupabase();
  await sb?.auth.signOut().catch(() => {});
  // Reset the session-scoped UI state along with the identity: a lingering
  // pendingLink would show "Check your email" to a signed-out card, and a
  // stale lastSync would label the NEXT account's card with the previous
  // account's sync time. (Spec P0-6: no orphaned states after sign-out.)
  emit({ email: null, pendingLink: false, lastSync: 0 });
}

// ── Sync ──────────────────────────────────────────────────────────────────────

const readPlan = (id) => {
  try { return JSON.parse(localStorage.getItem(planKeyFor(id)) || "null"); }
  catch { return null; }
};

function toRow(t, userId) {
  const { _plan, ...data } = t;
  return { user_id: userId, id: t.id, data, plan: readPlan(t.id), saved_at: t.savedAt };
}

/**
 * Two-way sync: pull, merge, apply deletions, push. Returns a summary or null.
 * Every failure path lands on a friendly lastError and an unchanged local app.
 */
export async function fullSync() {
  if (state.syncing) return null;
  const sb = await getSupabase();
  const { data: s } = (await sb?.auth.getSession()) || {};
  const user = s?.session?.user;
  if (!sb || !user) return null;

  emit({ syncing: true, lastError: "" });
  try {
    const [{ data: remoteTrips, error: e1 }, { data: remoteProfile, error: e2 }] = await Promise.all([
      sb.from("trips").select("id,data,plan,saved_at"),
      sb.from("profiles").select("data").eq("user_id", user.id).maybeSingle(),
    ]);
    if (e1 || e2) throw e1 || e2;

    const store = loadTripStore();
    const { merged, pushIds, deleteRemote, clearTombs } =
      mergeTrips(store.trips, remoteTrips || [], loadTombstones());

    // Adopt downloads: write plans that rode in on remote trips, then the store.
    for (const t of merged) {
      if (t._plan) {
        try { localStorage.setItem(planKeyFor(t.id), JSON.stringify(t._plan)); } catch { /* quota */ }
      }
      delete t._plan;
    }
    const activeStillExists = merged.some(t => t.id === store.activeId);
    saveTripStore({ ...store, trips: merged, activeId: activeStillExists ? store.activeId : (merged[merged.length - 1]?.id ?? null) });

    // Deletions the tombstones won, then retire every resolved tombstone.
    if (deleteRemote.length) {
      const { error } = await sb.from("trips").delete().in("id", deleteRemote).eq("user_id", user.id);
      if (error) throw error;
    }
    saveTombstones(loadTombstones().filter(t => !deleteRemote.includes(t.id) && !clearTombs.includes(t.id)));

    // Push what the server is missing or behind on.
    if (pushIds.length) {
      const rows = merged.filter(t => pushIds.includes(t.id)).map(t => toRow(t, user.id));
      const { error } = await sb.from("trips").upsert(rows);
      if (error) throw error;
    }

    // Profile, same LWW rule.
    let localProfile = null;
    try { localProfile = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch { /* ignore */ }
    const { winner, push } = pickProfile(localProfile, remoteProfile?.data || null);
    if (winner && winner !== localProfile) {
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(winner)); } catch { /* quota */ }
    }
    if (push) {
      const { error } = await sb.from("profiles").upsert({ user_id: user.id, data: winner });
      if (error) throw error;
    }

    emit({ syncing: false, lastSync: Date.now() });
    return { pulled: merged.length, pushed: pushIds.length, deleted: deleteRemote.length };
  } catch {
    emit({ syncing: false, lastError: "Couldn't sync just now — your trips are safe on this device." });
    return null;
  }
}

// Debounced push-only pass, hooked into every local mutation site. Runs a full
// two-way sync (cheap at this scale) so concurrent edits from another device
// are folded in rather than blindly overwritten.
let pushTimer = null;
export function scheduleSyncPush() {
  if (!accountsConfigured() || !state.email) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { fullSync(); }, PUSH_DEBOUNCE_MS);
}
