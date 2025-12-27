import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { fetchPipeById, patchPipe } from "../services/mapasagua";

type Props = {
  pipeId: string | null;
  onClose: () => void;
  onUpdated: (feature: any) => void;
};

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
        if (!cancelled) setData(res);
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
            maxWidth: 460,
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
            }}
          >
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                Editar cañería
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>
                ID: {pipeId}
              </div>
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
                {/* ✅ NOMBRE */}
                <label>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
                    Nombre / Identificador
                  </div>
                  <input
                    value={props.Layer ?? ""}
                    placeholder="Ej: RA_3TKS_Llanquihue_PVC_075"
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

                <label>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
                    Diámetro (mm)
                  </div>
                  <input
                    type="number"
                    value={p.diametro_mm ?? ""}
                    placeholder="Ej: 110"
                    onChange={(e) =>
                      setData({
                        ...data,
                        properties: {
                          ...p,
                          diametro_mm: e.target.value
                            ? Number(e.target.value)
                            : null,
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

                <label>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
                    Material
                  </div>
                  <input
                    value={p.material ?? ""}
                    placeholder="Ej: PEAD"
                    onChange={(e) =>
                      setData({
                        ...data,
                        properties: {
                          ...p,
                          material: e.target.value,
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
                fontWeight: 700,
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
