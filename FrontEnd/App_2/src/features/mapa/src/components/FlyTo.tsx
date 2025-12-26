import { useEffect } from "react";
import { useMap } from "react-leaflet";
import { type LatLng } from "../lib/geo";

export function FlyTo({ target }: { target: LatLng | null }) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;
    map.flyTo(target, Math.max(map.getZoom(), 14.8), { duration: 0.7 });
  }, [target, map]);

  return null;
}
