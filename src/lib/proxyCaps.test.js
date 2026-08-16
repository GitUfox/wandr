import { describe, it, expect } from "vitest";
import { oversizedPayload, MAX_CONTENT_CHARS } from "../../api/shared.js";

// Input-size boundary (security sweep 2026-08-15). max_tokens caps output;
// this caps input — the last unmet line of the deployment checklist.

describe("oversizedPayload", () => {
  it("passes a normal build prompt", () => {
    expect(oversizedPayload([{ role: "user", content: "Plan a trip to Porto." }])).toBe(false);
  });

  it("passes a legitimate upload-sized payload (3×1MB images as base64)", () => {
    const image = { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "x".repeat(1_340_000) } };
    const messages = [{ role: "user", content: [image, image, image, { type: "text", text: "context" }] }];
    expect(JSON.stringify(messages).length).toBeLessThan(MAX_CONTENT_CHARS);
    expect(oversizedPayload(messages)).toBe(false);
  });

  it("rejects a stuffed prompt over the ceiling", () => {
    expect(oversizedPayload([{ role: "user", content: "x".repeat(MAX_CONTENT_CHARS + 1) }])).toBe(true);
  });

  it("rejects unserializable input rather than letting it through", () => {
    const cyclic = {};
    cyclic.self = cyclic;
    expect(oversizedPayload([cyclic])).toBe(true);
  });
});
