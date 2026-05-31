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
export async function complete(messages, maxTokens = 5000) {
  const res = await fetch(API_URL, {
    method:  "POST",
    headers: HEADERS,
    body:    JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages }),
  });
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
export async function stream(messages, maxTokens = 8000) {
  const res = await fetch(API_URL, {
    method:  "POST",
    headers: HEADERS,
    body:    JSON.stringify({ model: MODEL, max_tokens: maxTokens, stream: true, messages }),
  });
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

/**
 * Consume a streaming response and call onChunk(text) for each delta.
 */
export async function consumeStream(response, onChunk) {
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") continue;
      try {
        const j = JSON.parse(raw);
        if (j.type === "content_block_delta" && j.delta?.text) {
          onChunk(j.delta.text);
        }
      } catch { /* malformed SSE line — skip */ }
    }
  }
}
