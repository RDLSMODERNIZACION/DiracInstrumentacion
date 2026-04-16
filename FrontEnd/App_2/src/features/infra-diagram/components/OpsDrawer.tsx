import React, { useEffect, useMemo, useState } from "react";
import type { UINode } from "../types";
import { issuePumpCommand } from "../services/pumps";

type Props = {
  open: boolean;
  onClose: () => void;
  node: UINode | null;
  onCommandSent?: () => void;
};

type MaintenanceItem = {
  id: number;
  pump_id: number;
  maintenance_type: string;
  status: string;
  priority: string;
  title: string;
  description: string | null;
  diagnosis: string | null;
  resolution: string | null;
  reported_at: string | null;
  scheduled_for: string | null;
  started_at: string | null;
  completed_at: string | null;
  actual_cost: number | null;
  downtime_days: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type MaintenanceResponse = {
  ok: boolean;
  pump?: { id: number; name: string; location_id: number | null };
  in_maintenance?: boolean;
  current_order?: MaintenanceItem | null;
  latest_runtime?: any;
  items?: MaintenanceItem[];
};

function parseEntityId(nodeId: string): number | null {
  const parts = nodeId.split(":");
  if (parts.length !== 2) return null;
  const n = Number(parts[1]);
  return Number.isFinite(n) ? n : null;
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return String(v);
  return d.toLocaleString("es-AR");
}

function prettyStatus(v?: string | null) {
  const s = String(v || "").toLowerCase();
  if (s === "abierta") return "Abierta";
  if (s === "planificada") return "Planificada";
  if (s === "en_proceso") return "En proceso";
  if (s === "resuelta") return "Resuelta";
  if (s === "cancelada") return "Cancelada";
  return v || "—";
}

function prettyType(v?: string | null) {
  const s = String(v || "").toLowerCase();
  if (s === "preventivo") return "Preventivo";
  if (s === "correctivo") return "Correctivo";
  if (s === "inspeccion") return "Inspección";
  if (s === "lubricacion") return "Lubricación";
  if (s === "limpieza") return "Limpieza";
  if (s === "cambio_repuesto") return "Cambio repuesto";
  return v || "—";
}

function prettyPriority(v?: string | null) {
  const s = String(v || "").toLowerCase();
  if (s === "baja") return "Baja";
  if (s === "media") return "Media";
  if (s === "alta") return "Alta";
  if (s === "critica") return "Crítica";
  return v || "—";
}

const tabBtn = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: "10px 12px",
  borderRadius: 10,
  border: active ? "1px solid #0ea5e9" : "1px solid #cbd5e1",
  background: active ? "#e0f2fe" : "#fff",
  color: active ? "#0369a1" : "#475569",
  fontWeight: 700,
  cursor: "pointer",
});

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: "8px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#475569",
};

const sectionCard: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 12,
  background: "#fff",
};

