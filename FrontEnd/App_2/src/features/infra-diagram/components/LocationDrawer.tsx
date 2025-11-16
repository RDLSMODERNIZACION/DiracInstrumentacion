import React, { useEffect, useState } from "react";
import { triggerLocationAlarm } from "../services/locationOps";

type Props = {
  open: boolean;
  onClose: () => void;
  location: { id: number | null; name: string } | null;
};

export default function LocationDrawer({ open, onClose, location }: Props) {
  const [tab, setTab] = useState<"info" | "alarm">("info");
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  // Reseteamos estado cuando se abre/cierra o cambia de localidad
  useEffect(() => {
    if (!open) {
      setTab("info");
      setIsSending(false);
      setLastResult(null);
    }
  }, [open, location?.id]);

  if (!open || !location) return null;

  const handleAlarmClick = async () => {
    if (location.id == null) {
      alert("Esta localidad no tiene ID asociado.");
      return;
    }
    try {
      setIsSending(true);
      setLastResult(null);
      await triggerLocationAlarm(location.id);
      setLastResult("Comando enviado correctamente.");
    } catch (err: any) {
      console.error(err);
      setLastResult(err?.message || "Error al enviar comando.");
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setTab("info");
    setIsSending(false);
    setLastResult(null);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        bottom: 0,
        width: 340,
        background: "#f8fafc",
        color: "#0f172a",
        boxShadow: "-6px 0 24px rgba(15,23,42,0.18)",
        display: "flex",
        flexDirection: "column",
        zIndex: 60,
        borderLeft: "1px solid #e2e8f0",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background:
            "linear-gradient(90deg, rgba(239,246,255,1) 0%, rgba(219,234,254,1) 60%, rgba(239,246,255,1) 100%)",
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.06,
              color: "#64748b",
            }}
          >
            Localidad
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>
            {location.name}
          </div>
          {location.id != null && (
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              ID interno: {location.id}
            </div>
          )}
        </div>
        <button
          onClick={handleClose}
          style={{
            border: "none",
            background: "transparent",
            color: "#475569",
            cursor: "pointer",
            fontSize: 18,
            padding: 4,
            lineHeight: 1,
            borderRadius: "999px",
          }}
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div
          style={{
            background: "#e2e8f0",
            borderRadius: 999,
            padding: 2,
            display: "flex",
            gap: 4,
            fontSize: 12,
          }}
        >
          <button
            onClick={() => setTab("info")}
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              background: tab === "info" ? "#ffffff" : "transparent",
              color: tab === "info" ? "#0f172a" : "#64748b",
              fontWeight: tab === "info" ? 600 : 500,
            }}
          >
            Detalles
          </button>
          <button
            onClick={() => setTab("alarm")}
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              background: tab === "alarm" ? "#0ea5e9" : "transparent",
              color: tab === "alarm" ? "#f9fafb" : "#64748b",
              fontWeight: tab === "alarm" ? 600 : 500,
            }}
          >
            Luces + Sirena
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div
        style={{
          flex: 1,
          padding: 16,
          overflowY: "auto",
          fontSize: 13,
        }}
      >
        {tab === "info" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ color: "#475569" }}>
              Resumen de la localidad. Más adelante podemos completar con datos
              reales del backend (empresa, dirección, cantidad de activos, etc.).
            </div>

            <div
              style={{
                background: "#ffffff",
                borderRadius: 12,
                padding: 12,
                border: "1px solid #e2e8f0",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div
                style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}
              >
                Información básica
              </div>
              <div style={{ fontSize: 12, color: "#475569" }}>
                <strong>Nombre:</strong> {location.name}
              </div>
              {location.id != null && (
                <div style={{ fontSize: 12, color: "#475569" }}>
                  <strong>ID interno:</strong> {location.id}
                </div>
              )}
            </div>

            {/* Placeholder para futuros datos */}
            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                color: "#94a3b8",
              }}
            >
              Tip: acá podemos mostrar estado de alarmas, consumo eléctrico,
              bombas ON/OFF, etc.
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ color: "#475569" }}>
              Este comando enciende las <strong>luces</strong> y la{" "}
              <strong>sirena</strong> de esta localidad al mismo tiempo.
            </div>

            <div
              style={{
                background: "#fef2f2",
                borderRadius: 12,
                padding: 12,
                border: "1px solid #fecaca",
                fontSize: 12,
                color: "#991b1b",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Aviso</div>
              <div>
                Usar solo en situaciones de prueba controlada o emergencia
                real. El comando impacta toda la localidad.
              </div>
            </div>

            <button
              onClick={handleAlarmClick}
              disabled={isSending}
              style={{
                padding: "12px 16px",
                borderRadius: 999,
                border: "none",
                cursor: isSending ? "default" : "pointer",
                background: isSending ? "#fb923c" : "#ef4444",
                color: "#f9fafb",
                fontWeight: 700,
                fontSize: 14,
                boxShadow: "0 10px 15px -3px rgba(248,113,113,0.35)",
                transition: "transform 0.08s ease, box-shadow 0.08s ease",
              }}
            >
              {isSending
                ? "Enviando comando…"
                : "Activar LUCES + SIRENA ahora"}
            </button>

            {lastResult && (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: lastResult.includes("Error") ? "#b91c1c" : "#16a34a",
                  background: lastResult.includes("Error")
                    ? "#fef2f2"
                    : "#ecfdf5",
                  borderRadius: 8,
                  padding: "6px 8px",
                  border: lastResult.includes("Error")
                    ? "1px solid #fecaca"
                    : "1px solid #bbf7d0",
                }}
              >
                {lastResult}
              </div>
            )}

            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: "#94a3b8",
                borderTop: "1px dashed #e2e8f0",
                paddingTop: 8,
              }}
            >
              Más adelante podemos agregar:
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                <li>Duración configurable de la sirena.</li>
                <li>Modos de luces (fija / intermitente).</li>
                <li>Historial de activaciones por localidad.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
