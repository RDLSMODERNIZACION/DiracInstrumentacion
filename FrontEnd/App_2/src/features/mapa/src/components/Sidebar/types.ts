import { type Asset, type Edge, type Zone, barrios } from "../../data/demo";

export type SidebarMode = "NONE" | "ZONE" | "ASSET";

export type ZoneTab =
  | "VALVES"
  | "TANKS"
  | "PUMPS"
  | "MANIFOLDS"
  | "PIPES"
  | "BARRIOS";

export type ViewMode = "ALL" | "ZONES" | "PIPES" | "BARRIOS";

export type LocationInventory = {
  valves: Asset[];
  pumps: Asset[];
  tanks: Asset[];
  manifolds: Asset[];
  barrios: typeof barrios;
  pipes: Edge[];
};

export type SidebarProps = {
  mode: SidebarMode;
  selectedZone: Zone | null;
  selectedAsset: Asset | null;

  zoneTab: ZoneTab;
  setZoneTab: (t: ZoneTab) => void;

  locationInventory: LocationInventory;

  valveEnabled: Record<string, boolean>;
  onToggleValve: (id: string) => void;

  onReset: () => void;

  assetsById: Map<string, Asset>;

  activeValveId: string | null;
  setActiveValveId: (id: string | null) => void;

  showValveImpact: boolean;

  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  viewSelectedId: string | null;
  setViewSelectedId: (id: string | null) => void;

  zonesAll: Zone[];
  barriosAll: typeof barrios;
  edgesAll: Edge[];
};
