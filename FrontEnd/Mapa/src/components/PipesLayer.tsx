// src/components/PipesLayer.tsx
import React from "react";
import { GeoJSON } from "react-leaflet";

type Props = {
  url?: string;        // por defecto /data/canerias.geojson
  visible?: boolean;
};

export default function PipesLayer({ url = "/data/canerias.geojson", visible = true }: Props) {
  const [data, setData] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`No se pudo cargar ${url} (${r.status})`);
        return r.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [url, visible]);

  if (!visible) return null;
  if (error) {
    console.warn("PipesLayer error:", error);
    return null;
  }
  if (!data) return null;

  return (
    <GeoJSON
      data={data}
      style={() => ({
        color: "#2563eb",
        weight: 3,
        opacity: 0.9,
      })}
      onEachFeature={(feature, layer) => {
        layer.on("click", () => {
          console.log("PIPE props:", feature?.properties);
        });
      }}
    />
  );
}
