import React from "react";
import { TileLayer } from "react-leaflet";

export default function ContourVisualLayer({
  visible,
  opacity = 0.68,
}: {
  visible: boolean;
  opacity?: number;
}) {
  if (!visible) return null;

  return (
    <TileLayer
      url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
      subdomains={["a", "b", "c"]}
      maxZoom={22}
      maxNativeZoom={17}
      opacity={opacity}
      attribution='Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)'
      zIndex={450}
    />
  );
}