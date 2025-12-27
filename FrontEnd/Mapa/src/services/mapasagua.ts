// src/services/mapasagua.ts
const API_BASE =
  import.meta.env.VITE_API_BASE ??
  "https://diracinstrumentacion.onrender.com";

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

function dbg(...args: any[]) {
  // 🔧 podés apagar logs en producción si querés:
  const enabled = (import.meta as any).env?.VITE_MAPASAGUA_DEBUG !== "0";
  if (enabled) console.log(...args);
}

async function fetchJSON(url: string, init?: RequestInit) {
  dbg("[mapasagua]", init?.method ?? "GET", url);
  const res = await fetch(url, init);
  dbg("[mapasagua] status:", res.status);

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    dbg("[mapasagua] ERROR:", txt);
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}

/* =========================
   PIPES por BBOX (principal)
========================= */
export async function fetchPipesBBox(bbox: BBox) {
  dbg("[mapasagua] fetchPipesBBox bbox:", bbox);

  const qs = new URLSearchParams({
    min_lng: bbox.min_lng.toString(),
    min_lat: bbox.min_lat.toString(),
    max_lng: bbox.max_lng.toString(),
    max_lat: bbox.max_lat.toString(),
  }).toString();

  const url = `${API_BASE}/mapa/mapasagua/pipes?${qs}`;
  const json = await fetchJSON(url);

  const count = Array.isArray((json as any)?.features) ? (json as any).features.length : 0;
  dbg("[mapasagua] features:", count);
  if (count > 0) dbg("[mapasagua] first feature id:", (json as any).features[0]?.id);

  return json;
}

/* =========================
   PIPES SIN BBOX (DEBUG)
========================= */
export async function fetchPipesAll() {
  const url = `${API_BASE}/mapa/mapasagua/pipes`;
  const json = await fetchJSON(url);

  const count = Array.isArray((json as any)?.features) ? (json as any).features.length : 0;
  dbg("[mapasagua] features (ALL):", count);

  return json;
}

/* =========================
   EXTENT (auto-fit)
========================= */
export async function fetchPipesExtent(): Promise<PipesExtent> {
  const url = `${API_BASE}/mapa/mapasagua/pipes/extent`;
  const json = await fetchJSON(url);
  dbg("[mapasagua] extent:", json);
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
  dbg("[mapasagua] PATCH props payload:", payload);

  return fetchJSON(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/* =========================
   PATCH PIPE GEOMETRY (recorrido)
   ✅ Paso 1 editor visual
========================= */
export async function patchPipeGeometry(id: string, geometry: GeoJSONGeometry) {
  const url = `${API_BASE}/mapa/mapasagua/pipes/${id}/geometry`;
  dbg("[mapasagua] PATCH geometry:", geometry?.type);

  // backend acepta geometry directo (no wrapper)
  return fetchJSON(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(geometry),
  });
}

/* =========================
   POST CREATE PIPE (dibujar nueva)
   ✅ Paso 2
========================= */
export async function createPipe(input: {
  geometry: GeoJSONGeometry;
  properties?: {
    diametro_mm?: number | null;
    material?: string | null;
    type?: string | null;
    estado?: string | null;
    props?: Record<string, any>;
    style?: Record<string, any>;
  };
}) {
  const url = `${API_BASE}/mapa/mapasagua/pipes`;
  dbg("[mapasagua] POST createPipe:", input?.geometry?.type);

  return fetchJSON(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
