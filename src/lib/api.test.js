/**
 * consumeStream — SSE chunk-boundary regression suite.
 *
 * The bug these lock down (PHASE2_PLANNING §15.2 A, reproduced §15.3): the read
 * loop split each network chunk on "\n" with no carry, so any `data: {...}` line
 * straddling a chunk boundary failed JSON.parse in BOTH halves and was swallowed
 * by the silent catch. It shipped corrupted text into a customer-facing PDF
 * ("sculpture17:00", where "garden. Open Wed–Sun 10:00–" had been eaten).
 *
 * The important case is `splitAt` — chunk boundaries in the real world land
 * wherever the socket says, not on event boundaries.
 */
import { describe, it, expect, vi } from "vitest";
import { consumeStream } from "./api.js";

/** Build an SSE body from delta texts, Anthropic's event shape. */
function sseFor(texts) {
  return texts
    .map(t => `data: ${JSON.stringify({ type: "content_block_delta", delta: { text: t } })}\n\n`)
    .join("") + "data: [DONE]\n\n";
}

/** A fake Response whose body yields exactly the given chunks, in order. */
function responseOf(chunks) {
  const enc = new TextEncoder();
  return {
    body: new ReadableStream({
      start(c) {
        for (const ch of chunks) c.enqueue(typeof ch === "string" ? enc.encode(ch) : ch);
        c.close();
      },
    }),
  };
}

/** Run consumeStream over chunks and return the concatenated text. */
async function collect(chunks, signal) {
  let out = "";
  await consumeStream(responseOf(chunks), t => { out += t; }, signal);
  return out;
}

/** Split a string into `n` roughly equal byte-agnostic pieces. */
function intoPieces(s, n) {
  const size = Math.ceil(s.length / n);
  const parts = [];
  for (let i = 0; i < s.length; i += size) parts.push(s.slice(i, i + size));
  return parts;
}

describe("consumeStream — chunk boundaries", () => {
  // The exact Baltimore defect, in the shape it shipped.
  const DELTAS = ["sculpture garden. ", "Open Wed–Sun 10:00–", "17:00. Free admission."];
  const EXPECTED = DELTAS.join("");
  const SSE = sseFor(DELTAS);

  it("reads a response that arrives in one chunk", async () => {
    expect(await collect([SSE])).toBe(EXPECTED);
  });

  it("does not drop text when a line is split mid-JSON (the shipped bug)", async () => {
    const cut = SSE.indexOf("Open Wed") + 4; // inside the second event's JSON
    expect(await collect([SSE.slice(0, cut), SSE.slice(cut)])).toBe(EXPECTED);
  });

  it("survives a split at every single byte offset", async () => {
    // Exhaustive: any boundary the network picks must produce identical text.
    for (let i = 1; i < SSE.length; i++) {
      const got = await collect([SSE.slice(0, i), SSE.slice(i)]);
      expect(got, `split at offset ${i}`).toBe(EXPECTED);
    }
  });

  it("survives being shredded into many small chunks", async () => {
    for (const n of [3, 7, 20, 100]) {
      expect(await collect(intoPieces(SSE, n)), `${n} pieces`).toBe(EXPECTED);
    }
  });

  it("keeps multi-byte UTF-8 intact across a chunk boundary", async () => {
    // "—" is 3 bytes; the app's output is full of em dashes and accents.
    const sse = sseFor(["Café — Zürich"]);
    const bytes = new TextEncoder().encode(sse);
    const mid = sse.indexOf("—") + 1; // land inside the em dash's byte sequence
    const got = await collect([bytes.slice(0, mid), bytes.slice(mid)]);
    expect(got).toBe("Café — Zürich");
    expect(got).not.toContain("�"); // no replacement char
  });

  it("flushes a final event that has no trailing newline", async () => {
    // A truncated upstream can end mid-terminator; don't lose a complete event.
    const partial = `data: ${JSON.stringify({ type: "content_block_delta", delta: { text: "last words" } })}`;
    expect(await collect([partial])).toBe("last words");
  });
});

describe("consumeStream — event filtering", () => {
  it("ignores the [DONE] sentinel and non-delta events", async () => {
    const body =
      `event: message_start\ndata: ${JSON.stringify({ type: "message_start" })}\n\n` +
      `data: ${JSON.stringify({ type: "ping" })}\n\n` +
      `data: ${JSON.stringify({ type: "content_block_delta", delta: { text: "kept" } })}\n\n` +
      `data: ${JSON.stringify({ type: "message_stop" })}\n\n` +
      `data: [DONE]\n\n`;
    expect(await collect([body])).toBe("kept");
  });

  it("skips a malformed line without throwing or losing its neighbours", async () => {
    const body =
      `data: ${JSON.stringify({ type: "content_block_delta", delta: { text: "before " } })}\n\n` +
      `data: {not json at all\n\n` +
      `data: ${JSON.stringify({ type: "content_block_delta", delta: { text: "after" } })}\n\n`;
    expect(await collect([body])).toBe("before after");
  });

  it("ignores a delta with no text (empty string is not emitted)", async () => {
    const body =
      `data: ${JSON.stringify({ type: "content_block_delta", delta: { text: "" } })}\n\n` +
      `data: ${JSON.stringify({ type: "content_block_delta", delta: {} })}\n\n`;
    const onChunk = vi.fn();
    await consumeStream(responseOf([body]), onChunk);
    expect(onChunk).not.toHaveBeenCalled();
  });
});

describe("consumeStream — abort", () => {
  it("stops emitting once the signal aborts", async () => {
    // Abort before the first read: nothing should be emitted at all.
    const controller = new AbortController();
    controller.abort();
    expect(await collect([sseFor(["never seen"])], controller.signal)).toBe("");
  });

  it("cancels the reader on abort so the body is released", async () => {
    const controller = new AbortController();
    controller.abort();
    const cancel = vi.fn();
    const response = { body: { getReader: () => ({ cancel, read: async () => ({ done: true }) }) } };
    await consumeStream(response, () => {}, controller.signal);
    expect(cancel).toHaveBeenCalled();
  });
});
