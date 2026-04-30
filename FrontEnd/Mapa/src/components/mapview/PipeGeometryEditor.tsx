import React from "react";
import L from "leaflet";
import { createPortal } from "react-dom";
import { patchPipeGeometry, fetchPipeById } from "../../services/mapasagua";

type Props = {
  open: boolean;
  pipeId: string | null;
  pipeLayer: L.Layer | null;

  /**
   * Importante:
   * Se usa para reconstruir una polilínea editable desde la geometría real.
   * Así no dependemos de que el layer GeoJSON original sea editable.
   */
  pipeFeature?: any | null;

  onClose: () => void;
  onSaved?: (feature: any) => void;
};

const DBG = false;

function dbg(...args: any[]) {
  if (DBG) console.log(...args);
}

type SupportedGeometry =
  | {
      type: "LineString";
      coordinates: any[];
    }
  | {
      type: "MultiLineString";
      coordinates: any[];
    };

function isSupportedGeometry(geom: any): geom is SupportedGeometry {
  return (
    geom &&
    (geom.type === "LineString" || geom.type === "MultiLineString") &&
    Array.isArray(geom.coordinates)
  );
}

function coordToLatLng(c: any): [number, number] | null {
  if (!Array.isArray(c) || c.length < 2) return null;

  const lng = Number(c[0]);
  const lat = Number(c[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return [lat, lng];
}

function latLngsFromGeometry(geom: SupportedGeometry): any {
  if (geom.type === "LineString") {
    return geom.coordinates.map(coordToLatLng).filter(Boolean);
  }

  return geom.coordinates
    .map((seg: any[]) => seg.map(coordToLatLng).filter(Boolean))
    .filter((seg: any[]) => seg.length >= 2);
}

function countCoordsFromGeometry(geom: any): number {
  if (!isSupportedGeometry(geom)) return 0;

  if (geom.type === "LineString") {
    return Array.isArray(geom.coordinates) ? geom.coordinates.length : 0;
  }

  return geom.coordinates.reduce((acc: number, seg: any[]) => {
    return acc + (Array.isArray(seg) ? seg.length : 0);
  }, 0);
}

function countLatLngs(latlngs: any): number {
  if (!Array.isArray(latlngs)) return 0;

  if (latlngs.length && typeof latlngs[0]?.lat === "number") {
    return latlngs.length;
  }

  if (
    latlngs.length &&
    Array.isArray(latlngs[0]) &&
    latlngs[0].length &&
    typeof latlngs[0][0]?.lat === "number"
  ) {
    return latlngs.reduce((acc, seg) => acc + seg.length, 0);
  }

  return latlngs.reduce((acc, x) => acc + countLatLngs(x), 0);
}

function resolveEditableLayer(layer: any): any | null {
  if (!layer) return null;

  if (layer.pm && typeof layer.getLatLngs === "function") return layer;

  if (typeof layer.getLayers === "function") {
    const kids = layer.getLayers?.() ?? [];

    for (const k of kids) {
      const found = resolveEditableLayer(k);
      if (found) return found;
    }
  }

  return null;
}

function resolveMapFromLayer(layer: any): L.Map | null {
  if (!layer) return null;

  if (layer._map) return layer._map as L.Map;

  if (typeof layer.getLayers === "function") {
    const kids = layer.getLayers?.() ?? [];

    for (const k of kids) {
      const m = resolveMapFromLayer(k);
      if (m) return m;
    }
  }

  return null;
}

function disablePmSafely(layer: any) {
  try {
    if (layer?.pm?.enabled?.()) {
      layer.pm.disable();
    }
  } catch {}
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
      childCount: typeof layer?.getLayers === "function" ? layer.getLayers()?.length ?? 0 : 0,
      hasMap: !!layer?._map,
    };
  } catch (e) {
    return { err: String(e) };
  }
}

function applyGeometryToLayer(layer: any, geom: any) {
  if (!layer || !geom) return false;

  if (typeof layer.setLatLngs === "function" && isSupportedGeometry(geom)) {
    const latlngs = latLngsFromGeometry(geom);
    layer.setLatLngs(latlngs);
    return true;
  }

  if (typeof layer.getLayers === "function") {
    const kids = layer.getLayers?.() ?? [];

    for (const k of kids) {
      const ok = applyGeometryToLayer(k, geom);
      if (ok) return true;
    }
  }

  return false;
}

function getGeometryFromLayer(layer: any): any | null {
  try {
    const gj = layer?.toGeoJSON?.();
    return gj?.geometry ?? null;
  } catch {
    return null;
  }
}

