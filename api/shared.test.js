import { describe, it, expect } from "vitest";
import { getClientIp, isAllowedOrigin } from "./shared.js";

// Minimal request stub — only the fields getClientIp reads.
const req = (headers = {}, remoteAddress) => ({ headers, socket: { remoteAddress } });

describe("getClientIp — rate-limit key source", () => {
  it("prefers x-real-ip (edge-set) over a spoofed x-forwarded-for", () => {
    // Attacker prepends a fake IP to XFF; the trusted x-real-ip must win, so
    // rotating the fake XFF value can't mint fresh rate-limit buckets.
    const r = req({
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "1.1.1.1, 203.0.113.7",
    });
    expect(getClientIp(r)).toBe("203.0.113.7");
  });

  it("falls back to x-forwarded-for's leftmost value when x-real-ip is absent", () => {
    expect(getClientIp(req({ "x-forwarded-for": "198.51.100.9, 10.0.0.1" }))).toBe("198.51.100.9");
  });

  it("falls back to the socket address when no proxy headers are present", () => {
    expect(getClientIp(req({}, "::1"))).toBe("::1");
  });

  it("returns 'unknown' when nothing identifies the client", () => {
    expect(getClientIp(req({}))).toBe("unknown");
  });

  it("trims whitespace around the resolved ip", () => {
    expect(getClientIp(req({ "x-real-ip": "  203.0.113.7  " }))).toBe("203.0.113.7");
  });
});

describe("isAllowedOrigin", () => {
  it("rejects an empty/missing origin", () => {
    expect(isAllowedOrigin("")).toBe(false);
    expect(isAllowedOrigin(undefined)).toBe(false);
  });

  it("allows localhost dev origins", () => {
    expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
  });

  it("rejects an arbitrary foreign origin", () => {
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
  });
});
