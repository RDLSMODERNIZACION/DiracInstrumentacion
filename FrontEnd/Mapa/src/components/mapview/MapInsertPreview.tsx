// src/components/mapview/MapInsertPreview.tsx
import React from "react";

type InsertMode = "none" | "valve" | "tank" | "pump";

function iconForMode(mode: InsertMode) {
  switch (mode) {
    case "valve":
      return "🛑";
    case "tank":
      return "🛢️";
    case "pump":
      return "⚙️";
    default:
      return "＋";
  }
}

function labelForMode(mode: InsertMode) {
  switch (mode) {
    case "valve":
      return "Insertar válvula";
    case "tank":
      return "Insertar tanque";
    case "pump":
      return "Insertar bomba";
    default:
      return "";
  }
}

export default function MapInsertPreview({
  mode,
  hoverScreenPoint,
  visible,
  busy = false,
  onCancel,
}: {
  mode: InsertMode;
  hoverScreenPoint: { x: number; y: number } | null;
  visible: boolean;
  busy?: boolean;
  onCancel?: () => void;
}) {
  if (!visible || mode === "none") return null;

  const icon = iconForMode(mode);
  const label = labelForMode(mode);

  return (
    <>
      {/* tarjeta superior */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 16,
          transform: "translateX(-50%)",
          zIndex: 6000,
          background: "rgba(15,23,42,0.96)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 16,
          padding: "10px 14px",
          boxShadow: "0 16px 38px rgba(0,0,0,0.35)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          maxWidth: "calc(100% - 32px)",
          fontWeight: 900,
          pointerEvents: "auto",
        }}
      >
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span>
          {busy ? "Insertando..." : `${label}: pasá sobre una cañería y hacé click`}
        </span>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(239,68,68,0.88)",
              color: "#fff",
              borderRadius: 10,
              padding: "6px 10px",
              fontWeight: 900,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            Cancelar
          </button>
        )}
      </div>

      {/* icono cerca del mouse */}
      {hoverScreenPoint && (
        <div
          style={{
            position: "absolute",
            left: hoverScreenPoint.x + 16,
            top: hoverScreenPoint.y - 12,
            zIndex: 6000,
            pointerEvents: "none",
            background: "rgba(15,23,42,0.92)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 12,
            padding: "6px 10px",
            color: "#fff",
            fontWeight: 900,
            boxShadow: "0 8px 22px rgba(0,0,0,0.24)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontSize: 12 }}>{label}</span>
        </div>
      )}
    </>
  );
}