function cleanGeometryForSave(geom: any): SupportedGeometry {
  if (!isSupportedGeometry(geom)) {
    throw new Error("La geometría editada no es LineString ni MultiLineString.");
  }

  if (geom.type === "LineString") {
    const coords = geom.coordinates.filter((c: any) => {
      return (
        Array.isArray(c) &&
        c.length >= 2 &&
        Number.isFinite(Number(c[0])) &&
        Number.isFinite(Number(c[1]))
      );
    });

    if (coords.length < 2) {
      throw new Error("La cañería debe tener al menos dos vértices.");
    }

    return {
      type: "LineString",
      coordinates: coords,
    };
  }

  const segments = geom.coordinates
    .map((seg: any[]) =>
      Array.isArray(seg)
        ? seg.filter((c: any) => {
            return (
              Array.isArray(c) &&
              c.length >= 2 &&
              Number.isFinite(Number(c[0])) &&
              Number.isFinite(Number(c[1]))
            );
          })
        : []
    )
    .filter((seg: any[]) => seg.length >= 2);

  if (!segments.length) {
    throw new Error("La cañería debe tener al menos un tramo con dos vértices.");
  }

  return {
    type: "MultiLineString",
    coordinates: segments,
  };
}

export default function PipeGeometryEditor({
  open,
  pipeId,
  pipeLayer,
  pipeFeature,
  onClose,
  onSaved,
}: Props) {
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [vertexCount, setVertexCount] = React.useState(0);
  const [geometryType, setGeometryType] = React.useState<string | null>(null);

  const editLayerRef = React.useRef<L.Polyline | null>(null);
  const mapRef = React.useRef<L.Map | null>(null);

  const portalTarget = React.useMemo(() => {
    if (typeof document === "undefined") return null;
    return document.body;
  }, []);

  const canPrepare = !!pipeId && !!pipeLayer;

  const cleanupTempLayer = React.useCallback(() => {
    const editLayer = editLayerRef.current;

    if (editLayer) {
      disablePmSafely(editLayer);

      try {
        editLayer.remove();
      } catch {}
    }

    editLayerRef.current = null;
    setEditing(false);
  }, []);

  React.useEffect(() => {
    if (!open) {
      cleanupTempLayer();

      setBusy(false);
      setErr(null);
      setVertexCount(0);
      setGeometryType(null);

      const base = resolveEditableLayer(pipeLayer as any);
      disablePmSafely(base);

      dbg("[GEOM] close/reset", {
        pipeId,
        pipeLayer: layerInfo(pipeLayer as any),
        base: layerInfo(base),
      });
    }
  }, [open, pipeLayer, pipeId, cleanupTempLayer]);

  React.useEffect(() => {
    return () => {
      cleanupTempLayer();
    };
  }, [cleanupTempLayer]);

  async function loadGeometry(): Promise<SupportedGeometry> {
    const fromFeature = pipeFeature?.geometry;

    if (isSupportedGeometry(fromFeature)) {
      return fromFeature;
    }

    if (!pipeId) {
      throw new Error("No hay pipeId para cargar geometría.");
    }

    const fresh = await fetchPipeById(pipeId);
    const freshGeom = fresh?.geometry;

    if (isSupportedGeometry(freshGeom)) {
      return freshGeom;
    }

    throw new Error("No se encontró una geometría editable para esta cañería.");
  }

  async function enableEdit() {
    if (!pipeId) return;
    if (busy) return;

    setBusy(true);
    setErr(null);

    try {
      cleanupTempLayer();

      const map = resolveMapFromLayer(pipeLayer as any);

      if (!map) {
        throw new Error(
          "No se pudo obtener el mapa desde la capa seleccionada. Cerrá el editor, seleccioná otra vez la cañería y volvé a intentar."
        );
      }

      mapRef.current = map;

      const geom = await loadGeometry();

      if (!isSupportedGeometry(geom)) {
        throw new Error("La geometría no es editable. Solo se admite LineString o MultiLineString.");
      }

      const latlngs = latLngsFromGeometry(geom);
      const n = countCoordsFromGeometry(geom);

      if (n < 2) {
        throw new Error("La cañería tiene menos de dos vértices.");
      }

      const editableLine = L.polyline(latlngs, {
        color: "#ffffff",
        weight: 9,
        opacity: 0.95,
        dashArray: "8 8",
        lineCap: "round",
        lineJoin: "round",
        pane: "overlayPane",
      });

      editableLine.addTo(map);
      editableLine.bringToFront();

      editLayerRef.current = editableLine;
      setVertexCount(n);
      setGeometryType(geom.type);

      const bounds = editableLine.getBounds?.();

      if (bounds?.isValid?.()) {
        try {
          map.fitBounds(bounds, {
            padding: [80, 80],
            maxZoom: 19,
          });
        } catch {}
      }

      if (!editableLine.pm) {
        throw new Error(
          "Leaflet-Geoman no está disponible en esta línea. Revisá que leaflet-geoman esté cargado en el proyecto."
        );
      }

      const heavy = n >= 1200;

      editableLine.pm.enable({
        allowSelfIntersection: false,
        snappable: true,
        snapDistance: 12,
        hideMiddleMarkers: false,
        limitMarkersToZoom: heavy ? 18 : undefined,
      } as any);

      setEditing(true);

      dbg("[GEOM] edit temp layer OK", {
        pipeId,
        geometryType: geom.type,
        vertexCount: n,
        heavy,
        layer: layerInfo(editableLine),
      });
    } catch (e: any) {
      cleanupTempLayer();
      setErr(e?.message ?? "No se pudo activar la edición del recorrido.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelEdit() {
    if (busy) return;

    cleanupTempLayer();
    setErr(null);
    onClose();
  }

  async function saveEdit() {
    if (!pipeId) return;
    if (busy) return;

    const editLayer = editLayerRef.current;

    if (!editLayer) {
      setErr("No hay una línea editable activa.");
      return;
    }

    setBusy(true);
    setErr(null);

    try {
      const rawGeom = getGeometryFromLayer(editLayer);
      const geom = cleanGeometryForSave(rawGeom);

      const updated = await patchPipeGeometry(pipeId, geom);

      const updatedGeom = updated?.geometry ?? geom;

      const originalBase = resolveEditableLayer(pipeLayer as any);

      if (updatedGeom) {
        applyGeometryToLayer(originalBase, updatedGeom);
        applyGeometryToLayer(pipeLayer as any, updatedGeom);
      }

      cleanupTempLayer();

      setEditing(false);
      setErr(null);

      onSaved?.(updated);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Error guardando geometría.");
    } finally {
      setBusy(false);
    }
  }

  const C = {
    overlay: "rgba(2,6,23,0.18)",
    surface: "#ffffff",
    text: "#0f172a",
    muted: "rgba(15,23,42,0.65)",
    border: "rgba(15,23,42,0.14)",
    primary: "#2563eb",
    danger: "#dc2626",
  };

  if (!open || !pipeId || !portalTarget) return null;

  const panel = (
    <div style={{ position: "fixed", inset: 0, zIndex: 999999, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: C.overlay }} />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 18,
          transform: "translateX(-50%)",
          width: "min(760px, calc(100% - 24px))",
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
              <div style={{ fontSize: 18, fontWeight: 850 }}>Editar recorrido</div>

              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                Pipe: {pipeId.slice(0, 8)}…
                {geometryType ? ` · ${geometryType}` : ""}
                {vertexCount ? ` · Vértices: ${vertexCount}` : ""}
              </div>
            </div>

            <button
              onClick={busy ? undefined : cancelEdit}
              disabled={busy}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: "#fff",
                fontSize: 18,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.65 : 1,
              }}
              title="Cerrar"
            >
              ×
            </button>
          </div>

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
                  fontWeight: 650,
                }}
              >
                {err}
              </div>
            )}

            {!editing && (
              <div
                style={{
                  background: "#EFF6FF",
                  border: "1px solid #BFDBFE",
                  color: "#1E3A8A",
                  padding: 10,
                  borderRadius: 10,
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                Al tocar <b>Editar recorrido</b>, se crea una línea blanca temporal arriba de la
                cañería. Esa línea sí muestra los vértices aunque la cañería original sea GeoJSON o
                MultiLineString.
              </div>
            )}

            {editing && (
              <div
                style={{
                  background: "#ECFDF5",
                  border: "1px solid #BBF7D0",
                  color: "#166534",
                  padding: 10,
                  borderRadius: 10,
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                Mové los vértices blancos sobre el mapa. También podés usar los puntos intermedios
                para agregar nuevos vértices. Cuando termines, tocá <b>Guardar</b>.
              </div>
            )}

            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
              El panel no bloquea el mapa: podés hacer zoom o mover la vista mientras editás.
              <br />
              Si no ves vértices, acercate más al tramo y verificá que la simulación esté apagada.
            </div>
          </div>

          <div
            style={{
              padding: 14,
              borderTop: `1px solid ${C.border}`,
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {!editing ? (
              <>
                <button
                  onClick={cancelEdit}
                  disabled={busy}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: `1px solid ${C.border}`,
                    background: "#fff",
                    fontWeight: 650,
                    cursor: busy ? "not-allowed" : "pointer",
                    opacity: busy ? 0.7 : 1,
                  }}
                >
                  Cerrar
                </button>

                <button
                  onClick={enableEdit}
                  disabled={!canPrepare || busy}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 12,
                    border: "none",
                    background: C.primary,
                    color: "#fff",
                    fontWeight: 850,
                    cursor: !canPrepare || busy ? "not-allowed" : "pointer",
                    opacity: !canPrepare || busy ? 0.7 : 1,
                  }}
                >
                  {busy ? "Preparando…" : "Editar recorrido"}
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
                    fontWeight: 650,
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
                    border: "none",
                    background: C.primary,
                    color: "#fff",
                    fontWeight: 850,
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