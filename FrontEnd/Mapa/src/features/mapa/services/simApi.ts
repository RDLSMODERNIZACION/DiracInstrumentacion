// src/features/mapa/services/simApi.ts
export type SimOptions = {
  // (LINEAR) opcional
  min_pressure_m?: number;

  // (SIMPLE y LINEAR)
  default_diam_mm?: number;
  r_scale?: number;
  closed_valve_blocks_node?: boolean;

  // (LINEAR) opcional (en SIMPLE se ignora)
  ignore_unconnected?: boolean;

  // (SIMPLE) opcionales (en LINEAR se ignoran)
  head_drop_scale?: number;
  R0?: number;
};

export type SimNode = {
  head_m: number | null;
  pressure_bar: number | null;
  blocked: boolean;
  kind: string;
  reached?: boolean;
};

export type SimPipe = {
  q_lps: number;
  abs_q_lps: number;
  dir: 1 | -1;
  dH_m: number | null;
  R: number;
  length_m: number;
  diam_mm: number;
  blocked: boolean;
  u: string;
  v: string;
};

export type SimRunResponse = {
  model: "SIMPLE" | "LINEAR" | string;
  nodes: Record<string, SimNode>;
  pipes: Record<string, SimPipe>;
  meta: {
    n_nodes: number;
    n_pipes_used: number;
    n_sources: number;
    pipes_count?: number;
    nodes_count?: number;
    sources_count?: number;
    demands_ignored?: boolean;
  };
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "";

/** fetch helper */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function runSim(options: SimOptions = {}) {
  return api<SimRunResponse>(`/mapa/sim/run`, {
    method: "POST",
    body: JSON.stringify({ options }),
  });
}

export function connectPipe(pipeId: string, from_node: string, to_node: string) {
  return api<{ ok: boolean }>(`/mapa/pipes/${pipeId}/connect`, {
    method: "PATCH",
    body: JSON.stringify({ from_node, to_node }),
  });
}

// Nota: tu backend actual puede no usar este endpoint; queda listo si lo agregás.
export function setValve(nodeId: string, is_open: boolean) {
  return api<{ ok: boolean }>(`/mapa/valves/${nodeId}`, {
    method: "PATCH",
    body: JSON.stringify({ is_open }),
  });
}
