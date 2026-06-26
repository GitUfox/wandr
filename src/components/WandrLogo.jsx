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
          {/* Flowing dashed trail — ends at the plane's centre so it reads
              as streaming out from the middle of the paper plane. */}
          <path
            d="M8 40 C 46 24, 90 24, 120 32 C 150 40, 190 16, 222 22"
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
        wandr<svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={{
            height:        "0.5em",
            width:         "0.5em",
            marginLeft:    "0.07em",
            verticalAlign: "-0.04em",
            display:       "inline-block",
          }}
        >
          <circle cx="12" cy="12" r="11" fill={trailColor} />
          <g stroke="#0d0d0d" strokeWidth="1.4" fill="none" strokeLinecap="round">
            <line x1="2.2" y1="12" x2="21.8" y2="12" />
            <line x1="4.6" y1="6.9" x2="19.4" y2="6.9" />
            <line x1="4.6" y1="17.1" x2="19.4" y2="17.1" />
            <line x1="12" y1="1" x2="12" y2="23" />
            <ellipse cx="12" cy="12" rx="5" ry="11" />
          </g>
        </svg>
      </div>

    </div>
  );
}
