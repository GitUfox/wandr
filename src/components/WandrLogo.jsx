/**
 * WandrLogo — paper plane + wandering trail variant
 * Taken directly from the Wandr Design handoff (F · Paper plane).
 *
 * Props:
 *   size        "sm" | "md" | "lg"   (default "md")
 *   showTrail   bool                  (default true)
 *   trailColor  string                (default Wandr orange)
 *   wordColor   string                (default near-white)
 */
const ORANGE = "#c96442";

export default function WandrLogo({
  size       = "md",
  showTrail  = true,
  trailColor = ORANGE,
  wordColor  = "#efefef",
}) {
  const scale    = size === "sm" ? 0.38 : size === "lg" ? 0.80 : 0.58;
  const svgW     = Math.round(262 * scale);
  const svgH     = Math.round(56  * scale);
  const fontSize = Math.round(92  * scale);
  const gap      = Math.round(12  * scale);

  return (
    <div style={{
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      gap,
      userSelect:     "none",
    }}>

      {showTrail && (
        <svg
          width={svgW}
          height={svgH}
          viewBox="0 0 262 56"
          fill="none"
          style={{ display: "block" }}
        >
          {/* Meandering dashed trail */}
          <path
            d="M8 40 C 50 14, 78 52, 120 32 S 188 18, 214 22"
            stroke={trailColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="2 9"
            fill="none"
          />
          {/* Origin dot */}
          <circle cx="8" cy="40" r="4" fill={trailColor} fillOpacity="0.55" />
          {/* Paper plane — two folded faces */}
          <g transform="translate(224 21) rotate(-18)">
            <path d="M22 0 L-20 -13 L-9 0 Z" fill={trailColor} />
            <path d="M22 0 L-9 0 L-20 13 Z" fill={trailColor} fillOpacity="0.5" />
          </g>
        </svg>
      )}

      {/* Wordmark */}
      <div style={{
        fontFamily:    "'Manrope', sans-serif",
        fontWeight:    800,
        letterSpacing: "-0.04em",
        lineHeight:    1,
        fontSize,
        color:         wordColor,
      }}>
        wandr<span style={{ color: trailColor }}>.</span>
      </div>

    </div>
  );
}
