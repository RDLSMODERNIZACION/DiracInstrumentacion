// src/components/mapview/view/MapRefCapture.tsx

import React from "react";
import type L from "leaflet";
import { useMap } from "react-leaflet";

export default function MapRefCapture({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();

  React.useEffect(() => {
    onReady(map);
  }, [map, onReady]);

  return null;
}
