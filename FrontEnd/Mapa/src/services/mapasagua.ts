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
   ACTIVOS REALES DEL MAPA
========================= */

export type MapAssetType =
  | "TANK"
  | "PUMP"
  | "MANIFOLD"
  | "VALVE"
  | "PRESSURE_SENSOR"
  | "FLOW_SENSOR"
  | "LEVEL_SENSOR"
  | "WELL"
  | "SECTOR"
  | "OTHER";

export type MapAssetLiveStatus = "ONLINE" | "STALE" | "NO_DATA" | string;

export type MapAssetLive = {
  asset_link_id: string;

  asset_type: MapAssetType | string;
  asset_id: string;
  asset_name: string | null;

  source_table?: string | null;
  location_id?: number | null;

  sim_role?: string | null;
  hydraulic_position?: string | null;

  map_node_id?: string | null;
  map_pipe_id?: string | null;
  linked_to_map: boolean;

  level_pct?: number | null;
  pressure_bar?: number | null;
  flow_lps?: number | null;
  run_status?: string | null;

  online?: boolean | null;
  age_sec?: number | null;
  live_status?: MapAssetLiveStatus | null;

  enabled?: boolean;
  priority?: number;
  props?: Record<string, any>;
  notes?: string | null;
};

export type MapAssetsLiveResponse = {
  items: MapAssetLive[];
};

export type MapAssetsStatsResponse = {
  totals: {
    total?: number;
    linked?: number;
    unlinked?: number;
    online?: number;
    stale?: number;
    no_data?: number;
    [key: string]: any;
  };
  by_status: Array<{
    asset_type: string;
    sim_role: string;
    live_status: string;
    linked_to_map: boolean;
    count: number;
  }>;
};

export type MapAssetsLiveParams = {
  asset_type?: string;
  sim_role?: string;
  location_id?: number;
  live_status?: string;
  linked_to_map?: boolean;
  enabled?: boolean;
  limit?: number;
};

export type MapAssetLinkPayload = {
  map_node_id?: string | null;
  map_pipe_id?: string | null;
  clear?: boolean;

  hydraulic_position?: string | null;
  enabled?: boolean;
  priority?: number;

  props?: Record<string, any>;
  notes?: string | null;
};

export type MapAssetUpdatePayload = {
  asset_name?: string | null;
  sim_role?: string | null;
  hydraulic_position?: string | null;
  enabled?: boolean;
  priority?: number;
  props?: Record<string, any>;
  notes?: string | null;
};

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

function buildQuery(params: Record<string, any>) {
  const qs = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    qs.set(key, String(value));
  }

  return qs.toString();
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
   MAPA - ACTIVOS REALES
========================= */

export async function fetchMapAssetsLive(
  params: MapAssetsLiveParams = {}
): Promise<MapAssetLive[]> {
  const qs = buildQuery(params);
  const url = `${API_BASE}/mapa/assets/live${qs ? `?${qs}` : ""}`;

  const json = await fetchJSON<MapAssetsLiveResponse | MapAssetLive[]>(url);

  return Array.isArray(json) ? json : json?.items ?? [];
}

export async function fetchMapAsset(assetLinkId: string): Promise<MapAssetLive> {
  const url = `${API_BASE}/mapa/assets/${encodeURIComponent(assetLinkId)}`;

  return fetchJSON<MapAssetLive>(url);
}

export async function fetchMapAssetsStats(): Promise<MapAssetsStatsResponse> {
  const url = `${API_BASE}/mapa/assets/stats`;

  return fetchJSON<MapAssetsStatsResponse>(url);
}

