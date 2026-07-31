import { T } from "../lib/constants.js";
import WandrLogo from "./WandrLogo.jsx";

export default function LoadingScreen({ message, destination }) {
  return (
    <div style={{ minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem", textAlign: "center", background: T.bg0, fontFamily: T.font }}>
      <div style={{ marginBottom: "2.5rem" }}>
        <WandrLogo size="md" showTrail={false} globe="animated" />
      </div>
      <div style={{ width: 28, height: 28, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin .7s linear infinite", marginBottom: "1.25rem" }} />
      <div style={{ fontSize: T.fs.title, fontWeight: 700, marginBottom: 5, color: T.ink }}>{message}</div>
      <div style={{ fontSize: T.fs.body, color: T.hint }}>Building your guide for {destination}</div>
    </div>
  );
}
