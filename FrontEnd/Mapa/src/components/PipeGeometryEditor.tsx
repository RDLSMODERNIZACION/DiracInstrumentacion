import React from "react";
import type L from "leaflet";
import { createPortal } from "react-dom";
import { patchPipeGeometry, fetchPipeById } from "../services/mapasagua";

type Props = {
  open: boolean;
  pipeId: string | null;
  pipeLayer: L.Layer | null;
  onClose: () => void;
  onSaved?: (feature: any) => void;
};

/** ✅ Debug on/off (solo consola) */
const DBG = true;

function dbg(...args: any[]) {
  if (DBG) console.log(...args);
}

function resolveEditableLayer(layer: any): any | null {
  if (!layer) return null;

  // Caso simple: el layer tiene geoman
  if (layer.pm) return layer;

  // Caso MultiLineString / LayerGroup: buscar sublayer con pm
  if (typeof layer.getLayers === "function") {
    const kids = layer.getLayers?.() ?? [];
    for (const k of kids) {
      if (k?.pm) return k;
    }
  }

  return null;
}

/** Cuenta puntos (LineString o MultiLineString en latlngs) */
function countLatLngs(latlngs: any): number {
  if (!Array.isArray(latlngs)) return 0;

  // LineString => [LatLng...]
  if (latlngs.length && typeof latlngs[0]?.lat === "number") return latlngs.length;

  // MultiLine => [[LatLng...], [LatLng...]]
  return latlngs.reduce((acc, x) => acc + countLatLngs(x), 0);
}

function layerInfo(layer: any) {
  try {
    const latlngs = layer?.getLatLngs?.();
    return {
      layerType: layer?.constructor?.name,
      hasPm: !!layer?.pm,
      pmEnabled: typeof layer?.pm?.enabled === "function" ? layer.pm.enabled() : undefined,
      hasToGeoJSON: typeof layer?.toGeoJSON === "function",
      hasSetLatLngs: typeof layer?.setLatLngs === "function",
      hasGetLatLngs: typeof layer?.getLatLngs === "function",
      vertexCount: latlngs ? countLatLngs(latlngs) : 0,
      hasGetLayers: typeof layer?.getLayers === "function",
      childCount: typeof layer?.getLayers === "function" ? (layer.getLayers()?.length ?? 0) : 0,
    };
  } catch (e) {
    return { err: String(e) };
  }
}

function applyGeometryToLayer(layer: any, geom: any) {
  if (!layer?.setLatLngs || !geom) return;

  if (geom.type === "LineString" && Array.isArray(geom.coordinates)) {
    const latlngs = geom.coordinates.map((c: any) => [c[1], c[0]]);
    layer.setLatLngs(latlngs);
    return;
  }

  if (geom.type === "MultiLineString" && Array.isArray(geom.coordinates)) {
    const latlngs = geom.coordinates.map((seg: any[]) => seg.map((c: any) => [c[1], c[0]]));
    layer.setLatLngs(latlngs);
    return;
  }
}

