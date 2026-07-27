/**
 * Service worker registration + update loop.
 *
 * The failure this guards against (learned on Poul): once a shell is cached,
 * a deploy can stop reaching users — including a bug fix — because nothing ever
 * asks the browser to re-check. Navigations are network-first so the HTML is
 * always fresh online, but the SW *script* itself needs its own nudge, hence
 * the explicit update() on load and on an interval.
 *
 * Dev is deliberately excluded: a SW intercepting Vite's module graph produces
 * confusing stale-module bugs that look like code errors.
 */

const UPDATE_INTERVAL_MS = 60 * 60 * 1000; // hourly, matching Poul

export function registerSW() {
  if (import.meta.env.DEV) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      // updateViaCache:"none" makes the browser fetch sw.js past the HTTP
      // cache on every update check. Without it a CDN's cache headers can pin
      // users to an old worker — and the worker is what decides everything else.
      const reg = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });

      // A new SW has installed and is waiting — take over now rather than
      // leaving the user on the old bundle until every tab closes.
      const promote = () => {
        if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
      };
      promote();
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          // Only promote a replacement, not the very first install (which has
          // no controller and would reload the page on a user's first visit).
          if (sw.state === "installed" && navigator.serviceWorker.controller) promote();
        });
      });

      reg.update().catch(() => {});
      setInterval(() => reg.update().catch(() => {}), UPDATE_INTERVAL_MS);
    } catch {
      // Offline support is an enhancement — never surface a failure to register.
    }
  });

  // When the new SW takes control, reload once so the fresh bundle is running.
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}
