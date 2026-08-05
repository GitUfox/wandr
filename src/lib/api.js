/**
 * Wandr API client — routes through the local proxy server.
 *
 * All requests go to /api/anthropic (handled by server.js in dev and prod).
 * The API key lives only on the server — it never touches the browser bundle.
 */

const MODEL   = "claude-sonnet-4-6";
const API_URL = "/api/anthropic";

const HEADERS = { "Content-Type": "application/json" };

/**
 * Single-shot completion. Returns the parsed response object.
 */
export async function complete(messages, maxTokens = 5000, signal) {
  let res;
  try {
    res = await fetch(API_URL, {
      method:  "POST",
      headers: HEADERS,
      body:    JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages }),
      signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    // Network-level failure (server down, connection refused, offline)
    // Use the same message as 502 so the retry logic in useBuildTrip fires
    throw new Error("Couldn't reach the AI service. Please try again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg  = (typeof body?.error === "string" ? body.error : null)
      || (res.status === 429 ? "Daily limit reached. Try again later." : null)
      || (res.status >= 500 ? "Something went wrong on our end. Please try again." : null)
      || "Something went wrong. Please try again.";
    throw new Error(msg);
  }
  return res.json();
}

/**
 * Streaming completion. Returns the raw Response for the caller to consume.
 */
export async function stream(messages, maxTokens = 16000, signal) {
  let res;
  try {
    res = await fetch(API_URL, {
      method:  "POST",
      headers: HEADERS,
      body:    JSON.stringify({ model: MODEL, max_tokens: maxTokens, stream: true, messages }),
      signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    // Network-level failure (server down, connection refused, offline)
    throw new Error("Couldn't reach the AI service. Please try again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg  = (typeof body?.error === "string" ? body.error : null)
      || (res.status === 429 ? "Daily limit reached. Try again later." : null)
      || (res.status >= 500 ? "Something went wrong on our end. Please try again." : null)
      || "Something went wrong. Please try again.";
    throw new Error(msg);
  }
  return res;
}

/** Emit one complete SSE line's delta text. Split out so the read loop and the
 *  end-of-stream flush can never drift apart. */
function emitSSELine(line, onChunk) {
  if (!line.startsWith("data: ")) return;
  const raw = line.slice(6).trim();
  if (raw === "[DONE]") return;
  try {
    const j = JSON.parse(raw);
    if (j.type === "content_block_delta" && j.delta?.text) {
      onChunk(j.delta.text);
    }
  } catch { /* malformed SSE line — skip */ }
}

/**
 * Consume a streaming response and call onChunk(text) for each delta.
 *
 * Network chunks do NOT align with SSE line boundaries — a single
 * `data: {...}` event routinely arrives split across two reads. Both halves
 * then fail JSON.parse and get swallowed by the catch above, silently dropping
 * text from the middle of the plan. That shipped: a Baltimore itinerary printed
 * "sculpture17:00" where "garden. Open Wed–Sun 10:00–" had been eaten
 * (PHASE2_PLANNING §15.3). So `carry` holds the trailing partial line until the
 * next read completes it, and the decoder runs in streaming mode so multi-byte
 * UTF-8 (— … é, everywhere in this app's output) can straddle a chunk too.
 *
 * This is a fix INSIDE the streaming pattern, not a replacement for it.
 */
export async function consumeStream(response, onChunk, signal) {
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let carry = ""; // trailing partial SSE line, completed by the next chunk
  while (true) {
    if (signal?.aborted) { reader.cancel(); break; }
    const { done, value } = await reader.read();
    if (done) break;
    const lines = (carry + decoder.decode(value, { stream: true })).split("\n");
    carry = lines.pop() ?? ""; // last element is incomplete until a "\n" arrives
    for (const line of lines) emitSSELine(line, onChunk);
  }
  // A well-formed stream ends with "\n\n", but a truncated one can leave a
  // complete event in the carry with no terminator. Flush rather than lose it.
  const tail = carry + decoder.decode();
  if (tail) emitSSELine(tail, onChunk);
}
