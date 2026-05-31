import { T } from "../lib/constants.js";

export default function LoadingScreen({ message, destination }) {
  return (
    <div style={{ minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem", textAlign: "center", background: T.bg0, fontFamily: T.font }}>
      <div style={{ width: 32, height: 32, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin .7s linear infinite", marginBottom: "1.5rem" }} />
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, color: T.ink }}>{message}</div>
      <div style={{ fontSize: 12, color: T.hint }}>Building your guide for {destination}</div>
    </div>
  );
}
