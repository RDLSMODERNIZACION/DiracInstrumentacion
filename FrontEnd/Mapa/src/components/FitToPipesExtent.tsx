import React from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { fetchPipesExtent } from "../services/mapasagua";

export default function FitToPipesExtent({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const did = React.useRef(false);

  React.useEffect(() => {
    if (!enabled) return;
    if (did.current) return;

    let cancelled = false;

    (async () => {
      try {
        const ex = await fetchPipesExtent();
        if (cancelled) return;

        if (
          ex?.min_lng == null ||
          ex?.min_lat == null ||
          ex?.max_lng == null ||
          ex?.max_lat == null
        ) {
          console.warn("[mapasagua] extent vacío, no fitBounds");
          return;
        }

        did.current = true;

        const bounds = L.latLngBounds(
          [ex.min_lat, ex.min_lng],
          [ex.max_lat, ex.max_lng]
        );

        map.fitBounds(bounds, { padding: [60, 60] });
      } catch (e: any) {
        console.warn("FitToPipesExtent error:", e?.message ?? e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, map]);

  return null;
}
