import React from "react";

import type { InsertMode } from "./types";
import { insertMeta } from "./insertMode";

export default function InsertFloatingGuide({
  mode,
  busy,
  hoverScreenPoint,
  onCancel,
}: {
  mode: InsertMode;
  busy: boolean;
  hoverScreenPoint: { x: number; y: number } | null;
  onCancel: () => void;
}) {
  if (mode === "none") return null;

  const meta = insertMeta(mode);

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 18,
          transform: "translateX(-50%)",
          zIndex: 5000,
          background: "rgba(15,23,42,0.96)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.16)",
          borderRadius: 16,
          padding: "12px 14px",
          boxShadow: "0 16px 36px rgba(0,0,0,0.35)",
          fontWeight: 900,
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 12,
          maxWidth: "calc(100% - 32px)",
        }}
      >
        <span style={{ fontSize: 18 }}>{meta.icon}</span>

        <span>{busy ? "Insertando..." : `${meta.label}: ${meta.hint}`}</span>

        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(239,68,68,0.88)",
            color: "#fff",
            borderRadius: 11,
            padding: "7px 10px",
            fontWeight: 900,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.55 : 1,
          }}
        >
          Cancelar
        </button>
      </div>

      {hoverScreenPoint && (
        <div
          style={{
            position: "absolute",
            left: hoverScreenPoint.x + 18,
            top: hoverScreenPoint.y - 10,
            zIndex: 5000,
            pointerEvents: "none",
            background: "rgba(15,23,42,0.94)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: 14,
            padding: "7px 10px",
            boxShadow: "0 10px 26px rgba(0,0,0,0.28)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 17 }}>{meta.icon}</span>
          <span style={{ fontSize: 12 }}>{meta.label}</span>
        </div>
      )}
    </>
  );
}
