// =======================
// Tipos backend (DTO)
// =======================

export type ValveMeta = {
  // 2way = 1 entrada + 1 salida
  // 3way = 1 entrada + 2 salidas (R1 y R2)
  model?: "2way" | "3way";

  // orientación del símbolo/puertos
  rot?: 0 | 90 | 180 | 270;
  flipX?: boolean;

  // estado por puerto
  ports?: Partial<Record<PortId, "open" | "closed">>;
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

// ✅ NUEVO: Señal de manifold (viene dentro de `signals`)
export type ManifoldSignalDTO = {
  id?: number | null;
  signal_type?: "pressure" | "flow" | string | null;

  node_id?: string | null;
  tag?: string | null;

  unit?: string | null;
  scale_mult?: number | null;
  scale_add?: number | null;

  min_value?: number | null;
  max_value?: number | null;

  value?: number | string | null; // ej: 7.2
  ts?: string | null; // ISO timestamp o null
};

// ✅ NUEVO: DTO de lectura latest (opcional, útil si lo tipás en el fetch)
export type NetworkAnalyzerLatestDTO = {
  id: number;
  analyzer_id: number | null;
  ts: string | null;

  v_l1l2: number | null;
  v_l3l2: number | null;
  v_l1l3: number | null;

  i_l1: number | null;
  i_l2: number | null;
  i_l3: number | null;

  hz: number | null;

  p_w: number | null;
  p_kw: number | null;

  q_var: number | null;
  q_kvar: number | null;

  s_va: number | null;
  s_kva: number | null;

  pf: number | null;
  quadrant: number | null;

  e_kwh_import: number | null;
  e_kwh_export: number | null;
  e_kvarh_import: number | null;
  e_kvarh_export: number | null;
  e_kvah: number | null;

  raw: any | null;
  source: string | null;

  created_at?: string | null;
  signal_id?: number | null;
  value?: number | null;
};

export type CombinedNodeDTO = {
  node_id: string;
  id: number;

  // ✅ agregado network_analyzer
  type: "pump" | "tank" | "manifold" | "valve" | "network_analyzer";

  x: number | null;
  y: number | null;
  updated_at: string | null;
  online: boolean | null;
  state?: string | null;
  level_pct?: number | string | null;
  alarma?: string | null;

  // ✅ meta viene solo en valves (pero lo declaramos opcional)
  meta?: ValveMeta | null;

  // ✅ signals: manifold o ABB (en ABB suele ser Record<string, number>)
  // Para no pelearte con TS ahora, lo dejamos genérico.
  signals?: Record<string, any> | null;

  // ✅ opcional: si el backend algún día lo manda explícito
  analyzer_id?: number | null;

  // info de ubicación (backend)
  location_id?: number | null;
  location_name?: string | null;
};

export type EdgeDTO = {
  edge_id: number;
  src_node_id: string;
  dst_node_id: string;
  relacion: string;
  prioridad: number | null;
  updated_at: string;

  // ✅ backend real (v_layout_edges_flow / layout_edges)
  src_port?: PortId | null;
  dst_port?: PortId | null;

  // (si usás knots desde el mismo endpoint)
  knots?: Array<{ x: number; y: number }> | null;
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

  // ✅ agregado network_analyzer
  type: "pump" | "tank" | "manifold" | "valve" | "network_analyzer";

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

// 🔹 Válvula: por defecto 2way (pero puede ser 3way por meta.model)
export const VALVE_2WAY_PORTS: NodePorts = {
  in: ["L1"],
  out: ["R1"],
};

export const VALVE_3WAY_PORTS: NodePorts = {
  in: ["L1"],
  out: ["R1", "R2"],
};

// ✅ Network Analyzer: no conecta caños (por ahora sin puertos)
export const NETWORK_ANALYZER_PORTS: NodePorts = {};

// Helper general por type (sin meta)
export function getNodePorts(type: UINodeBase["type"]): NodePorts {
  switch (type) {
    case "tank":
      return TANK_PORTS;
    case "pump":
      return PUMP_PORTS;
    case "manifold":
      return MANIFOLD_PORTS;
    case "valve":
      return VALVE_2WAY_PORTS;
    case "network_analyzer":
      return NETWORK_ANALYZER_PORTS;
    default:
      return {};
  }
}

// Helper para válvulas (con meta.model)
export function getValvePorts(meta?: ValveMeta | null): NodePorts {
  const model = meta?.model ?? "2way";
  return model === "3way" ? VALVE_3WAY_PORTS : VALVE_2WAY_PORTS;
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

  // ✅ señales (pressure/flow)
  // Si querés, podés tipar más fino, pero así ya compila.
  signals?: Record<string, any> | null;
};

export type ValveNode = UINodeBase & {
  type: "valve";

  // ✅ meta viene del backend y define 2way/3way + rot/flip + open/closed
  meta?: ValveMeta | null;

  // puertos calculados (si querés guardarlos en el node al armar UI)
  ports?: NodePorts;
};

// ✅ NUEVO: Network Analyzer UI Node
export type NetworkAnalyzerNode = UINodeBase & {
  type: "network_analyzer";

  // ✅ clave para pegarle a /components/network_analyzers/{id}/latest
  analyzer_id?: number | null;

  // fallback si querés mostrar algo aunque no haya latest
  signals?: Record<string, any> | null;

  ports?: NodePorts;
};

export type UINode = TankNode | PumpNode | ManifoldNode | ValveNode | NetworkAnalyzerNode;

// =======================
// Edge UI (con puertos)
// =======================

export type UIEdge = {
  id: number; // edge_id
  a: string; // src node_id
  b: string; // dst node_id

  // puertos de conexión (para dibujo)
  a_port?: PortId | null;
  b_port?: PortId | null;

  relacion?: string;
  prioridad?: number | null;

  // (si lo usás en el front)
  knots?: Array<{ x: number; y: number }> | null;
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
