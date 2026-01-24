// =======================
// Tipos backend (DTO)
// =======================

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

  // info de ubicación (backend)
  location_id?: number | null;
  location_name?: string | null;
};

// Puertos normalizados (extensible)
export type PortId =
  | "L1"
  | "L2"
  | "R1"
  | "R2"
  | "R3"
  | "R4"
  | "T1"
  | "B1";

export type EdgeDTO = {
  edge_id: number;
  src_node_id: string;
  dst_node_id: string;
  relacion: string;
  prioridad: number | null;
  updated_at: string;

  // ✅ AHORA backend real (v_layout_edges_flow / layout_edges)
  src_port?: PortId | null;
  dst_port?: PortId | null;
};

// =======================
// Tipos UI
// =======================

// Info extra UI
type BaseExtras = {
  online?: boolean | null;
  state?: string | null;
  level_pct?: number | null;
  alarma?: string | null;
};

// Nodo base UI
export type UINodeBase = {
  id: string; // = node_id
  name: string;
  x: number;
  y: number;
  type: "pump" | "tank" | "manifold" | "valve";

  // ubicación
  location_id?: number | null;
  location_name?: string | null;
} & BaseExtras;

// =======================
// Puertos por tipo de nodo
// =======================

export type NodePorts = {
  in?: PortId[];
  out?: PortId[];
};

// 🔹 Tanque: múltiples salidas
export const TANK_PORTS: NodePorts = {
  in: ["L1"],
  out: ["R1", "R2", "R3"],
};

// 🔹 Bomba: 1 entrada / 1 salida
export const PUMP_PORTS: NodePorts = {
  in: ["L1"],
  out: ["R1"],
};

// 🔹 Manifold: múltiples entradas y salidas
export const MANIFOLD_PORTS: NodePorts = {
  in: ["L1", "L2"],
  out: ["R1", "R2", "R3", "R4"],
};

// 🔹 Válvula: paso simple
export const VALVE_PORTS: NodePorts = {
  in: ["L1"],
  out: ["R1"],
};

// Helper general
export function getNodePorts(type: UINodeBase["type"]): NodePorts {
  switch (type) {
    case "tank":
      return TANK_PORTS;
    case "pump":
      return PUMP_PORTS;
    case "manifold":
      return MANIFOLD_PORTS;
    case "valve":
      return VALVE_PORTS;
    default:
      return {};
  }
}

// =======================
// Tipos concretos de nodos
// =======================

export type TankNode = UINodeBase & {
  type: "tank";
  ports?: NodePorts;
};

export type PumpNode = UINodeBase & {
  type: "pump";
  ports?: NodePorts;
};

export type ManifoldNode = UINodeBase & {
  type: "manifold";
  ports?: NodePorts;
};

export type ValveNode = UINodeBase & {
  type: "valve";
  ports?: NodePorts;
};

export type UINode = TankNode | PumpNode | ManifoldNode | ValveNode;

// =======================
// Edge UI (con puertos)
// =======================

export type UIEdge = {
  id: number; // edge_id
  a: string; // src node_id
  b: string; // dst node_id

  // puertos de conexión (para dibujo)
  a_port?: PortId;
  b_port?: PortId;

  relacion?: string;
  prioridad?: number | null;
};

// =======================
// Tooltip
// =======================

export type Tip = {
  title: string;
  lines: string[];
  x: number;
  y: number;
};
