/**
 * StationSymbol: the four Transit Diagram stop symbols (redesign direction E).
 *
 *   stop   open ring            a stop on the day line
 *   book   ring with a center   a stop that needs a booking ("book ahead")
 *   end    bar                  the last stop of the day
 *   done   filled disc          a stop or item that is complete
 *
 * Code geometry only (circle, rect). The ring fill is opaque on purpose: the
 * symbol sits ON the day line and must cover it.
 */
import { T } from "../lib/constants.js";

export const STATION_KINDS = ["stop", "book", "end", "done"];

export default function StationSymbol({ kind = "stop", size = 26, color = T.ink, fill = T.white, style }) {
  const p = {
    width: size, height: size, viewBox: "0 0 26 26",
    "aria-hidden": true, style: { display: "block", flexShrink: 0, ...style },
  };
  switch (kind) {
    case "book":
      return <svg {...p}><circle cx="13" cy="13" r="10" fill={fill} stroke={color} strokeWidth="4" /><circle cx="13" cy="13" r="4" fill={color} /></svg>;
    case "end":
      return <svg {...p}><rect x="1" y="8" width="24" height="10" fill={color} /></svg>;
    case "done":
      return <svg {...p}><circle cx="13" cy="13" r="12" fill={color} /></svg>;
    case "stop":
    default:
      return <svg {...p}><circle cx="13" cy="13" r="10" fill={fill} stroke={color} strokeWidth="4" /></svg>;
  }
}
