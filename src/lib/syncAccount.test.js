import { describe, it, expect, vi } from "vitest";

// Account-state lifecycle around sign-in/sign-out. Kept separate from
// sync.test.js, which deliberately tests only the pure merge core — this file
// mocks the supabase client to drive the stateful surface.

vi.mock("./supabaseClient.js", () => ({
  accountsConfigured: () => true,
  getSupabase: async () => ({
    auth: {
      signInWithOtp: async () => ({ error: null }),
      signOut: async () => ({}),
    },
  }),
}));

import { signIn, signOut, getAccount } from "./sync.js";

// lib tests run in node (no DOM); signIn reads window.location.origin for the
// magic-link redirect — give it the same shape the browser would.
globalThis.window ??= { location: { origin: "http://localhost:5173" } };

describe("signOut resets the session-scoped account state", () => {
  it("clears pendingLink so a signed-out card never says Check your email", async () => {
    await signIn("k@example.com");
    expect(getAccount().pendingLink).toBe(true);

    await signOut();
    const a = getAccount();
    expect(a.pendingLink).toBe(false);
    expect(a.email).toBe(null);
    // A stale lastSync would label the NEXT account's card with the previous
    // account's sync time — sign-out must zero it.
    expect(a.lastSync).toBe(0);
  });
});
