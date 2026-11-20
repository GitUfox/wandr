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