export default function PipeGeometryEditor({
  open,
  pipeId,
  pipeLayer,
  onClose,
  onSaved,
}: Props) {
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const portalTarget = React.useMemo(() => {
    if (typeof document === "undefined") return null;
    return document.body;
  }, []);

  const canEdit = !!pipeId && !!pipeLayer;

  React.useEffect(() => {
    if (!open) {
      setEditing(false);
      setBusy(false);
      setErr(null);

      const base = resolveEditableLayer(pipeLayer as any);
      try {
        if (base?.pm?.enabled?.()) base.pm.disable();
      } catch {}

      // ✅ log de cierre
      if (DBG) dbg("[GEOM] close/reset", { pipeId, pipeLayer: layerInfo(pipeLayer as any), base: layerInfo(base) });
    }
  }, [open, pipeLayer, pipeId]);

  if (!open || !pipeId || !portalTarget) return null;

  const enableEdit = () => {
    if (!canEdit) return;

    const base = resolveEditableLayer(pipeLayer as any);

    // ✅ LOGS principales
    dbg("[GEOM] enableEdit requested", {
      pipeId,
      pipeLayer: layerInfo(pipeLayer as any),
      base: layerInfo(base),
    });

    if (!base?.pm) {
      setErr("No se puede editar este recorrido (layer sin Geoman / MultiLine sin soporte).");
      return;
    }

    // ✅ Si es troncal gigante, limitamos markers a zoom alto
    const vertexCount = layerInfo(base).vertexCount ?? 0;
    const heavy = vertexCount >= 800; // umbral práctico
    const pmOpts: any = {
      allowSelfIntersection: false,
      snappable: true,
      snapDistance: 10,
      // performance: en geometrías largas reduce markers
      hideMiddleMarkers: heavy ? true : false,
      limitMarkersToZoom: heavy ? 18 : undefined,
    };

    try {
      dbg("[GEOM] pm.enable()", { pipeId, vertexCount, heavy, pmOpts });
      base.pm.enable(pmOpts);
      setEditing(true);
      setErr(null);
      dbg("[GEOM] pm enabled OK", { pipeId });
    } catch (e: any) {
      dbg("[GEOM] pm enable FAILED", { pipeId, error: e });
      setErr(e?.message ?? "No se pudo activar edición");
    }
  };

  const cancelEdit = async () => {
    const base = resolveEditableLayer(pipeLayer as any);

    setBusy(true);
    try {
      dbg("[GEOM] cancelEdit", { pipeId, base: layerInfo(base) });

      try {
        if (base?.pm?.enabled?.()) base.pm.disable();
      } catch {}

      const fresh = await fetchPipeById(pipeId);
      dbg("[GEOM] cancel -> reloaded from DB", {
        pipeId,
        geometryType: fresh?.geometry?.type,
      });

      const g = fresh?.geometry;
      if (g) applyGeometryToLayer(base, g);

      setEditing(false);
      setErr(null);
      onClose();
    } catch (e: any) {
      dbg("[GEOM] cancel FAILED", { pipeId, error: e });
      setErr(e?.message ?? "No se pudo cancelar/recargar");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    const base = resolveEditableLayer(pipeLayer as any);
    if (!base) return;

    setBusy(true);
    try {
      dbg("[GEOM] saveEdit start", { pipeId, base: layerInfo(base) });

      const gj = base.toGeoJSON?.();
      const geom = gj?.geometry;
      if (!geom) throw new Error("No se pudo leer geometry desde layer.toGeoJSON()");

      dbg("[GEOM] toGeoJSON geometry", {
        pipeId,
        type: geom?.type,
        coordsLen:
          geom?.type === "LineString"
            ? geom?.coordinates?.length
            : geom?.type === "MultiLineString"
            ? geom?.coordinates?.length
            : null,
      });

      const updated = await patchPipeGeometry(pipeId, geom);

      dbg("[GEOM] saved OK (server)", {
        pipeId,
        returnedType: updated?.geometry?.type,
      });

      try {
        if (base?.pm?.enabled?.()) base.pm.disable();
      } catch {}

      const g2 = updated?.geometry;
      if (g2) applyGeometryToLayer(base, g2);

      setEditing(false);
      setErr(null);

      onSaved?.(updated);
      onClose();
    } catch (e: any) {
      dbg("[GEOM] save FAILED", { pipeId, error: e });
      setErr(e?.message ?? "Error guardando geometría");
    } finally {
      setBusy(false);
    }
  };

  const C = {
    // “sombra” visual pero NO bloquea clicks
    overlay: "rgba(2,6,23,0.18)",
    surface: "#ffffff",
    text: "#0f172a",
    muted: "rgba(15,23,42,0.65)",
    border: "rgba(15,23,42,0.14)",
    primary: "#2563eb",
  };

  const panel = (
    // ✅ IMPORTANTE: el contenedor NO captura clicks (deja tocar el mapa)
    <div style={{ position: "fixed", inset: 0, zIndex: 999999, pointerEvents: "none" }}>
      {/* Sombra visual (no bloquea) */}
      <div style={{ position: "absolute", inset: 0, background: C.overlay }} />

      {/* Panel flotante (este sí captura clicks) */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 18,
          transform: "translateX(-50%)",
          width: "min(720px, calc(100% - 24px))",
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            background: C.surface,
            color: C.text,
            borderRadius: 14,
            overflow: "hidden",
            border: `1px solid ${C.border}`,
            boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial',
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
              <div style={{ fontSize: 18, fontWeight: 800 }}>Editar recorrido</div>
              <div style={{ fontSize: 12, color: C.muted }}>
                Pipe: {pipeId.slice(0, 8)}… · Vértices:{" "}
                {(() => {
                  const base = resolveEditableLayer(pipeLayer as any);
                  const n = layerInfo(base).vertexCount ?? 0;
                  return n;
                })()}
              </div>
            </div>

            <button
              onClick={busy ? undefined : onClose}
              disabled={busy}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: "#fff",
                fontSize: 18,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: 16, display: "grid", gap: 12 }}>
            {err && (
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
                {err}
              </div>
            )}

            <div style={{ fontSize: 13, color: C.muted }}>
              Tip: tocá <b>Editar</b>, mové vértices en el mapa y luego <b>Guardar</b>.
              <br />
              Si es una troncal grande, acercate (zoom) para ver y mover puntos.
            </div>

            {!editing && (
              <div style={{ fontSize: 13, color: C.muted }}>
                (El panel no bloquea el mapa: podés pan/zoom mientras está abierto.)
              </div>
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
            {!editing ? (
              <>
                <button
                  onClick={onClose}
                  disabled={busy}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: `1px solid ${C.border}`,
                    background: "#fff",
                    fontWeight: 600,
                    cursor: busy ? "not-allowed" : "pointer",
                    opacity: busy ? 0.7 : 1,
                  }}
                >
                  Cerrar
                </button>

                <button
                  onClick={enableEdit}
                  disabled={!canEdit || busy}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 12,
                    background: C.primary,
                    color: "#fff",
                    fontWeight: 800,
                    cursor: !canEdit || busy ? "not-allowed" : "pointer",
                    opacity: !canEdit || busy ? 0.7 : 1,
                  }}
                >
                  Editar
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={cancelEdit}
                  disabled={busy}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: `1px solid ${C.border}`,
                    background: "#fff",
                    fontWeight: 600,
                    cursor: busy ? "not-allowed" : "pointer",
                    opacity: busy ? 0.7 : 1,
                  }}
                >
                  Cancelar
                </button>

                <button
                  onClick={saveEdit}
                  disabled={busy}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 12,
                    background: C.primary,
                    color: "#fff",
                    fontWeight: 800,
                    cursor: busy ? "not-allowed" : "pointer",
                    opacity: busy ? 0.7 : 1,
                  }}
                >
                  {busy ? "Guardando…" : "Guardar"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(panel, portalTarget);
}
