import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The status line promises "sync will retry shortly". These tests hold the
// engine to it: a failed sync retries on its own, a capped number of times,
// and stops promising once the cap is reached.

let sessionCalls = 0;
let fail = true;
vi.mock("./supabaseClient.js", () => ({
  accountsConfigured: () => true,
  getSupabase: async () => ({
    auth: {
      getSession: async () => { sessionCalls += 1; return { data: { session: { user: { id: "u1", email: "k@example.com" } } } }; },
      signOut: async () => ({}),
    },
    from: () => ({
      select: () => {
        const res = fail ? { data: null, error: new Error("down") } : { data: [], error: null };
        const p = Promise.resolve(res);
        p.eq = () => ({ maybeSingle: async () => (fail ? { data: null, error: new Error("down") } : { data: null, error: null }) });
        return p;
      },
      upsert: async () => ({ error: null }),
      delete: () => ({ in: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  }),
}));

import { fullSync, signOut, getAccount } from "./sync.js";

beforeEach(() => { vi.useFakeTimers(); sessionCalls = 0; fail = true; });
afterEach(async () => { await signOut(); vi.useRealTimers(); });

describe("fullSync retry", () => {
  it("schedules a retry after a failure and says so", async () => {
    await fullSync();
    const a = getAccount();
    expect(a.lastError).not.toBe("");
    expect(a.retryPending).toBe(true);

    const before = sessionCalls;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sessionCalls).toBeGreaterThan(before);
  });

  it("stops promising a retry once the cap is reached", async () => {
    await fullSync();
    for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(30_000);
    const a = getAccount();
    expect(a.retryPending).toBe(false);
    expect(a.lastError).not.toBe("");

    const settled = sessionCalls;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sessionCalls).toBe(settled); // no endless loop
  });

  it("a retry that succeeds clears the error and records the sync", async () => {
    await fullSync();
    fail = false;
    await vi.advanceTimersByTimeAsync(30_000);
    const a = getAccount();
    expect(a.lastError).toBe("");
    expect(a.retryPending).toBe(false);
    expect(a.lastSync).toBeGreaterThan(0);
  });

  it("sign-out cancels a pending retry", async () => {
    await fullSync();
    await signOut();
    const settled = sessionCalls;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sessionCalls).toBe(settled);
    expect(getAccount().retryPending).toBe(false);
  });
});
