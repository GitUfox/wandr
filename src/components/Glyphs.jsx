/**
 * Glyph — Wandr's single line-icon family (design pick 10A).
 *
 * 2px stroke, round caps, currentColor-friendly — the same hand as the pin,
 * plane, and check marks drawn inline elsewhere. Replaces all UI emoji
 * (same standing rule as Poul: emoji render in their own color world and
 * differently on every OS; drawn glyphs read as one system).
 */
export default function Glyph({ name, size = 16, color = "currentColor", style }) {
  const p = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
    style: { flexShrink: 0, display: "block", ...style }, "aria-hidden": true,
  };
  switch (name) {
    case "swap": // exchange arrows — swap activities
      return <svg {...p}><path d="M4 7h13M17 7l-3-3M17 7l-3 3M20 17H7M7 17l3-3M7 17l3 3" /></svg>;
    case "calendar": // one day
      return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>;
    case "mix": // sliders — adjust the overall feel
      return <svg {...p}><path d="M4 7h8M19 7h1M4 12h1M11 12h9M4 17h12" /><circle cx="15" cy="7" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="19" cy="17" r="2" /></svg>;
    case "trip": // suitcase — trip details
      return <svg {...p}><rect x="4" y="8" width="16" height="13" rx="3" /><path d="M9 8V5a3 3 0 0 1 6 0v3" /></svg>;
    case "ticket": // event ticket — happening during your trip
      return <svg {...p}><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z" /><path d="M13 5v2M13 11v2M13 17v2" /></svg>;
    case "warning":
      return <svg {...p}><path d="M12 3L2 20h20L12 3z" /><path d="M12 10v4M12 17.5h.01" /></svg>;
    case "dice": // surprise me
      return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01" /></svg>;
    case "plane": // solid — the brand mark's plane
      return <svg {...p} fill={color} stroke="none"><path d="M2.5 11.2L21.5 3l-5.6 18-4.3-6.9L2.5 11.2z" /></svg>;
    case "coin": // cost fact chip (4A) — banknote, not a circled letter: the
      // original circle + C-curve read as a copyright symbol at chip size.
      return <svg {...p}><rect x="2.5" y="7" width="19" height="11" rx="2" /><circle cx="12" cy="12.5" r="2.6" /></svg>;
    case "clock": // duration fact chip (4A)
      return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>;
    case "doors": // opening-hours fact chip (4A)
      return <svg {...p}><path d="M5 20V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14M4 20h16M14 12h.01" /></svg>;
    case "bookmark": // book-ahead fact chip (4A)
      return <svg {...p}><path d="M7 4h10v16l-5-4-5 4z" /></svg>;
    case "info": // generic fact chip (4A fallback)
      return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 11v4M12 8h.01" /></svg>;
    case "sparkle": // AI tweak (3B action bar) — the ✦ diamond, drawn
      return <svg {...p}><path d="M12 3l2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3z" /></svg>;
    case "move": // send to another day (3B action bar)
      return <svg {...p}><path d="M7 17V7M7 7L4 10M7 7l3 3M17 7v10M17 17l3-3M17 17l-3-3" /></svg>;
    case "pencil": // inline edit (3B action bar)
      return <svg {...p}><path d="M4 20l4.2-1.1L20 7.1 16.9 4 5.1 15.8 4 20zM14.5 6.4l3.1 3.1" /></svg>;
    case "x": // remove (3B action bar)
      return <svg {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case "pin": // map chip (pick A) — verified venue opens in Google Maps
      return <svg {...p}><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z" /><circle cx="12" cy="10" r="2.4" /></svg>;
    default:
      return null;
  }
}
