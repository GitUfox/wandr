import React from "react";
import { T } from "../lib/constants.js";

export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(e) { return { error: e }; }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem", textAlign: "center", background: T.bg0, fontFamily: T.font, color: T.ink }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, border: `2px solid ${T.border2}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 24, maxWidth: 360 }}>{this.state.error.message}</div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ padding: "10px 22px", background: T.accent, color: T.white, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
