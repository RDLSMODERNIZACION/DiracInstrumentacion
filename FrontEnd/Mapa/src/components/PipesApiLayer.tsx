import React from "react";
import { GeoJSON, useMap } from "react-leaflet";
import type L from "leaflet";

import { fetchPipesBBox } from "../services/mapasagua";

type Props = {
  onSelect: (featureId: string) => void;
};

export default function PipesApiLayer({ onSelect }: Props) {
  const map = useMap();
  const [data, setData] = React.useState<any>(null);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const b = map.getBounds();
        const json = await fetchPipesBBox({
          min_lng: b.getWest(),
          min_lat: b.getSouth(),
          max_lng: b.getEast(),
          max_lat: b.getNorth(),
        });

        if (!cancelled) setData(json);
        // Debug opcional:
        // console.log("pipes loaded:", json?.features?.length ?? 0);
      } catch (e: any) {
        console.warn("PipesApiLayer load error:", e?.message ?? e);
      }
    };

    load();
    map.on("moveend", load);
    map.on("zoomend", load);

    return () => {
      cancelled = true;
      map.off("moveend", load);
      map.off("zoomend", load);
    };
  }, [map]);

  if (!data) return null;

  return (
    <GeoJSON
      data={data}
      style={(feature) => {
        const s = (feature?.properties as any)?.style ?? {};
        return {
          color: s.color ?? "rgba(37, 99, 235, 0.85)",
          weight: s.weight ?? 3,
          opacity: s.opacity ?? 0.65,
        } as L.PathOptions;
      }}
      onEachFeature={(feature, layer) => {
        layer.on("click", () => {
          if (feature?.id) onSelect(String(feature.id));
        });
      }}
    />
  );
}
