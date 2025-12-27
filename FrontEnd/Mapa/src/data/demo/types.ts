// src/data/demo/types.ts

export type LatLng = [number, number];

export type AssetType = "TANK" | "PUMP" | "VALVE" | "MANIFOLD";
export type Status = "OK" | "WARN" | "ALARM" | "OFF";

export type Asset = {
  id: string;
  locationId: string; // Zone.id
  type: AssetType;
  name: string;
  lat: number;
  lng: number;
  status: Status;
  meta: Record<string, string | number | boolean>;
};

export type EdgeType = "WATER" | "SLUDGE";

export type Edge = {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  path?: LatLng[];
  meta?: Record<string, string | number | boolean>;
};

/**
 * - Mantiene alimentado_por
 * - Agrega (opcional) presión por barrio para tooltip
 */
export type Barrio = {
  id: string;
  name: string;
  polygon: LatLng[];
  locationId: string;
  meta: {
    alimentado_por: string; // Asset.id (válvula)
    presion_bar?: number;
    presion_kpa?: number;
    presion_pct?: number;
  };
};

/**
 * - meta puede incluir videoUrl para presentar la localidad desde el sidebar
 */
export type Zone = {
  id: string;
  name: string;
  polygon: LatLng[];
  meta?: Record<string, string | number | boolean> & {
    videoUrl?: string;
  };
};

// =========================
// DESTINOS DE VÁLVULAS (routing)
// =========================

export type ValveTarget =
  | { kind: "BARRIO"; barrioId: string }
  | { kind: "LOCATION"; locationId: string }
  | { kind: "ASSET"; assetId: string };

export type ValveRouting = {
  targets?: ValveTarget[];
  note?: string;
};
