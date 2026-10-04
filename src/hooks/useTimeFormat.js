import { useSyncExternalStore } from "react";
import { getTimeFormat, subscribeSettings } from "../lib/settings.js";

/**
 * The active time format ("24h" | "12h") as React state. formatTime and
 * displayTime read the setting at render time, so any surface that shows
 * times must call this hook — otherwise a format change made while that
 * surface is open leaves its times in the old format.
 */
export function useTimeFormat() {
  return useSyncExternalStore(subscribeSettings, getTimeFormat, getTimeFormat);
}
