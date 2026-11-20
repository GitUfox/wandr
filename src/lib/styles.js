/**
 * Shared control styles. Transit Diagram redesign (direction E).
 *
 * ONE home for the controls that repeat across screens: choice chips, text
 * fields, field labels and the primary button. The interview once carried
 * seven hand-copied chip style objects. Copies drift, so new screens import
 * from here.
 *
 * All values come from T. No color or size is defined in this file.
 */
import { T, NO_MOTION } from "./constants.js";

// The pane harness freezes CSS transitions mid-flight, so a screenshot shows a
// half-changed color. VITE_NO_MOTION turns the transitions off.
const ease = (v) => (NO_MOTION ? "none" : v);

/**
 * A motion class from src/index.css, or nothing when motion is off for the
 * harness. Use it for every Transit Diagram motion class: className={motion("t-pop")}.
 * `delayMs` gives the inline stagger: style={{ ...delay(120) }}.
 */
export const motion = (cls) => (NO_MOTION ? undefined : cls);
export const delay = (ms) => (NO_MOTION ? {} : { animationDelay: `${Math.round(ms)}ms` });

/**
 * A choice chip. Selected = ink fill, the same idea as a "done" station.
 * The weight is the same in both states, so a toggle never changes the width.
 * `small` is for dense grids (the interests taxonomy).
 */
export const chipSt = (sel, { small = false } = {}) => ({
  minHeight: small ? 40 : 46,
  padding: small ? "0 14px" : "0 18px",
  fontSize: small ? T.fs.body : T.fs.ui,
  fontWeight: 700,
  fontFamily: T.font,
  borderRadius: T.r.pill,
  background: sel ? T.ink : T.bg1,
  color: sel ? T.white : T.ink,
  border: `2px solid ${T.ink}`,
  cursor: "pointer",
  transition: ease("background .15s, color .15s"),
});

/** A text input, textarea or select. */
export const fieldSt = {
  width: "100%", padding: "13px 16px", boxSizing: "border-box",
  background: T.bg1, color: T.ink,
  border: `2px solid ${T.ink}`, borderRadius: T.r.md,
  outline: "none", fontSize: T.fs.ui, fontFamily: T.font,
  colorScheme: "light",
};

/** The visible label above a field or a chip group. Sentence case. */
export const labelSt = {
  display: "block", fontSize: T.fs.ui, fontWeight: 700, color: T.ink, marginBottom: 8,
};

/** The "· optional" note inside a label. */
export const optionalSt = { fontWeight: 400, color: T.muted };

/** The one primary action of a screen. */
export const primaryBtnSt = (enabled = true) => ({
  minHeight: 56, padding: "0 28px",
  background: enabled ? T.accent : T.bg3,
  color: enabled ? T.white : T.hint,
  border: "none", borderRadius: T.r.pill,
  fontSize: T.fs.ui, fontWeight: 900, fontFamily: T.font,
  cursor: enabled ? "pointer" : "default",
  transition: ease("background .15s, color .15s"),
});

/** A secondary action, filled: ink pill. */
export const solidBtnSt = {
  minHeight: 44, padding: "0 18px", borderRadius: T.r.pill,
  background: T.ink, color: T.white, border: `2px solid ${T.ink}`,
  fontSize: T.fs.body, fontWeight: 900, fontFamily: T.font, cursor: "pointer",
};

/** A secondary action, outlined: ink ring pill. */
export const outlineBtnSt = {
  minHeight: 44, padding: "0 18px", borderRadius: T.r.pill,
  background: "transparent", color: T.ink, border: `2px solid ${T.ink}`,
  fontSize: T.fs.body, fontWeight: 700, fontFamily: T.font, cursor: "pointer",
};

/** A destructive confirm (delete, sign out, clear data): accent pill. */
export const dangerBtnSt = { ...solidBtnSt, background: T.accent, border: `2px solid ${T.accent}` };

/** A bottom sheet panel and its backdrop. `open` drives the slide. */
export const sheetBackdropSt = (open) => ({
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100,
  opacity: open ? 1 : 0, transition: "opacity 0.22s ease", pointerEvents: open ? "auto" : "none",
});
export const sheetEdgeSt = { background: T.bg1, borderTop: `3px solid ${T.ink}`, borderRadius: "18px 18px 0 0" };

/** The title of a sheet or a block. */
export const titleSt = { fontFamily: T.fontDay, fontSize: T.fs.title, fontWeight: 900, letterSpacing: "-.02em", color: T.ink };
