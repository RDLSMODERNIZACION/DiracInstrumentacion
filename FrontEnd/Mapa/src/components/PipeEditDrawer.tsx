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

  if (!pipeId) return null;
  if (!portalTarget) return null;

  async function save() {
    if (!data) return;

    try {
      setSaving(true);
      setError(null);

      const p = data.properties ?? {};

      const updated = await patchPipe(pipeId, {
        diametro_mm: p.diametro_mm ?? null,
        material: p.material ?? null,
        estado: p.estado ?? null,
        props: p.props ?? null,
      });

      onUpdated(updated);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  const p = data?.properties ?? {};

  // ✅ Paleta fija (legible en cualquier theme)
  const C = {
    overlay: "rgba(2, 6, 23, 0.55)", // slate-950 con alpha
    surface: "#ffffff",
    text: "#0f172a", // slate-900
    muted: "rgba(15, 23, 42, 0.70)",
    border: "rgba(15, 23, 42, 0.14)",
    inputBg: "#ffffff",
    inputText: "#0f172a",
    inputPlaceholder: "rgba(15, 23, 42, 0.45)",
    primary: "#2563eb",
    primaryText: "#ffffff",
    dangerBg: "#FEF2F2",
    dangerBorder: "#FECACA",
    dangerText: "#B91C1C",
  };

  const modal = (
    <div style={{ position: "fixed", inset: 0, zIndex: 999999 }}>
      {/* Backdrop */}
      <div
        style={{ position: "absolute", inset: 0, background: C.overlay }}
        onClick={saving ? undefined : onClose}
      />

      {/* Modal */}
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
          // ✅ forzamos color base acá para no heredar blanco/oscuro del tema
          style={{
            width: "100%",
            maxWidth: 440,
            background: C.surface,
            color: C.text,
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            border: `1px solid ${C.border}`,
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              padding: "12px 14px",
              borderBottom: `1px solid ${C.border}`,
              background: C.surface,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>
                Editar cañería
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>ID: {pipeId}</div>
            </div>

            <button
              onClick={saving ? undefined : onClose}
              aria-label="Cerrar"
              title="Cerrar"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: "#fff",
                color: C.text,
                fontSize: 18,
                lineHeight: "34px",
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: 14, display: "grid", gap: 12 }}>
            {error && (
              <div
                style={{
                  fontSize: 13,
                  padding: 10,
                  borderRadius: 12,
                  background: C.dangerBg,
                  border: `1px solid ${C.dangerBorder}`,
                  color: C.dangerText,
                }}
              >
                {error}
              </div>
            )}

            {!data && !error && (
              <div style={{ fontSize: 13, color: C.muted }}>Cargando…</div>
            )}

            {data && (
              <>
                <label style={{ fontSize: 13 }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
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
                      padding: "10px 10px",
                      borderRadius: 12,
                      border: `1px solid ${C.border}`,
                      background: C.inputBg,
                      color: C.inputText,
                      outline: "none",
                    }}
                  />
                </label>

                <label style={{ fontSize: 13 }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
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
                      padding: "10px 10px",
                      borderRadius: 12,
                      border: `1px solid ${C.border}`,
                      background: C.inputBg,
                      color: C.inputText,
                      outline: "none",
                    }}
                  />
                </label>

                <label style={{ fontSize: 13 }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
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
                      padding: "10px 10px",
                      borderRadius: 12,
                      border: `1px solid ${C.border}`,
                      background: C.inputBg,
                      color: C.inputText,
                      outline: "none",
                    }}
                  >
                    <option value="OK">OK</option>
                    <option value="WARN">WARN</option>
                    <option value="ALARM">ALARM</option>
                    <option value="OFF">OFF</option>
                  </select>
                </label>

                {/* hint: placeholder color para inputs (simple) */}
                <div style={{ fontSize: 12, color: C.muted }}>
                  Tip: si querés agregar más campos (clase, observaciones, etc.)
                  los sumamos acá.
                </div>
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
              gap: 8,
              background: C.surface,
            }}
          >
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: "#fff",
                color: C.text,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.6 : 1,
                fontWeight: 600,
              }}
            >
              Cancelar
            </button>

            <button
              onClick={save}
              disabled={saving || !data}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: C.primary,
                color: C.primaryText,
                cursor: saving || !data ? "not-allowed" : "pointer",
                opacity: saving || !data ? 0.7 : 1,
                fontWeight: 700,
              }}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>

      {/* placeholder color (opcional): si tu CSS global lo pisa, esto ayuda */}
      <style>
        {`
          /* scoped-ish: aplica a inputs dentro del portal */
          input::placeholder { color: ${C.inputPlaceholder}; }
        `}
      </style>
    </div>
  );

  return createPortal(modal, portalTarget);
}
