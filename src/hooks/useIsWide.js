/**
 * useIsWide — matchMedia breakpoint hook for the desktop welcome layout
 * (design pick 12B). ≥900px = the departures-board arrangement; below it,
 * the mobile-first column is untouched. SSR-safe default: narrow.
 */
import { useState, useEffect } from "react";

export function useIsWide(minWidth = 900) {
  const [wide, setWide] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(`(min-width:${minWidth}px)`).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width:${minWidth}px)`);
    const onChange = e => setWide(e.matches);
    mq.addEventListener("change", onChange);
    setWide(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, [minWidth]);
  return wide;
}
