/**
 * StardustBurst — one-shot ✦ burst (design pick 8C, deliberately repurposed
 * as event feedback rather than an idle loop: it fires when something GOOD
 * just happened — a suggestion picked, an itinerary ready).
 *
 * Usage: render with a counter as `burstKey`; each increment replays the
 * burst (the key remounts the sparks). Renders nothing until first trigger.
 * Parent must be position:relative — sparks scatter from `origin` within it.
 *
 * Reduced motion: sparks start at opacity 0 and only become visible through
 * the animation, so `animation: none` (prefers-reduced-motion) means the
 * burst simply never appears — no fallback needed.
 */
import { T } from "../lib/constants.js";

const SPARKS = [
  { dx: -3,  dy: -15, size: 11, color: "#e8956b", delay: 0 },
  { dx: 14,  dy: -7,  size: 8,  color: "#f4c9a8", delay: .07 },
  { dx: -16, dy: -3,  size: 9,  color: T.accent,  delay: .14 },
  { dx: 7,   dy: 11,  size: 7,  color: "#e8956b", delay: .21 },
  { dx: -10, dy: 13,  size: 7,  color: "#f4c9a8", delay: .28 },
  { dx: 18,  dy: 5,   size: 6,  color: T.accent,  delay: .34 },
];

export default function StardustBurst({ burstKey, origin = { right: 8, top: "50%" } }) {
  if (!burstKey) return null;
  return (
    <span key={burstKey} aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
      <style>{`
        @keyframes wburst {
          0%   { opacity: 0; transform: translate(0, 0) scale(.3) rotate(0deg); }
          35%  { opacity: 1; transform: translate(var(--bx), var(--by)) scale(1) rotate(20deg); }
          100% { opacity: 0; transform: translate(calc(var(--bx) * 1.8), calc(var(--by) * 1.8)) scale(.4) rotate(50deg); }
        }
        @media (prefers-reduced-motion: reduce) { .wburst-spark { animation: none !important; } }
      `}</style>
      {SPARKS.map((s, i) => (
        <span key={i} className="wburst-spark"
          style={{
            position: "absolute", ...origin,
            fontSize: s.size, color: s.color, lineHeight: 1, opacity: 0,
            "--bx": `${s.dx}px`, "--by": `${s.dy}px`,
            animation: `wburst .9s ease-out ${s.delay}s forwards`,
          }}>
          ✦
        </span>
      ))}
    </span>
  );
}