export async function updateMapAsset(
  assetLinkId: string,
  payload: MapAssetUpdatePayload
): Promise<MapAssetLive> {
  const url = `${API_BASE}/mapa/assets/${encodeURIComponent(assetLinkId)}`;

  return fetchJSON<MapAssetLive>(url, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function linkMapAsset(
  assetLinkId: string,
  payload: MapAssetLinkPayload
): Promise<MapAssetLive> {
  const url = `${API_BASE}/mapa/assets/${encodeURIComponent(assetLinkId)}/link`;

  return fetchJSON<MapAssetLive>(url, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function unlinkMapAsset(assetLinkId: string): Promise<MapAssetLive> {
  const url = `${API_BASE}/mapa/assets/${encodeURIComponent(assetLinkId)}/link`;

  return fetchJSON<MapAssetLive>(url, {
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

/* =========================
   MAPA - TRANSICIONES DE DIÁMETRO
========================= */

export type DiameterTransitionPipe = {
  pipe_id: string;
  layer_name?: string | null;
  diam_mm?: number | null;
  flow_func?: string | null;
  other_node_id?: string | null;
  length_m?: number | null;
};

export type DiameterTransition = {
  node_id: string;
  kind?: string | null;
  elev_m?: number | null;
  node_label?: string | null;
  lat: number;
  lng: number;

  pipes_count: number;
  unique_pipes_count: number;
  diameters_count: number;

  min_diam_mm: number;
  max_diam_mm: number;
  delta_diam_mm: number;
  ratio_diam: number;

  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;
  transition_type: string;

  diameters_mm?: number[];
  pipes: DiameterTransitionPipe[];
};

export type DiameterTransitionsResponse = {
  count: number;
  items: DiameterTransition[];
};

export async function fetchDiameterTransitions(params: {
  min_delta_mm?: number;
  min_ratio?: number;
  severity?: string;
  limit?: number;
} = {}): Promise<DiameterTransition[]> {
  const qs = new URLSearchParams();

  if (params.min_delta_mm != null) qs.set("min_delta_mm", String(params.min_delta_mm));
  if (params.min_ratio != null) qs.set("min_ratio", String(params.min_ratio));
  if (params.severity) qs.set("severity", params.severity);
  if (params.limit != null) qs.set("limit", String(params.limit));

  const url = `${API_BASE}/mapa/diameters/transitions${qs.toString() ? `?${qs}` : ""}`;

  const json = await fetchJSON<DiameterTransitionsResponse>(url);

  return Array.isArray(json?.items) ? json.items : [];
}

/* =========================
   MAPA - VÁLVULAS
========================= */

export type MapValveLive = {
  valve_id: string;
  name: string;
  location_id?: number | null;

  map_node_id?: string | null;
  map_pipe_id?: string | null;

  is_open: boolean;
  valve_status: "OPEN" | "CLOSED" | string;

  valve_type?: string | null;
  normal_position?: string | null;
  source?: string | null;
  tag?: string | null;
  last_ts?: string | null;
  notes?: string | null;
  props?: Record<string, any> | null;

  node_elev_m?: number | null;

  lat: number | null;
  lng: number | null;

  pipe_name?: string | null;
  diametro_mm?: number | null;
  flow_func?: string | null;

  created_at?: string;
  updated_at?: string;
};

export type MapValvesResponse = {
  count: number;
  items: MapValveLive[];
};

export async function fetchMapValves(): Promise<MapValveLive[]> {
  const url = `${API_BASE}/mapa/valves`;

  const json = await fetchJSON<MapValvesResponse>(url);

  return Array.isArray(json?.items) ? json.items : [];
}

export async function createMapValve(input: {
  name?: string;
  map_node_id?: string | null;
  map_pipe_id?: string | null;
  is_open?: boolean;
  valve_type?: string;
  location_id?: number | null;
  source?: string;
  tag?: string | null;
  notes?: string | null;
}): Promise<MapValveLive> {
  const url = `${API_BASE}/mapa/valves`;

  return fetchJSON<MapValveLive>(url, {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      map_node_id: input.map_node_id ?? null,
      map_pipe_id: input.map_pipe_id ?? null,
      is_open: input.is_open ?? true,
      valve_type: input.valve_type ?? "MANUAL",
      location_id: input.location_id ?? null,
      source: input.source ?? "MANUAL",
      tag: input.tag ?? null,
      notes: input.notes ?? null,
    }),
  });
}

export type InsertValveOnPipeInput = {
  pipe_id: string;
  lat: number;
  lng: number;
  name?: string | null;
  is_open?: boolean;
  valve_type?: string;
  location_id?: number | null;
  source?: string;
  tag?: string | null;
  notes?: string | null;
  block_side?: "from" | "to";
};

export type InsertValveOnPipeResponse = {
  ok: boolean;
  valve: MapValveLive;
  split: {
    original_pipe_id: string;
    valve_node_id: string;
    pipe_from_id: string;
    pipe_to_id: string;
    blocked_pipe_id: string;
    block_side: "from" | "to";
    frac_on_pipe: number;
    lat: number;
    lng: number;
    elev_m?: number | null;
  };
};

export async function insertValveOnPipePoint(
  input: InsertValveOnPipeInput
): Promise<InsertValveOnPipeResponse> {
  const url = `${API_BASE}/mapa/valves/insert-on-pipe`;

  return fetchJSON<InsertValveOnPipeResponse>(url, {
    method: "POST",
    body: JSON.stringify({
      pipe_id: input.pipe_id,
      lat: input.lat,
      lng: input.lng,
      name: input.name ?? null,
      is_open: input.is_open ?? true,
      valve_type: input.valve_type ?? "MANUAL",
      location_id: input.location_id ?? null,
      source: input.source ?? "MANUAL",
      tag: input.tag ?? null,
      notes: input.notes ?? "Insertada desde el mapa",
      block_side: input.block_side ?? "to",
    }),
  });
}

export async function updateMapValveState(
  valveId: string,
  isOpen: boolean
): Promise<MapValveLive> {
  const url = `${API_BASE}/mapa/valves/${encodeURIComponent(valveId)}/state`;

  return fetchJSON<MapValveLive>(url, {
    method: "PATCH",
    body: JSON.stringify({
      is_open: isOpen,
    }),
  });
}

export async function deleteMapValve(valveId: string): Promise<{ ok: boolean; valve_id: string }> {
  const url = `${API_BASE}/mapa/valves/${encodeURIComponent(valveId)}`;

  return fetchJSON(url, {
    method: "DELETE",
  });
}