// src/services/mapasagua.ts
const API_BASE = import.meta.env.VITE_API_BASE ?? "https://diracinstrumentacion.onrender.com";

/* =========================
   Tipos
========================= */
export type BBox = {
  min_lng: number;
  min_lat: number;
  max_lng: number;
  max_lat: number;
};

export type PipesExtent = {
  min_lng: number | null;
  min_lat: number | null;
  max_lng: number | null;
  max_lat: number | null;
};

export type GeoJSONGeometry =
  | { type: "LineString"; coordinates: any[] }
  | { type: "MultiLineString"; coordinates: any[] }
  | { type: "Point"; coordinates: any[] }
  | { type: string; coordinates?: any[] };

/* =========================
   NODES (manual)
========================= */
export type NodeKind = "JUNCTION" | "VALVE" | "SOURCE" | "PUMP" | "DEMAND";

export type NodeDTO = {
  id: string;
  kind: NodeKind | string;
  elev_m?: number | null;
  label?: string; // viene de props->>'label' desde backend
  props?: Record<string, any>;
  lng?: number;
  lat?: number;
  created_at?: string;
};

export type NodesListResponse = { items: NodeDTO[] };

export type NodeCreateInput = {
  lat: number;
  lng: number;
  kind?: NodeKind;
  label?: string;
  elev_m?: number | null;
  props?: Record<string, any>;
};

export type NodeUpdateInput = Partial<NodeCreateInput>;

/* =========================
   Fetch helper (sin logs)
========================= */
async function fetchJSON(url: string, init?: RequestInit) {
  const res = await fetch(url, init);

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${txt ? `: ${txt}` : ""}`);
  }

  return res.json();
}

/* =========================
   PIPES por BBOX (principal)
========================= */
export async function fetchPipesBBox(bbox: BBox) {
  const qs = new URLSearchParams({
    min_lng: bbox.min_lng.toString(),
    min_lat: bbox.min_lat.toString(),
    max_lng: bbox.max_lng.toString(),
    max_lat: bbox.max_lat.toString(),
  }).toString();

  const url = `${API_BASE}/mapa/mapasagua/pipes?${qs}`;
  return fetchJSON(url);
}

/* =========================
   PIPES SIN BBOX (util)
========================= */
export async function fetchPipesAll() {
  const url = `${API_BASE}/mapa/mapasagua/pipes`;
  return fetchJSON(url);
}

/* =========================
   EXTENT (auto-fit)
========================= */
export async function fetchPipesExtent(): Promise<PipesExtent> {
  const url = `${API_BASE}/mapa/mapasagua/pipes/extent`;
  const json = await fetchJSON(url);
  return json as PipesExtent;
}

/* =========================
   GET PIPE POR ID
========================= */
export async function fetchPipeById(id: string) {
  const url = `${API_BASE}/mapa/mapasagua/pipes/${id}`;
  return fetchJSON(url);
}

/* =========================
   PATCH PIPE (editar propiedades)
========================= */
export async function patchPipe(id: string, payload: Record<string, any>) {
  const url = `${API_BASE}/mapa/mapasagua/pipes/${id}`;

  return fetchJSON(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/* =========================
   DELETE PIPE (borrado REAL)
========================= */
export async function deletePipe(id: string) {
  const url = `${API_BASE}/mapa/mapasagua/pipes/${id}`;
  return fetchJSON(url, { method: "DELETE" });
}

/* =========================
   PATCH PIPE GEOMETRY (recorrido)
========================= */
export async function patchPipeGeometry(id: string, geometry: GeoJSONGeometry) {
  const url = `${API_BASE}/mapa/mapasagua/pipes/${id}/geometry`;

  return fetchJSON(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(geometry),
  });
}

/* =========================
   POST CREATE PIPE (dibujar nueva)
========================= */
export async function createPipe(input: {
  geometry: GeoJSONGeometry;
  properties?: {
    diametro_mm?: number | null;
    material?: string | null;
    type?: string | null;
    estado?: string | null;
    flow_func?: string | null;
    props?: Record<string, any>;
    style?: Record<string, any>;
  };
}) {
  const url = `${API_BASE}/mapa/mapasagua/pipes`;

  return fetchJSON(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/* =========================
   NODES API (manual)
   Backend: /mapa/nodes
========================= */
export async function fetchNodes(limit = 2000): Promise<NodeDTO[]> {
  const url = `${API_BASE}/mapa/nodes?limit=${encodeURIComponent(String(limit))}`;
  const json = (await fetchJSON(url)) as NodesListResponse | NodeDTO[];
  const items = Array.isArray(json) ? (json as NodeDTO[]) : (json as NodesListResponse).items ?? [];
  return items;
}

export async function createNode(input: NodeCreateInput): Promise<NodeDTO> {
  const url = `${API_BASE}/mapa/nodes`;
  return fetchJSON(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateNode(nodeId: string, patch: NodeUpdateInput): Promise<NodeDTO> {
  const url = `${API_BASE}/mapa/nodes/${nodeId}`;
  return fetchJSON(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteNode(nodeId: string): Promise<{ ok: boolean; node_id: string }> {
  const url = `${API_BASE}/mapa/nodes/${nodeId}`;
  return fetchJSON(url, { method: "DELETE" });
}
