/**
 * Manual Upstash keepalive — fires the same /api/keepalive endpoint the daily
 * Vercel cron hits, on demand.
 *
 * Use when you want activity on the Upstash account right now (e.g. after an
 * inactivity warning) without waiting for the next cron run.
 *
 *   npm run keepalive                       → pings production
 *   KEEPALIVE_URL=http://localhost:3001/... → pings somewhere else
 *
 * Reads CRON_SECRET from .env.local and never prints it.
 */

import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.local") });

const URL_ = process.env.KEEPALIVE_URL || "https://wandr-mauve.vercel.app/api/keepalive";
const SECRET = process.env.CRON_SECRET;

if (!SECRET) {
  console.error("CRON_SECRET is not set in .env.local — add it there and in the Vercel dashboard.");
  process.exit(1);
}

try {
  const res  = await fetch(URL_, { headers: { authorization: `Bearer ${SECRET}` } });
  const body = await res.json().catch(() => ({}));

  if (res.ok && body.ok) {
    console.log(`✅ Upstash pinged — ${body.pingedAt} (${body.roundTripMs}ms round-trip)`);
  } else if (res.status === 401) {
    console.error("❌ Rejected — CRON_SECRET here doesn't match the one in Vercel.");
    process.exit(1);
  } else {
    console.error(`❌ Keepalive failed: ${body.error || "unexpected response"}`);
    process.exit(1);
  }
} catch (err) {
  console.error(`❌ Couldn't reach ${URL_} — ${err.message}`);
  process.exit(1);
}