export default function OpsDrawer({ open, onClose, node, onCommandSent }: Props) {
  const [tab, setTab] = useState<"acciones" | "mantenimiento">("acciones");

  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [maintBusy, setMaintBusy] = useState(false);
  const [maintMsg, setMaintMsg] = useState<string | null>(null);
  const [maintErr, setMaintErr] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceResponse | null>(null);

  const [maintenanceType, setMaintenanceType] = useState("correctivo");
  const [maintenanceStatus, setMaintenanceStatus] = useState("en_proceso");
  const [maintenancePriority, setMaintenancePriority] = useState("media");
  const [maintenanceTitle, setMaintenanceTitle] = useState("");
  const [maintenanceDescription, setMaintenanceDescription] = useState("");
  const [maintenanceDiagnosis, setMaintenanceDiagnosis] = useState("");

  const online = node?.online === true;
  const pumpId = useMemo(() => (node ? parseEntityId(node.id) : null), [node]);
  const state = (node?.state || "").toLowerCase();
  const canStart = node?.type === "pump" && online && state !== "run";
  const canStop = node?.type === "pump" && online && state === "run";

  const isPump = node?.type === "pump";
  const currentOrder = maintenance?.current_order ?? null;
  const inMaintenance = maintenance?.in_maintenance === true;

  useEffect(() => {
    if (!open) return;
    setMsg(null);
    setErr(null);
    setMaintMsg(null);
    setMaintErr(null);
  }, [open]);

  useEffect(() => {
    setTab("acciones");
    setPin("");
    setMsg(null);
    setErr(null);

    setMaintMsg(null);
    setMaintErr(null);
    setMaintenance(null);

    setMaintenanceType("correctivo");
    setMaintenanceStatus("en_proceso");
    setMaintenancePriority("media");
    setMaintenanceTitle("");
    setMaintenanceDescription("");
    setMaintenanceDiagnosis("");
  }, [node?.id]);

  useEffect(() => {
    if (!open || !isPump || !pumpId) return;
    loadMaintenance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isPump, pumpId]);

  async function loadMaintenance() {
    if (!pumpId) return;
    setMaintErr(null);
    try {
      const r = await fetch(`/infraestructura/pumps/${pumpId}/maintenance`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail || "No se pudo cargar mantenimiento");
      setMaintenance(j);
    } catch (e: any) {
      setMaintErr(e?.message || "No se pudo cargar mantenimiento");
    }
  }

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

  async function createMaintenance() {
    if (!pumpId) return;
    if (!maintenanceTitle.trim()) {
      setMaintErr("Ingresá un título para el mantenimiento");
      return;
    }

    setMaintBusy(true);
    setMaintMsg(null);
    setMaintErr(null);

    try {
      const r = await fetch(`/infraestructura/pumps/${pumpId}/maintenance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          maintenance_type: maintenanceType,
          status: maintenanceStatus,
          priority: maintenancePriority,
          title: maintenanceTitle.trim(),
          description: maintenanceDescription.trim() || null,
          diagnosis: maintenanceDiagnosis.trim() || null,
        }),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail || "No se pudo crear el mantenimiento");

      setMaintMsg("Mantenimiento registrado");
      setMaintenanceTitle("");
      setMaintenanceDescription("");
      setMaintenanceDiagnosis("");
      await loadMaintenance();
      onCommandSent?.();
    } catch (e: any) {
      setMaintErr(e?.message || "No se pudo crear el mantenimiento");
    } finally {
      setMaintBusy(false);
    }
  }

  async function closeCurrentMaintenance() {
    if (!currentOrder?.id) return;

    setMaintBusy(true);
    setMaintMsg(null);
    setMaintErr(null);

    try {
      const r = await fetch(`/infraestructura/pumps/maintenance/${currentOrder.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          status: "resuelta",
          completed_at: new Date().toISOString(),
        }),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail || "No se pudo cerrar el mantenimiento");

      setMaintMsg("Mantenimiento cerrado como resuelto");
      await loadMaintenance();
      onCommandSent?.();
    } catch (e: any) {
      setMaintErr(e?.message || "No se pudo cerrar el mantenimiento");
    } finally {
      setMaintBusy(false);
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
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: open ? "rgba(2,6,23,0.45)" : "transparent",
          transition: "background .2s ease",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 460,
          maxWidth: "92vw",
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

        <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0", display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setTab("acciones")} style={tabBtn(tab === "acciones")}>
            Acciones
          </button>
          <button
            type="button"
            onClick={() => setTab("mantenimiento")}
            style={tabBtn(tab === "mantenimiento")}
          >
            Mantenimiento
          </button>
        </div>

        <div
          style={{
            padding: 16,
            gap: 12,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          }}
        >
          {!node && <div>Seleccioná un componente.</div>}

          {node && tab === "acciones" && node.type === "pump" && (
            <>
              <div style={{ fontSize: 13, color: "#475569" }}>
                Estado actual: <b>{state || "desconocido"}</b>
              </div>

              <label style={labelStyle}>
                PIN (4 dígitos)
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D+/g, "").slice(0, 4))}
                  style={inputStyle}
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

          {node && tab === "acciones" && node.type !== "pump" && (
            <div style={{ color: "#64748b", fontSize: 12 }}>
              Por ahora solo hay acciones para bombas.
            </div>
          )}

          {node && tab === "mantenimiento" && node.type === "pump" && (
            <>
              <div
                style={{
                  ...sectionCard,
                  background: inMaintenance ? "#fef3c7" : "#f8fafc",
                  borderColor: inMaintenance ? "#f59e0b" : "#e2e8f0",
                }}
              >
                <div style={{ fontSize: 13, color: "#475569", marginBottom: 4 }}>
                  Estado de mantenimiento
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    color: inMaintenance ? "#a16207" : "#0f172a",
                  }}
                >
                  {inMaintenance ? "En mantenimiento" : "Sin mantenimiento activo"}
                </div>

                {currentOrder && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#475569" }}>
                    <div>
                      Orden activa: <b>#{currentOrder.id}</b>
                    </div>
                    <div>
                      Tipo: <b>{prettyType(currentOrder.maintenance_type)}</b>
                    </div>
                    <div>
                      Título: <b>{currentOrder.title}</b>
                    </div>
                    <div>
                      Estado: <b>{prettyStatus(currentOrder.status)}</b>
                    </div>
                  </div>
                )}

                {currentOrder && currentOrder.status === "en_proceso" && (
                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      disabled={maintBusy}
                      onClick={closeCurrentMaintenance}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #16a34a",
                        background: "#16a34a",
                        color: "#fff",
                        fontWeight: 700,
                      }}
                    >
                      {maintBusy ? "Guardando…" : "Cerrar mantenimiento"}
                    </button>
                  </div>
                )}
              </div>

              <div style={sectionCard}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Nuevo mantenimiento</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label style={labelStyle}>
                    Tipo
                    <select
                      value={maintenanceType}
                      onChange={(e) => setMaintenanceType(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="preventivo">Preventivo</option>
                      <option value="correctivo">Correctivo</option>
                      <option value="inspeccion">Inspección</option>
                      <option value="lubricacion">Lubricación</option>
                      <option value="limpieza">Limpieza</option>
                      <option value="cambio_repuesto">Cambio repuesto</option>
                    </select>
                  </label>

                  <label style={labelStyle}>
                    Estado
                    <select
                      value={maintenanceStatus}
                      onChange={(e) => setMaintenanceStatus(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="abierta">Abierta</option>
                      <option value="planificada">Planificada</option>
                      <option value="en_proceso">En proceso</option>
                      <option value="resuelta">Resuelta</option>
                      <option value="cancelada">Cancelada</option>
                    </select>
                  </label>

                  <label style={labelStyle}>
                    Prioridad
                    <select
                      value={maintenancePriority}
                      onChange={(e) => setMaintenancePriority(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="baja">Baja</option>
                      <option value="media">Media</option>
                      <option value="alta">Alta</option>
                      <option value="critica">Crítica</option>
                    </select>
                  </label>

                  <div />
                </div>

                <label style={{ ...labelStyle, display: "block", marginTop: 10 }}>
                  Título
                  <input
                    type="text"
                    value={maintenanceTitle}
                    onChange={(e) => setMaintenanceTitle(e.target.value)}
                    placeholder="Ej. Cambio de sello mecánico"
                    style={inputStyle}
                  />
                </label>

                <label style={{ ...labelStyle, display: "block", marginTop: 10 }}>
                  Descripción
                  <textarea
                    value={maintenanceDescription}
                    onChange={(e) => setMaintenanceDescription(e.target.value)}
                    rows={3}
                    placeholder="Detalle del trabajo a realizar"
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </label>

                <label style={{ ...labelStyle, display: "block", marginTop: 10 }}>
                  Diagnóstico
                  <textarea
                    value={maintenanceDiagnosis}
                    onChange={(e) => setMaintenanceDiagnosis(e.target.value)}
                    rows={3}
                    placeholder="Diagnóstico o motivo"
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </label>

                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    disabled={maintBusy}
                    onClick={createMaintenance}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #0ea5e9",
                      background: "#0ea5e9",
                      color: "#fff",
                      fontWeight: 700,
                    }}
                  >
                    {maintBusy ? "Guardando…" : "Agregar mantenimiento"}
                  </button>
                </div>

                {maintMsg && <div style={{ color: "#16a34a", fontSize: 12, marginTop: 10 }}>{maintMsg}</div>}
                {maintErr && <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 10 }}>{maintErr}</div>}
              </div>

              <div style={sectionCard}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Historial</div>

                {!maintenance && !maintErr && (
                  <div style={{ fontSize: 12, color: "#64748b" }}>Cargando historial…</div>
                )}

                {maintenance?.items && maintenance.items.length === 0 && (
                  <div style={{ fontSize: 12, color: "#64748b" }}>No hay mantenimientos registrados.</div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(maintenance?.items ?? []).map((item) => (
                    <div
                      key={item.id}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 10,
                        padding: 10,
                        background: "#f8fafc",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>
                          #{item.id} · {item.title}
                        </div>
                        <div style={{ fontSize: 12, color: "#475569" }}>{prettyStatus(item.status)}</div>
                      </div>

                      <div style={{ marginTop: 6, fontSize: 12, color: "#475569" }}>
                        <div>
                          Tipo: <b>{prettyType(item.maintenance_type)}</b>
                        </div>
                        <div>
                          Prioridad: <b>{prettyPriority(item.priority)}</b>
                        </div>
                        <div>
                          Reportado: <b>{fmtDate(item.reported_at)}</b>
                        </div>
                        <div>
                          Completado: <b>{fmtDate(item.completed_at)}</b>
                        </div>
                      </div>

                      {item.description && (
                        <div style={{ marginTop: 8, fontSize: 12, color: "#334155" }}>
                          <b>Descripción:</b> {item.description}
                        </div>
                      )}

                      {item.diagnosis && (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#334155" }}>
                          <b>Diagnóstico:</b> {item.diagnosis}
                        </div>
                      )}

                      {item.resolution && (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#334155" }}>
                          <b>Resolución:</b> {item.resolution}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {node && tab === "mantenimiento" && node.type !== "pump" && (
            <div style={{ color: "#64748b", fontSize: 12 }}>
              Por ahora el módulo de mantenimiento está disponible para bombas.
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: "auto",
            padding: 12,
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
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