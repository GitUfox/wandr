import { describe, it, expect } from "vitest";
import { isAuthorizedCron } from "./keepalive.js";

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
