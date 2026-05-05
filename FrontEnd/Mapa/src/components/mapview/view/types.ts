import type { LatLng } from "../../../lib/geo";
import type { FocusPair, ViewMode } from "../mapTypes";

export type AssetLinkMode = "none" | "node" | "pipe";
export type InsertMode = "none" | "valve" | "tank" | "pump";

export type MapViewProps = {
  zoom: number;
  setZoom: (z: number) => void;

  focusPair: FocusPair;
  focusTarget: LatLng | null;
  mapGrey: boolean;

  /**
   * Props viejas que venían de data/demo.
   * Se dejan opcionales para no romper el componente padre,
   * pero ya no se usan en este mapa.
   */
  mode?: "NONE" | "ZONE" | "ASSET";
  selectedZoneId?: string | null;
  assets?: any[];
  assetsById?: Map<string, any>;
  valveEnabled?: Record<string, boolean>;
  highlightedBarrioIds?: Set<string>;
  highlightedEdgeIds?: Set<string>;
  highlightedBarrioIdsExtra?: Set<string>;
  dashedEdgeIdsExtra?: Set<string>;
  onSelectZone?: (z: any) => void;
  onSelectAsset?: (id: string) => void;
  shrinkOthers?: boolean;
  viewMode?: ViewMode;
  viewSelectedId?: string | null;
  activeValvePos?: LatLng | null;
  forceShowAssetIds?: Set<string>;
};
