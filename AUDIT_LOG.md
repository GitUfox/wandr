# Wandr Audit Log

Periodic health checks — most recent entry first.

---

## Audit — 2026-06-04

**Health score:** B — No critical issues; 1 high security finding (now fixed); logic and UX gaps are cleaned up. Codebase is in solid shape.
**Effort level:** high (full codebase)

### Issues found

| Severity | Category | File | Issue |
|----------|----------|------|-------|
| High | Security | `server.js` | `VITE_ANTHROPIC_API_KEY` fallback — VITE_ vars are bundled into the browser by Vite, risking key exposure for developers migrating from old non-proxy setup |
| Medium | Logic | `useBuildTrip.js` | Retry check `e.message.includes("500")` is dead — `api.js` already transforms 500s to friendly messages; substring never matches |
| Medium | Security / UX | `Dashboard.jsx` | `window.open()` returns `null` when popup is blocked; `w.document.write()` would crash immediately with no user feedback |
| Medium | Security | `Dashboard.jsx` | `trip.destination` and `trip.tagline` injected raw into `w.document.write()` HTML — XSS if either contains `<script>` |
| Medium | UX | `Dashboard.jsx` | `copyPlan` failure silently swallowed — `.catch(() => {})` gives user no indication the copy failed |
| Low | T-token | `App.jsx` | `GLOBAL_CSS` had hardcoded `#0d0d0d` — should reference `T.bg0` |
| Low | Logic | `useGenerate.js` | No `AbortController` — stream continues running if user navigates away mid-generation |
| Low | Security | `server.js` | No CORS restriction — any origin can call the proxy in a public deployment |
| Low | Consistency | `server.js` | Body limit (20mb) inconsistent with per-file client limit (10MB × 5 files ≈ 70MB base64) |
| Low | T-token | `Dashboard.jsx` | Photo spots section and avoidList use hardcoded hex values instead of `CATS` / `T` tokens |

### Fixes applied

| File | Change | Why |
|------|--------|-----|
| `server.js` | Removed `?? process.env.VITE_ANTHROPIC_API_KEY` fallback; added security comment | `VITE_` prefix causes Vite to bundle the key into the browser; fallback is a footgun for developers with old `.env.local` |
| `useBuildTrip.js` | Updated retry detection to match actual friendly error strings from `api.js` | Previous check for `"500"` / `"server"` never matched; auto-retry was completely dead |
| `Dashboard.jsx` | Added `htmlEscape()` helper; applied to `trip.destination` and `trip.tagline` in `exportToPdf` | Prevents XSS if a crafted destination string contains HTML/script tags |
| `Dashboard.jsx` | Added null check for `window.open()` result; shows alert if popup is blocked | Prevents silent `TypeError: Cannot read properties of null` crash |
| `Dashboard.jsx` | `copyPlan` catch now sets `copied = "error"` and shows "Copy failed" in red | User now knows when clipboard permission is denied instead of seeing no feedback |
| `App.jsx` | `GLOBAL_CSS` background changed from `"#0d0d0d"` to `"${T.bg0}"` | Enforces T-token rule: no hardcoded hex values outside `constants.js` |

### Deferred (TODOs added)

| File | Issue | Reason deferred |
|------|-------|-----------------|
| `useGenerate.js` | AbortController to cancel stream on navigation | Requires threading `AbortSignal` through `stream()` and `consumeStream()` in `api.js` — architectural change |
| `server.js` | Add CORS origin allowlist for production | Needs the deployed domain to be known; safe to add before public launch |
| `server.js` | Align body limit with per-file upload limits | Trade-off decision: reduce per-file max (simpler) vs raise server limit (more permissive); both viable |
| `Dashboard.jsx` | Photo spots / avoidList colors should use `CATS` tokens | Low-risk cosmetic; coordinate with design pass |

### Notes

- Prompt quality is in good shape from the earlier session (temporal grounding, accuracy rules, ACCURACY block in `buildTripPrompt` all present).
- The retry fix in `useBuildTrip.js` re-enables a safety net that was silently broken — users with unstable connections will now actually benefit from it.
- The `VITE_ANTHROPIC_API_KEY` fix is important if this app ever moves to a shared or public repo — old `.env.local` files with `VITE_` prefix would have leaked the key via the browser bundle.
- Two TODOs worth prioritising before next public release: CORS + AbortController.
- Suggested trigger for next audit: before shipping the `m_edit_trip` feature (edit trip details modal).

---
