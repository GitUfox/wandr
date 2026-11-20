/**
 * BudgetTiers — the daily-budget selector cards.
 *
 * Single shared control used by both the intake interview (step 4) and the
 * rebuild sheet (Trip Details), so the two budget UIs stay identical.
 *
 * Props:
 *   value    — currently selected tier value (per-person USD/day)
 *   onChange — setter, called with the chosen tier value
 */
import { BUDGET_TIERS, T } from "../lib/constants.js";
import StationSymbol from "./StationSymbol.jsx";

// Transit Diagram (direction E): the tiers are ROWS on one ruled list, not
// cards. The station symbol is the selection mark (ring = open, disc = picked).
export default function BudgetTiers({ value, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", borderBottom: `1px solid ${T.border}` }}>
      {BUDGET_TIERS.map(({ value: v, label, price, desc }, i) => {
        const sel = value === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={sel}
            onClick={() => onChange(v)}
            style={{
              display: "flex", alignItems: "center", gap: 14, minHeight: 68,
              padding: "10px 0", background: "transparent", border: "none",
              borderTop: i === 0 ? `3px solid ${T.ink}` : `1px solid ${T.border}`,
              cursor: "pointer", fontFamily: T.font, textAlign: "left", color: T.ink,
            }}
          >
            <StationSymbol kind={sel ? "done" : "stop"} size={24} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: T.fs.ui, fontWeight: sel ? 900 : 700, color: T.ink, marginBottom: 2 }}>
                {label}
                {price && <span style={{ fontWeight: 500, fontSize: T.fs.body, color: T.muted, marginLeft: 8 }}>{price}</span>}
              </div>
              <div style={{ fontSize: T.fs.body, color: T.muted }}>{desc}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
