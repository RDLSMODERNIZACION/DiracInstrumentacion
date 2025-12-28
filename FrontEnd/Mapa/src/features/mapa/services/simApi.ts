// src/features/mapa/services/simApi.ts
export type SimOptions = {
  min_pressure_m?: number;
  default_diam_mm?: number;
  ignore_unconnected?: boolean;
  closed_valve_blocks_node?: boolean;
  r_scale?: number;
};

export type SimRunResponse = {
  model: "LINEAR";
  nodes: Record<string, { head_m: number; pressure_bar: number; blocked: boolean; kind: string }>;
  pipes: Record<
    string,
    {
      q_lps: number;
      abs_q_lps: number;
      dir: 1 | -1;
      dH_m: number;
      R: number;
      length_m: number;
      diam_mm: number;
      blocked: boolean;
      u: string;
      v: string;
    }
  >;
  meta: { n_nodes: number; n_pipes_used: number; n_sources: number };
};

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  ""; // si ya tenés fetchJSON central, lo usamos después

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

export function setValve(nodeId: string, is_open: boolean) {
  return api<{ ok: boolean }>(`/mapa/valves/${nodeId}`, {
    method: "PATCH",
    body: JSON.stringify({ is_open }),
  });
}
