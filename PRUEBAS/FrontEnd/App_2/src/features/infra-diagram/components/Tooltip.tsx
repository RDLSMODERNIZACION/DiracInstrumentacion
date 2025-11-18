import React from "react";
import type { Tip } from "../types";

export default function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: tip.x,
        top: tip.y,
        transform: "translateY(-110%)",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "8px 10px",
        fontSize: 12,
        color: "#0f172a",
        boxShadow: "0 10px 20px rgba(2,6,23,0.08)",
        pointerEvents: "none",
        minWidth: 160,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{tip.title}</div>
      {tip.lines.map((l, i) => (
        <div key={i} style={{ color: "#475569" }}>
          {l}
        </div>
      ))}
    </div>
  );
}
