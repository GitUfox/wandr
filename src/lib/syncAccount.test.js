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

import { signInErrorCopy, readExpiredLink, cancelPendingLink } from "./sync.js";

describe("signInErrorCopy — plain words, never codes", () => {
  it("rate limit: tells the traveler how long to wait, in minutes", () => {
    expect(signInErrorCopy({ status: 429, message: "For security purposes, you can only request this after 47 seconds." }))
      .toBe("Too many link requests — try again in 1 minute.");
    expect(signInErrorCopy({ message: "email rate limit exceeded" })).toMatch(/^Too many link requests/);
  });
  it("service down (paused project, gateway error): names the service, not the code", () => {
    expect(signInErrorCopy({ status: 502, message: "Bad Gateway" })).toMatch(/^Can't reach the sign-in service/);
    expect(signInErrorCopy(new TypeError("fetch failed"))).toMatch(/^Can't reach the sign-in service/);
  });
  it("anything else: a generic retry with a wait", () => {
    const c = signInErrorCopy({ status: 400, message: "Signups not allowed for otp" });
    expect(c).toBe("Couldn't send the email just now — try again in a couple of minutes.");
    expect(c).not.toMatch(/\b4\d\d\b|otp/);
  });
});

describe("readExpiredLink — the URL Supabase sends an expired link back to", () => {
  it("recognises the otp_expired hash", () => {
    expect(readExpiredLink({ hash: "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired" })).toBe(true);
  });
  it("ignores a normal landing and a token landing", () => {
    expect(readExpiredLink({ hash: "" })).toBe(false);
    expect(readExpiredLink({ hash: "#access_token=abc&refresh_token=def&type=magiclink" })).toBe(false);
    expect(readExpiredLink(null)).toBe(false);
  });
});

describe("pending address round trip", () => {
  it("signIn records where the link went; Wrong address? keeps it for editing", async () => {
    await signIn("typo@example.com");
    let a = getAccount();
    expect(a.pendingLink).toBe(true);
    expect(a.pendingEmail).toBe("typo@example.com");
    expect(a.linkSentAt).toBeGreaterThan(0);

    cancelPendingLink();
    a = getAccount();
    expect(a.pendingLink).toBe(false);
    expect(a.pendingEmail).toBe("typo@example.com");
    await signOut();
    expect(getAccount().pendingEmail).toBe(null);
  });
});
