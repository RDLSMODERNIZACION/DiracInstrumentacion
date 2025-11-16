// Tipos backend (DTO)
export type CombinedNodeDTO = {
  node_id: string;
  id: number;
  type: "pump" | "tank" | "manifold" | "valve";
  x: number | null;
  y: number | null;
  updated_at: string | null;
  online: boolean | null;
  state?: string | null;
  level_pct?: number | string | null;
  alarma?: string | null;

  // NUEVO: info de ubicación que viene del backend
  location_id?: number | null;
  location_name?: string | null;
};

export type EdgeDTO = {
  edge_id: number;
  src_node_id: string;
  dst_node_id: string;
  relacion: string;
  prioridad: number;
  updated_at: string;
};

// Tipos UI
type BaseExtras = {
  online?: boolean | null;
  state?: string | null;
  level_pct?: number | null;
  alarma?: string | null;
};

export type UINodeBase = {
  id: string; // = node_id
  name: string;
  x: number;
  y: number;
  type: "pump" | "tank" | "manifold" | "valve";

  // NUEVO: info de ubicación para agrupar y dibujar fondos
  location_id?: number | null;
  location_name?: string | null;
} & BaseExtras;

export type TankNode = UINodeBase & { type: "tank" };
export type PumpNode = UINodeBase & { type: "pump" };
export type ManifoldNode = UINodeBase & { type: "manifold" };
export type ValveNode = UINodeBase & { type: "valve" };
export type UINode = TankNode | PumpNode | ManifoldNode | ValveNode;

export type UIEdge = {
  id: number;        // edge_id
  a: string;         // src node_id
  b: string;         // dst node_id
  relacion?: string;
  prioridad?: number;
};

// Tooltip
export type Tip = { title: string; lines: string[]; x: number; y: number };
