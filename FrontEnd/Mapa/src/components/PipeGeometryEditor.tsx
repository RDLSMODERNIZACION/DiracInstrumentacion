import React from "react";
import type L from "leaflet";
import { patchPipeGeometry, fetchPipeById } from "../services/mapasagua";

type Props = {
  pipeId: string | null;
  pipeLayer: L.Layer | null;

  onSaved?: (feature: any) => void;
  onCancelled?: () => void;
};

export default function PipeGeometryEditor({
  pipeId,
  pipeLayer,
  onSaved,
  onCancelled,
}: Props) {
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const canEdit = !!pipeId && !!pipeLayer;

  // deshabilita edición si cambia de cañería
  React.useEffect(() => {
    setEditing(false);
  }, [pipeId]);

  const enableEdit = () => {
    if (!canEdit) return;
    const anyLayer: any = pipeLayer;

    // requiere leaflet-geoman cargado: layer.pm.enable()
    if (!anyLayer?.pm) {
      alert("Leaflet-Geoman no está cargado (layer.pm). Revisá los imports en main.tsx.");
      return;
    }

    anyLayer.pm.enable({
      allowSelfIntersection: false,
    });
    setEditing(true);
  };

  const cancelEdit = async () => {
    if (!pipeId || !pipeLayer) return;
    const anyLayer: any = pipeLayer;

    try {
      // desactiva edición
      if (anyLayer?.pm?.enabled()) anyLayer.pm.disable();
    } catch {}

    // recarga geometría desde backend y reemplaza la layer
    setBusy(true);
    try {
      const fresh = await fetchPipeById(pipeId);
      const g = fresh?.geometry;
      if (g) {
        // reemplazar geometría en layer
        // GeoJSON layer de Leaflet suele tener setLatLngs para polylines
        const coords = g.coordinates;
        if (anyLayer?.setLatLngs && Array.isArray(coords)) {
          // coords vienen [lng,lat] -> leaflet quiere [lat,lng]
          const latlngs = coords.map((c: any) => [c[1], c[0]]);
          anyLayer.setLatLngs(latlngs);
        }
      }
    } catch (e) {
      console.warn("cancelEdit reload error:", e);
    } finally {
      setBusy(false);
      setEditing(false);
      onCancelled?.();
    }
  };

  const saveEdit = async () => {
    if (!pipeId || !pipeLayer) return;
    const anyLayer: any = pipeLayer;

    setBusy(true);
    try {
      // tomar geojson de la layer editada
      const gj = anyLayer.toGeoJSON?.();
      const geom = gj?.geometry;
      if (!geom) throw new Error("No se pudo leer geometry desde layer.toGeoJSON()");

      const updated = await patchPipeGeometry(pipeId, geom);

      // desactiva edición
      try {
        if (anyLayer?.pm?.enabled()) anyLayer.pm.disable();
      } catch {}

      setEditing(false);
      onSaved?.(updated);
    } catch (e: any) {
      alert(e?.message ?? "Error guardando geometría");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (!pipeId) return null;

  return (
    <div className="fixed left-4 bottom-4 z-[9999] bg-white shadow-xl rounded-lg p-3 flex gap-2 items-center">
      <div className="text-xs opacity-70">
        Pipe: <span className="font-mono">{pipeId.slice(0, 8)}</span>
      </div>

      {!editing ? (
        <button
          disabled={!canEdit || busy}
          onClick={enableEdit}
          className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-40"
        >
          Editar recorrido
        </button>
      ) : (
        <>
          <button
            disabled={busy}
            onClick={saveEdit}
            className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm disabled:opacity-40"
          >
            Guardar
          </button>
          <button
            disabled={busy}
            onClick={cancelEdit}
            className="px-3 py-1.5 rounded border text-sm disabled:opacity-40"
          >
            Cancelar
          </button>
        </>
      )}
    </div>
  );
}
