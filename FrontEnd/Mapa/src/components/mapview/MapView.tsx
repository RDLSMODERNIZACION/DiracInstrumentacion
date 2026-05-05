import React from "react";

import MapViewScreen from "./view/MapViewScreen";
import type { MapViewProps } from "./view/types";

export type { MapViewProps } from "./view/types";

export function MapView(props: MapViewProps) {
  return React.createElement(MapViewScreen, props);
}

export default MapView;