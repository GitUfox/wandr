import { describe, it, expect } from "vitest";
import { isAuthorizedCron, pingSupabase } from "./keepalive.js";

const req = (authorization) => ({ headers: authorization ? { authorization } : {} });

const SECRET = "s3cr3t-value-of-fixed-length";

describe("isAuthorizedCron", () => {
  it("accepts the exact bearer token", () => {
    expect(isAuthorizedCron(req(`Bearer ${SECRET}`), SECRET)).toBe(true);
  });

  it("fails closed when CRON_SECRET is unset — never an open write endpoint", () => {
    expect(isAuthorizedCron(req("Bearer anything"), undefined)).toBe(false);
    expect(isAuthorizedCron(req("Bearer anything"), "")).toBe(false);
  });

  it("rejects a missing Authorization header", () => {
    expect(isAuthorizedCron(req(), SECRET)).toBe(false);
  });

  it("rejects a wrong token of the same length", () => {
    const wrong = "x".repeat(SECRET.length);
    expect(isAuthorizedCron(req(`Bearer ${wrong}`), SECRET)).toBe(false);
  });

  it("rejects a token of a different length without throwing", () => {
    expect(isAuthorizedCron(req("Bearer short"), SECRET)).toBe(false);
    expect(isAuthorizedCron(req(`Bearer ${SECRET}extra`), SECRET)).toBe(false);
  });

  it("rejects a non-Bearer scheme carrying the right value", () => {
    expect(isAuthorizedCron(req(`Basic ${SECRET}`), SECRET)).toBe(false);
    expect(isAuthorizedCron(req(SECRET), SECRET)).toBe(false);
  });
});

describe("pingSupabase", () => {
  it("skips when the project is not configured", async () => {
    expect(await pingSupabase(undefined, undefined)).toEqual({ skipped: true });
  });

  it("sends one anonymous REST request to the trips table", async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200 }; };
    const r = await pingSupabase("https://x.supabase.co", "sb_publishable_k", fetchImpl);
    expect(r).toEqual({ ok: true, status: 200 });
    expect(calls[0].url).toBe("https://x.supabase.co/rest/v1/trips?select=id&limit=1");
    expect(calls[0].opts.headers.apikey).toBe("sb_publishable_k");
  });

  it("reports a paused project instead of throwing", async () => {
    const fetchImpl = async () => { const e = new Error("fetch failed"); e.cause = { code: "ENOTFOUND" }; throw e; };
    expect(await pingSupabase("https://x.supabase.co", "k", fetchImpl)).toEqual({ ok: false, error: "ENOTFOUND" });
  });
});
