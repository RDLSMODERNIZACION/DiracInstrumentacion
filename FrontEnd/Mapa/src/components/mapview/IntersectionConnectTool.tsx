import React from "react";
import { Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import {
  connectPipesAtIntersection,
  previewPipesAtIntersection,
  type ConnectIntersectionResult,
} from "../../services/mapasagua";

type Props = {
  active: boolean;
  defaultToleranceM?: number;
  onCancel: () => void;
  onCreated?: (result: ConnectIntersectionResult) => void;
};

type PickedPoint = {
  lat: number;
  lng: number;
};

const pickIcon = L.divIcon({
  className: "intersection-connect-pick-icon",
  html: `
    <div style="
      width: 22px;
      height: 22px;
      border-radius: 999px;
      background: rgba(239,68,68,0.96);
      border: 3px solid rgba(255,255,255,0.96);
      box-shadow: 0 0 0 4px rgba(239,68,68,0.28), 0 8px 18px rgba(0,0,0,0.35);
    "></div>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function fmtCoord(n: number) {
  return Number(n).toFixed(7);
}

function arrLen(v: any) {
  return Array.isArray(v) ? v.length : 0;
}

function getCandidatesCount(result: ConnectIntersectionResult | null) {
  if (!result) return 0;

  if (typeof result.candidates_found === "number") {
    return result.candidates_found;
  }

  return Math.max(arrLen(result.selected_pipes), arrLen(result.selected_targets));
}

function resultIsEnough(result: ConnectIntersectionResult | null) {
  if (!result) return false;

  const selected = Math.max(arrLen(result.selected_pipes), arrLen(result.selected_targets));
  const candidates = getCandidatesCount(result);

  return selected >= 2 || candidates >= 2;
}

function shortId(id: string) {
  if (!id) return "";
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function resultSummary(result: ConnectIntersectionResult | null) {
  if (!result) return null;

  const candidates = getCandidatesCount(result);
  const selected = Math.max(arrLen(result.selected_pipes), arrLen(result.selected_targets));
  const createdNodes = result.created_nodes ?? 0;
  const splitCreated = result.split_pipes_created ?? arrLen(result.created_pipes);
  const inactivated = result.original_pipes_inactivated ?? 0;
  const endpointUpdated = result.endpoint_pipes_updated ?? 0;

  return {
    candidates,
    selected,
    createdNodes,
    splitCreated,
    inactivated,
    endpointUpdated,
  };
}

export default function IntersectionConnectTool({
  active,
  defaultToleranceM = 2,
  onCancel,
  onCreated,
}: Props) {
  const [point, setPoint] = React.useState<PickedPoint | null>(null);
  const [toleranceM, setToleranceM] = React.useState(defaultToleranceM);
  const [preview, setPreview] = React.useState<ConnectIntersectionResult | null>(null);
  const [busy, setBusy] = React.useState<"preview" | "apply" | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<ConnectIntersectionResult | null>(null);

  const summary = resultSummary(preview);
  const canApply = !!point && resultIsEnough(preview) && !busy;

  React.useEffect(() => {
    if (!active) {
      setPoint(null);
      setPreview(null);
      setErr(null);
      setDone(null);
      setBusy(null);
    }
  }, [active]);

  async function runPreview(nextPoint: PickedPoint = point as PickedPoint) {
    if (!nextPoint) return;

    setBusy("preview");
    setErr(null);
    setDone(null);

    try {
      const result = await previewPipesAtIntersection({
        lat: nextPoint.lat,
        lng: nextPoint.lng,
        tolerance_m: toleranceM,
      });

      setPreview(result);
    } catch (e: any) {
      setPreview(null);

      if (e?.status === 404 || e?.status === 405) {
        setErr(
          "El frontend ya está listo, pero falta crear el endpoint del backend: POST /mapa/mapasagua/connect-intersection."
        );
      } else {
        setErr(e?.message ?? "No se pudo analizar el cruce.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function applyIntersection() {
    if (!point) return;

    setBusy("apply");
    setErr(null);
    setDone(null);

    try {
      const result = await connectPipesAtIntersection({
        lat: point.lat,
        lng: point.lng,
        tolerance_m: toleranceM,
        apply: true,
      });

      setDone(result);
      setPreview(result);
      onCreated?.(result);
    } catch (e: any) {
      if (e?.status === 404 || e?.status === 405) {
        setErr(
          "El frontend ya está listo, pero falta crear el endpoint del backend: POST /mapa/mapasagua/connect-intersection."
        );
      } else {
        setErr(e?.message ?? "No se pudo crear la conexión en el cruce.");
      }
    } finally {
      setBusy(null);
    }
  }

  useMapEvents({
    click(e: any) {
      if (!active) return;

      try {
        e?.originalEvent?.preventDefault?.();
        e?.originalEvent?.stopPropagation?.();
      } catch {}

      const nextPoint = {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      };

      setPoint(nextPoint);
      setPreview(null);
      setErr(null);
      setDone(null);

      runPreview(nextPoint);
    },
  });

  if (!active) return null;

  return (
    <>
      <style>
        {`
          .intersection-connect-pick-icon {
            background: transparent !important;
            border: 0 !important;
          }

          .intersection-connect-popup .leaflet-popup-content-wrapper {
            border-radius: 16px;
            background: rgba(15,23,42,0.94);
            color: white;
            box-shadow: 0 18px 50px rgba(0,0,0,0.42);
            border: 1px solid rgba(255,255,255,0.14);
          }

          .intersection-connect-popup .leaflet-popup-tip {
            background: rgba(15,23,42,0.94);
          }
        `}
      </style>

      {point && (
        <Marker position={[point.lat, point.lng]} icon={pickIcon} interactive={true}>
          <Popup
            className="intersection-connect-popup"
            closeButton={false}
            autoClose={false}
            closeOnClick={false}
          >
            <div style={{ width: 310, display: "grid", gap: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900 }}>Conectar cañerías en cruce</div>
                <div style={{ fontSize: 11, opacity: 0.76, marginTop: 2 }}>
                  Tocaste: {fmtCoord(point.lat)}, {fmtCoord(point.lng)}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <label style={{ fontSize: 12, opacity: 0.82 }}>
                  Tolerancia de búsqueda
                </label>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number"
                    min={0.2}
                    max={20}
                    step={0.5}
                    value={toleranceM}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setToleranceM(Number.isFinite(n) ? n : defaultToleranceM);
                    }}
                    style={{
                      width: 68,
                      padding: "7px 8px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.2)",
                      background: "rgba(255,255,255,0.08)",
                      color: "#fff",
                      outline: "none",
                      fontWeight: 800,
                    }}
                  />
                  <span style={{ fontSize: 12, opacity: 0.8 }}>m</span>
                </div>
              </div>

              {busy === "preview" && (
                <div
                  style={{
                    padding: 9,
                    borderRadius: 12,
                    background: "rgba(59,130,246,0.18)",
                    border: "1px solid rgba(147,197,253,0.24)",
                    fontSize: 12,
                    fontWeight: 750,
                  }}
                >
                  Buscando cañerías cercanas…
                </div>
              )}

              {preview && (
                <div
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    background: resultIsEnough(preview)
                      ? "rgba(34,197,94,0.16)"
                      : "rgba(245,158,11,0.16)",
                    border: resultIsEnough(preview)
                      ? "1px solid rgba(134,239,172,0.25)"
                      : "1px solid rgba(252,211,77,0.28)",
                    display: "grid",
                    gap: 5,
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 900 }}>
                    {resultIsEnough(preview)
                      ? "Cruce detectado"
                      : "Todavía no hay suficientes cañerías"}
                  </div>

                  <div>
                    Candidatas encontradas: <b>{summary?.candidates ?? 0}</b>
                  </div>

                  <div>
                    Cañerías seleccionadas: <b>{summary?.selected ?? 0}</b>
                  </div>

                  {preview.node_id && (
                    <div>
                      Nodo: <b>{shortId(preview.node_id)}</b>
                    </div>
                  )}

                  {(preview.selected_pipes?.length ?? 0) > 0 && (
                    <div style={{ opacity: 0.82 }}>
                      Pipes: {preview.selected_pipes!.slice(0, 4).map(shortId).join(", ")}
                      {preview.selected_pipes!.length > 4 ? "…" : ""}
                    </div>
                  )}

                  {done && (
                    <>
                      <div style={{ height: 1, background: "rgba(255,255,255,0.14)", margin: "3px 0" }} />

                      <div>
                        Nodos creados: <b>{summary?.createdNodes ?? 0}</b>
                      </div>

                      <div>
                        Tramos creados: <b>{summary?.splitCreated ?? 0}</b>
                      </div>

                      <div>
                        Originales inactivadas: <b>{summary?.inactivated ?? 0}</b>
                      </div>

                      <div>
                        Extremos actualizados: <b>{summary?.endpointUpdated ?? 0}</b>
                      </div>
                    </>
                  )}

                  {!resultIsEnough(preview) && (
                    <div style={{ color: "#fde68a", fontWeight: 750 }}>
                      Probá aumentar la tolerancia o tocar más cerca del cruce.
                    </div>
                  )}
                </div>
              )}

              {err && (
                <div
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    background: "rgba(220,38,38,0.18)",
                    border: "1px solid rgba(252,165,165,0.28)",
                    color: "#fecaca",
                    fontSize: 12,
                    fontWeight: 750,
                    lineHeight: 1.35,
                  }}
                >
                  {err}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCancel();
                  }}
                  disabled={!!busy}
                  style={{
                    padding: "9px 11px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.08)",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: busy ? "not-allowed" : "pointer",
                    opacity: busy ? 0.65 : 1,
                  }}
                >
                  Salir
                </button>

                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    runPreview();
                  }}
                  disabled={!!busy || !point}
                  style={{
                    padding: "9px 11px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(59,130,246,0.88)",
                    color: "#fff",
                    fontWeight: 850,
                    cursor: busy || !point ? "not-allowed" : "pointer",
                    opacity: busy || !point ? 0.65 : 1,
                  }}
                >
                  {busy === "preview" ? "Probando…" : "Probar"}
                </button>

                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    applyIntersection();
                  }}
                  disabled={!canApply || busy === "apply"}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 12,
                    border: "none",
                    background: canApply ? "rgba(34,197,94,0.94)" : "rgba(148,163,184,0.5)",
                    color: "#fff",
                    fontWeight: 900,
                    cursor: canApply && busy !== "apply" ? "pointer" : "not-allowed",
                    opacity: busy === "apply" ? 0.65 : 1,
                  }}
                >
                  {busy === "apply" ? "Conectando…" : "Crear conexión"}
                </button>
              </div>

              <div style={{ fontSize: 11, opacity: 0.72, lineHeight: 1.35 }}>
                Esto debe partir las cañerías cercanas y crear/reutilizar un nodo común en el cruce.
              </div>
            </div>
          </Popup>
        </Marker>
      )}

      {!point && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 18,
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "rgba(15,23,42,0.92)",
            color: "#fff",
            padding: "10px 14px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 16px 42px rgba(0,0,0,0.34)",
            fontSize: 13,
            fontWeight: 800,
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span>Tocá el cruce de cañerías para conectar</span>

          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }}
            style={{
              padding: "6px 9px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              fontWeight: 850,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
        </div>
      )}
    </>
  );
}