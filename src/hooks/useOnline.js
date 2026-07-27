import { useState, useEffect } from "react";

/**
 * Whether the browser currently has a network connection.
 *
 * Used to make the offline state explicit rather than silent. Offline, Wandr is
 * read-only by definition — the saved itinerary renders from localStorage, but
 * building or editing a trip needs the AI. Without this, those controls would
 * still look live and fail on tap, which reads as "the app is broken" exactly
 * when the user is abroad and least able to tell the difference.
 *
 * navigator.onLine is a coarse signal — it reports link state, not reachability,
 * so a captive portal or dead uplink can still read as "online". It is therefore
 * used only to *disable* and *explain*, never as the sole guard: the request
 * paths keep their own error handling for the false-positive case.
 */
export function useOnline() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" || navigator.onLine !== false
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return online;
}
