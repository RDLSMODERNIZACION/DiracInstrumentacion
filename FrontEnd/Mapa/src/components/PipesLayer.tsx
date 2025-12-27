// src/components/PipesLayer.tsx
import React from "react";
import { GeoJSON, useMap } from "react-leaflet";
import type L from "leaflet";

import { fetchPipesBBox, fetchPipesAll } from "../services/mapasagua";

type Props = {
  visible?: boolean;

  /** Si true, usa bbox del mapa (recomendado). Si false, trae todo (debug). */
  useBBox?: boolean;

  /** ms de debounce para move/zoom */
  debounceMs?: number;

  /** callback cuando el usuario clickea una cañería */
  onSelect?: (pipeId: string) => void;

  /** callback opcional con la cantidad de features cargadas */
  onCount?: (n: number) => void;

  /**
   * Si querés forzar estilo fijo, pasalo acá.
   * Si no, usa properties.style si viene desde backend, o un default.
   */
  styleFn?: (feature: any) => L.PathOptions;
};

export default function PipesLayer({
  visible = true,
  useBBox = true,
  debounceMs = 300,
  onSelect,
  onCount,
  styleFn,
}: Props) {
  const map = useMap();
  const [data, setData] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    let t: any = null;

    const load = async () => {
      try {
        setError(null);

        const json = useBBox
          ? await fetchPipesBBox({
              min_lng: map.getBounds().getWest(),
              min_lat: map.getBounds().getSouth(),
              max_lng: map.getBounds().getEast(),
              max_lat: map.getBounds().getNorth(),
            })
          : await fetchPipesAll();

        if (cancelled) return;

        setData(json);
        const n = Array.isArray(json?.features) ? json.features.length : 0;
        onCount?.(n);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? String(e));
      }
    };

    const debouncedLoad = () => {
      if (!useBBox) return; // si es ALL, no recargar en move/zoom
      if (t) clearTimeout(t);
      t = setTimeout(load, debounceMs);
    };

    // carga inicial
    load();

    // recargas por movimiento/zoom
    map.on("moveend", debouncedLoad);
    map.on("zoomend", debouncedLoad);

    return () => {
      cancelled = true;
      map.off("moveend", debouncedLoad);
      map.off("zoomend", debouncedLoad);
      if (t) clearTimeout(t);
    };
  }, [visible, useBBox, debounceMs, map, onCount]);

  if (!visible) return null;

  if (error) {
    console.warn("PipesLayer error:", error);
    return null;
  }
  if (!data) return null;

  const defaultStyle: (feature: any) => L.PathOptions = (feature) => {
    const s = (feature?.properties as any)?.style ?? {};
    return {
      color: s.color ?? "#2563eb",
      weight: s.weight ?? 3,
      opacity: s.opacity ?? 0.85,
    };
  };

  return (
    <GeoJSON
      data={data}
      style={styleFn ?? defaultStyle}
      onEachFeature={(feature, layer) => {
        layer.on("click", () => {
          const id = feature?.id != null ? String(feature.id) : null;
          // debug
          // console.log("PIPE feature:", feature);
          if (id && onSelect) onSelect(id);
        });
      }}
    />
  );
}
