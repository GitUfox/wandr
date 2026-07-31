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

export default function BudgetTiers({ value, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {BUDGET_TIERS.map(({ value: v, label, price, desc }) => {
        const sel = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "11px 14px", borderRadius: T.r.md,
              background: sel ? "#2a1a12" : T.bg1,
              border: sel ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
              cursor: "pointer", fontFamily: T.font, textAlign: "left",
              transition: "all .15s",
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: T.fs.body, fontWeight: 700, color: sel ? T.accent : T.ink, marginBottom: 1 }}>
                {label}
                {price && <span style={{ fontWeight: 400, fontSize: T.fs.body, color: sel ? "#a06040" : T.hint, marginLeft: 8 }}>{price}</span>}
              </div>
              <div style={{ fontSize: T.fs.meta, color: sel ? "#a06040" : T.hint }}>{desc}</div>
            </div>
            {sel && <span style={{ fontSize: T.fs.ui, color: T.accent }}>✓</span>}
          </button>
        );
      })}
    </div>
  );
}
