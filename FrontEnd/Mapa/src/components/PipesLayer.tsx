// src/components/PipesLayer.tsx
import React from "react";
import { GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";

import { fetchPipesBBox, fetchPipesAll } from "../services/mapasagua";

type Props = {
  visible?: boolean;
  useBBox?: boolean;
  debounceMs?: number;

  /** ✅ pasa id + layer + label (props.Layer) */
  onSelect?: (pipeId: string, layer: L.Layer, label?: string | null) => void;

  onCount?: (n: number) => void;

  /** para resaltar */
  selectedId?: string | null;

  styleFn?: (feature: any) => L.PathOptions;
};

function pickLabel(feature: any): string | null {
  // Tu caso: properties.props.Layer
  const a = feature?.properties?.props?.Layer;
  if (typeof a === "string" && a.trim()) return a.trim();

  // Fallbacks comunes
  const b = feature?.properties?.props?.layer;
  if (typeof b === "string" && b.trim()) return b.trim();

  const c = feature?.properties?.Layer;
  if (typeof c === "string" && c.trim()) return c.trim();

  const d = feature?.properties?.name;
  if (typeof d === "string" && d.trim()) return d.trim();

  return null;
}

export default function PipesLayer({
  visible = true,
  useBBox = true,
  debounceMs = 300,
  onSelect,
  onCount,
  selectedId = null,
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
      if (!useBBox) return;
      if (t) clearTimeout(t);
      t = setTimeout(load, debounceMs);
    };

    load();
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
    const isSel = selectedId != null && String(feature?.id) === String(selectedId);

    return {
      color: isSel ? "rgba(255,255,255,0.95)" : (s.color ?? "#2563eb"),
      weight: isSel ? 6 : (s.weight ?? 3),
      opacity: isSel ? 1.0 : (s.opacity ?? 0.85),
    };
  };

  return (
    <GeoJSON
      data={data}
      style={styleFn ?? defaultStyle}
      onEachFeature={(feature, layer) => {
        const id = feature?.id != null ? String(feature.id) : null;
        const label = pickLabel(feature);

        layer.on("click", (e: any) => {
          // ✅ clave: no dejar que el click burbujee al mapa
          try {
            L.DomEvent.stopPropagation(e);
          } catch {}

          if (!id) return;
          onSelect?.(id, layer, label);
        });
      }}
    />
  );
}
