// src/services/mapasagua.ts

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE || "https://diracinstrumentacion.onrender.com";

/* =========================
   Tipos base
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
   NODES
========================= */

export type NodeKind = "JUNCTION" | "VALVE" | "SOURCE" | "PUMP" | "DEMAND";

export type NodeDTO = {
  id: string;
  kind: NodeKind | string;
  elev_m?: number | null;
  label?: string;
  props?: Record<string, any>;
  lng?: number;
  lat?: number;
  created_at?: string;
};

export type NodesListResponse = {
  items: NodeDTO[];
};

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
   CONECTAR CAÑERÍAS EN CRUCE
========================= */

export type ConnectIntersectionInput = {
  lat: number;
  lng: number;
  tolerance_m?: number;
  apply?: boolean;
};

export type ConnectIntersectionResult = {
  ok?: boolean;
  apply_mode?: boolean;
  tolerance_m?: number;
  node_id?: string | null;

  candidates_found?: number;
  selected_pipes?: string[];
  selected_targets?: string[];

  created_nodes?: number;
  created_pipes?: string[];
  split_pipes_created?: number;
  original_pipes_inactivated?: number;
  endpoint_pipes_updated?: number;

  message?: string;
  detail?: any;
};

/* =========================
   Fetch helper
========================= */

export class ApiError extends Error {
  status: number;
  body: string;
  url: string;

