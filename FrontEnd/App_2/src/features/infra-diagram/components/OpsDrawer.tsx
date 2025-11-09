import React, { useMemo, useState } from "react";
import type { UINode } from "../types";
import { issuePumpCommand } from "../services/pumps";

type Props = {
  open: boolean;
  onClose: () => void;
  node: UINode | null;
  onCommandSent?: () => void;
};

function parseEntityId(nodeId: string): number | null {
  const parts = nodeId.split(":");
  if (parts.length !== 2) return null;
  const n = Number(parts[1]);
  return Number.isFinite(n) ? n : null;
}

export default function OpsDrawer({ open, onClose, node, onCommandSent }: Props) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const online = node?.online === true;

  const pumpId = useMemo(() => (node ? parseEntityId(node.id) : null), [node]);
  const state = (node?.state || "").toLowerCase(); // "run" | "stop" | ""
  const canStart = node?.type === "pump" && online && state !== "run";
  const canStop = node?.type === "pump" && online && state === "run";

  async function doCmd(action: "start" | "stop") {
    if (!node || node.type !== "pump" || !pumpId) return;
    setBusy(action);
    setMsg(null);
    setErr(null);
    try {
      await issuePumpCommand(pumpId, action, pin || undefined);
      setMsg(`Comando ${action.toUpperCase()} enviado`);
      onCommandSent?.();
    } catch (e: any) {
      setErr(e?.message || "Fallo al enviar el comando");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: open ? "auto" : "none",
        zIndex: 50,
      }}
    >
      {/* overlay */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: open ? "rgba(2,6,23,0.45)" : "transparent",
          transition: "background .2s ease",
        }}
      />
      {/* panel */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 360,
          maxWidth: "86vw",
          height: "100%",
          background: "#fff",
          borderLeft: "1px solid #e2e8f0",
          boxShadow: "0 20px 40px rgba(2,6,23,.2)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform .25s ease",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {node ? `${node.name}` : "Operación"}
          </div>
          <div style={{ color: "#64748b", fontSize: 12 }}>
            {node ? `${node.type}${online ? " · online" : " · offline"}` : ""}
          </div>
        </div>

        <div style={{ padding: 16, gap: 12, display: "flex", flexDirection: "column" }}>
          {!node && <div>Seleccioná un componente.</div>}

          {node && node.type === "pump" && (
            <>
              <div style={{ fontSize: 13, color: "#475569" }}>
                Estado actual: <b>{state || "desconocido"}</b>
              </div>

              <label style={{ fontSize: 12, color: "#475569" }}>
                PIN (4 dígitos)
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D+/g, "").slice(0, 4))}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: "8px 10px",
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                />
              </label>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  disabled={!canStart || !!busy}
                  onClick={() => doCmd("start")}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #0ea5e9",
                    background: canStart && !busy ? "#0ea5e9" : "#e2e8f0",
                    color: canStart && !busy ? "#fff" : "#64748b",
                    fontWeight: 600,
                  }}
                >
                  {busy === "start" ? "Enviando…" : "Encender"}
                </button>

                <button
                  disabled={!canStop || !!busy}
                  onClick={() => doCmd("stop")}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #ef4444",
                    background: canStop && !busy ? "#ef4444" : "#e2e8f0",
                    color: canStop && !busy ? "#fff" : "#64748b",
                    fontWeight: 600,
                  }}
                >
                  {busy === "stop" ? "Enviando…" : "Apagar"}
                </button>
              </div>

              {msg && <div style={{ color: "#16a34a", fontSize: 12 }}>{msg}</div>}
              {err && <div style={{ color: "#b91c1c", fontSize: 12 }}>{err}</div>}

              {!online && (
                <div style={{ color: "#64748b", fontSize: 12 }}>
                  La bomba está offline; no se pueden enviar comandos.
                </div>
              )}
            </>
          )}

          {node && node.type !== "pump" && (
            <div style={{ color: "#64748b", fontSize: 12 }}>
              Por ahora solo hay acciones para bombas.
            </div>
          )}
        </div>

        <div style={{ marginTop: "auto", padding: 12, borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: "#fff",
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
