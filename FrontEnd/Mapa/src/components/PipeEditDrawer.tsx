import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { fetchPipeById, patchPipe } from "../services/mapasagua";

type Props = {
  pipeId: string | null;
  onClose: () => void;
  onUpdated: (feature: any) => void;
};

const FLOW_FUNCS = [
  { value: "IMPULSION", label: "Impulsión" },
  { value: "DISTRIBUCION", label: "Distribución" },
  { value: "ADUCCION", label: "Aducción" },
  { value: "BYPASS", label: "Bypass" },
  { value: "RETORNO", label: "Retorno" },
  { value: "DRENAJE", label: "Drenaje" },
  { value: "DESCONOCIDO", label: "Desconocido" },
] as const;

// ✅ Listas controladas
const DIAMETERS_MM = [50, 63, 75, 90, 110, 160, 200, 250, 315, 400] as const;

const MATERIALS = [
  { value: "PVC", label: "PVC" },
  { value: "PEAD", label: "PEAD" },
  { value: "ACERO", label: "Acero" },
  { value: "FUNDICION", label: "Fundición" },
  { value: "HORMIGON", label: "Hormigón" },
] as const;

function normalizeMaterial(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;

  const up = s.toUpperCase();
  if (up === "PEAD") return "PEAD";
  if (up === "PVC") return "PVC";
  if (up === "ACERO" || up === "STEEL") return "ACERO";
  if (up === "FUNDICION" || up === "FUNDICIÓN") return "FUNDICION";
  if (up === "HORMIGON" || up === "HORMIGÓN") return "HORMIGON";

  // si no matchea, lo dejamos como venía (para no romper datos existentes)
  return s;
}

export default function PipeEditDrawer({ pipeId, onClose, onUpdated }: Props) {
  const [data, setData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const portalTarget = useMemo(() => {
    if (typeof document === "undefined") return null;
    return document.body;
  }, []);

  useEffect(() => {
    if (!pipeId) return;

    let cancelled = false;
    setData(null);
    setError(null);

    fetchPipeById(pipeId)
      .then((res) => {
        if (cancelled) return;

        const flow_func = res?.properties?.flow_func ?? "DISTRIBUCION";
        const props = (res?.properties ?? {})?.props ?? {};
        const materialNorm = normalizeMaterial(res?.properties?.material);

        setData({
          ...res,
          properties: {
            ...(res?.properties ?? {}),
            flow_func,
            props,
            material: materialNorm,
          },
        });
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "No se pudo cargar la cañería");
      });

    return () => {
      cancelled = true;
    };
  }, [pipeId]);

  if (!pipeId || !portalTarget) return null;

  const p = data?.properties ?? {};
  const props = p.props ?? {};

  async function save() {
    if (!data) return;

    try {
      setSaving(true);
      setError(null);

      const updated = await patchPipe(pipeId, {
        diametro_mm: p.diametro_mm ?? null,
        material: p.material ?? null,
        estado: p.estado ?? null,
        flow_func: p.flow_func ?? "DISTRIBUCION",
        props: {
          ...props,
          Layer: props.Layer ?? "",
        },
      });

      onUpdated(updated);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  const C = {
    overlay: "rgba(2,6,23,0.55)",
    surface: "#ffffff",
    text: "#0f172a",
    muted: "rgba(15,23,42,0.65)",
    border: "rgba(15,23,42,0.14)",
    primary: "#2563eb",
  };

  const modal = (
    <div style={{ position: "fixed", inset: 0, zIndex: 999999 }}>
      <div
        style={{ position: "absolute", inset: 0, background: C.overlay }}
        onClick={saving ? undefined : onClose}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: 16,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 520,
            background: C.surface,
            color: C.text,
            borderRadius: 14,
            overflow: "hidden",
            border: `1px solid ${C.border}`,
            boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 16px",
              borderBottom: `1px solid ${C.border}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Editar cañería</div>
              <div style={{ fontSize: 12, color: C.muted }}>ID: {pipeId}</div>
            </div>

            <button
              onClick={onClose}
              disabled={saving}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: "#fff",
                fontSize: 18,
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: 16, display: "grid", gap: 14 }}>
            {error && (
              <div
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  color: "#B91C1C",
                  padding: 10,
                  borderRadius: 10,
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            {!data && <div style={{ color: C.muted }}>Cargando…</div>}

            {data && (
              <>
                {/* ✅ NOMBRE (props.Layer) */}
                <label>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
                    Nombre / Identificador
                  </div>
                  <input
                    value={props.Layer ?? ""}
                    placeholder="Ej: RA_PO_Impulsión_Acero_250"
                    onChange={(e) =>
                      setData({
                        ...data,
                        properties: {
                          ...p,
                          props: {
                            ...props,
                            Layer: e.target.value,
                          },
                        },
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: 12,
                      border: `1px solid ${C.border}`,
                    }}
                  />
                </label>

                {/* ✅ FLOW FUNC */}
                <label>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
                    Función hidráulica
                  </div>
                  <select
                    value={p.flow_func ?? "DISTRIBUCION"}
                    onChange={(e) =>
                      setData({
                        ...data,
                        properties: {
                          ...p,
                          flow_func: e.target.value,
                        },
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: 12,
                      border: `1px solid ${C.border}`,
                      background: "#fff",
                    }}
                  >
                    {FLOW_FUNCS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  {/* ✅ Diámetro como lista */}
                  <label>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
                      Diámetro (DN mm)
                    </div>
                    <select
                      value={p.diametro_mm ?? ""}
                      onChange={(e) =>
                        setData({
                          ...data,
                          properties: {
                            ...p,
                            diametro_mm: e.target.value ? Number(e.target.value) : null,
                          },
                        })
                      }
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: 12,
                        border: `1px solid ${C.border}`,
                        background: "#fff",
                      }}
                    >
                      <option value="">—</option>
                      {DIAMETERS_MM.map((d) => (
                        <option key={d} value={d}>
                          DN {d}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* ✅ Material como lista */}
                  <label>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
                      Material
                    </div>
                    <select
                      value={p.material ?? ""}
                      onChange={(e) =>
                        setData({
                          ...data,
                          properties: {
                            ...p,
                            material: e.target.value ? e.target.value : null,
                          },
                        })
                      }
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: 12,
                        border: `1px solid ${C.border}`,
                        background: "#fff",
                      }}
                    >
                      <option value="">—</option>
                      {MATERIALS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
                    Estado
                  </div>
                  <select
                    value={p.estado ?? "OK"}
                    onChange={(e) =>
                      setData({
                        ...data,
                        properties: {
                          ...p,
                          estado: e.target.value,
                        },
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: 12,
                      border: `1px solid ${C.border}`,
                      background: "#fff",
                    }}
                  >
                    <option value="OK">OK</option>
                    <option value="WARN">WARN</option>
                    <option value="ALARM">ALARM</option>
                    <option value="OFF">OFF</option>
                  </select>
                </label>
              </>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: 14,
              borderTop: `1px solid ${C.border}`,
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
            }}
          >
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: "#fff",
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              Cancelar
            </button>

            <button
              onClick={save}
              disabled={saving || !data}
              style={{
                padding: "10px 16px",
                borderRadius: 12,
                background: C.primary,
                color: "#fff",
                fontWeight: 800,
                cursor: saving || !data ? "not-allowed" : "pointer",
                opacity: saving || !data ? 0.7 : 1,
              }}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, portalTarget);
}