  constructor(status: number, body: string, url: string) {
    super(`HTTP ${status}${body ? `: ${body}` : ""}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

function jsonHeaders(init?: RequestInit) {
  return {
    "Content-Type": "application/json",
    ...(init?.headers || {}),
  } as HeadersInit;
}

async function fetchJSON<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: jsonHeaders(init),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new ApiError(res.status, txt, url);
  }

  if (res.status === 204) return null as T;

  return (await res.json()) as T;
}

function isMissingEndpoint(e: any) {
  return e?.status === 404 || e?.status === 405;
}

/* =========================
   PIPES por BBOX
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
   PIPES sin BBOX
========================= */

export async function fetchPipesAll() {
  const url = `${API_BASE}/mapa/mapasagua/pipes`;

  return fetchJSON(url);
}

/* =========================
   EXTENT
========================= */

export async function fetchPipesExtent(): Promise<PipesExtent> {
  const url = `${API_BASE}/mapa/mapasagua/pipes/extent`;

  return fetchJSON<PipesExtent>(url);
}

/* =========================
   GET PIPE POR ID
========================= */

export async function fetchPipeById(id: string) {
  const url = `${API_BASE}/mapa/mapasagua/pipes/${encodeURIComponent(id)}`;

  return fetchJSON(url);
}

/* =========================
   PATCH PIPE
========================= */

export async function patchPipe(id: string, payload: Record<string, any>) {
  const url = `${API_BASE}/mapa/mapasagua/pipes/${encodeURIComponent(id)}`;

  return fetchJSON(url, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/* =========================
   CONECTAR PIPE A NODOS
========================= */

export async function connectPipe(pipeId: string, from_node: string, to_node: string) {
  const id = encodeURIComponent(pipeId);

  const payload = {
    from_node,
    to_node,
  };

  const init: RequestInit = {
    method: "PATCH",
    body: JSON.stringify(payload),
  };

  const endpoints = [
    `${API_BASE}/mapa/pipes/${id}/connect`,
    `${API_BASE}/mapa/mapasagua/pipes/${id}/connect`,
  ];

  let lastEndpointError: any = null;

  for (const url of endpoints) {
    try {
      return await fetchJSON<{ ok?: boolean; pipe?: any }>(url, init);
    } catch (e: any) {
      lastEndpointError = e;

      if (!isMissingEndpoint(e)) {
        throw e;
      }
    }
  }

  try {
    return await patchPipe(pipeId, payload);
  } catch (directPatchError: any) {
    try {
      return await patchPipe(pipeId, { properties: payload });
    } catch {
      throw directPatchError || lastEndpointError;
    }
  }
}

/* =========================
   DELETE PIPE
========================= */

export async function deletePipe(id: string) {
  const url = `${API_BASE}/mapa/mapasagua/pipes/${encodeURIComponent(id)}`;

  return fetchJSON(url, {
    method: "DELETE",
  });
}

/* =========================
   PATCH PIPE GEOMETRY
========================= */

export async function patchPipeGeometry(id: string, geometry: GeoJSONGeometry) {
  const url = `${API_BASE}/mapa/mapasagua/pipes/${encodeURIComponent(id)}/geometry`;

  return fetchJSON(url, {
    method: "PATCH",
    body: JSON.stringify(geometry),
  });
}

/* =========================
   CREATE PIPE
========================= */

export async function createPipe(input: {
  geometry: GeoJSONGeometry;
  properties?: {
    from_node?: string | null;
    to_node?: string | null;
    diametro_mm?: number | null;
    material?: string | null;
    type?: string | null;
    estado?: string | null;
    flow_func?: string | null;
    props?: Record<string, any>;
    style?: Record<string, any>;
    [key: string]: any;
  };
}) {
  const url = `${API_BASE}/mapa/mapasagua/pipes`;

  return fetchJSON(url, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/* =========================
   NODES API
========================= */

export async function fetchNodes(limit = 5000): Promise<NodeDTO[]> {
  const url = `${API_BASE}/mapa/nodes?limit=${encodeURIComponent(String(limit))}`;

  const json = await fetchJSON<NodesListResponse | NodeDTO[]>(url);

  const items = Array.isArray(json) ? json : json?.items ?? [];

  return items;
}

export async function createNode(input: NodeCreateInput): Promise<NodeDTO> {
  const url = `${API_BASE}/mapa/nodes`;

  return fetchJSON(url, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateNode(nodeId: string, patch: NodeUpdateInput): Promise<NodeDTO> {
  const url = `${API_BASE}/mapa/nodes/${encodeURIComponent(nodeId)}`;

  return fetchJSON(url, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteNode(nodeId: string): Promise<{ ok: boolean; node_id: string }> {
  const url = `${API_BASE}/mapa/nodes/${encodeURIComponent(nodeId)}`;

  return fetchJSON(url, {
    method: "DELETE",
  });
}

/* =========================
   CREAR PIPE ENTRE DOS NODOS
========================= */

export async function createPipeBetweenNodes(input: {
  from_node: string;
  to_node: string;
  from_lat: number;
  from_lng: number;
  to_lat: number;
  to_lng: number;
  properties?: {
    diametro_mm?: number | null;
    material?: string | null;
    type?: string | null;
    estado?: string | null;
    flow_func?: string | null;
    props?: Record<string, any>;
    style?: Record<string, any>;
    [key: string]: any;
  };
}) {
  const geometry: GeoJSONGeometry = {
    type: "LineString",
    coordinates: [
      [input.from_lng, input.from_lat],
      [input.to_lng, input.to_lat],
    ],
  };

  return createPipe({
    geometry,
    properties: {
      from_node: input.from_node,
      to_node: input.to_node,
      type: input.properties?.type ?? "WATER",
      estado: input.properties?.estado ?? "OK",
      flow_func: input.properties?.flow_func ?? "DISTRIBUCION",
      diametro_mm: input.properties?.diametro_mm ?? null,
      material: input.properties?.material ?? null,
      props: {
        Layer: "Conexión manual nodo-nodo",
        ...(input.properties?.props ?? {}),
      },
      style: input.properties?.style ?? {},
      ...(input.properties ?? {}),
    },
  });
}

/* =========================
   CONECTAR CAÑERÍAS EN CRUCE
   - crea o reutiliza un nodo en el punto indicado
   - parte las cañerías cercanas
   - conecta los nuevos tramos al mismo nodo
========================= */

export async function connectPipesAtIntersection(
  input: ConnectIntersectionInput
): Promise<ConnectIntersectionResult> {
  const url = `${API_BASE}/mapa/mapasagua/connect-intersection`;

  return fetchJSON<ConnectIntersectionResult>(url, {
    method: "POST",
    body: JSON.stringify({
      lat: input.lat,
      lng: input.lng,
      tolerance_m: input.tolerance_m ?? 2,
      apply: input.apply ?? true,
    }),
  });
}

/* =========================
   CONECTAR CAÑERÍAS EN CRUCE - PREVIEW
   - no modifica la base
   - sirve para ver cuántas cañerías detecta antes de aplicar
========================= */

export async function previewPipesAtIntersection(input: {
  lat: number;
  lng: number;
  tolerance_m?: number;
}): Promise<ConnectIntersectionResult> {
  return connectPipesAtIntersection({
    lat: input.lat,
    lng: input.lng,
    tolerance_m: input.tolerance_m ?? 2,
    apply: false,
  });
}