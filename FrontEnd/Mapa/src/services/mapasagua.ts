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

/* =========================
   PIPES por BBOX (principal)
========================= */
export async function fetchPipesBBox(bbox: BBox) {
  // 🔎 LOG 1: bbox recibido
  console.log("[mapasagua] fetchPipesBBox bbox:", bbox);

  const qs = new URLSearchParams({
    min_lng: bbox.min_lng.toString(),
    min_lat: bbox.min_lat.toString(),
    max_lng: bbox.max_lng.toString(),
    max_lat: bbox.max_lat.toString(),
  }).toString();

  const url = `${API_BASE}/mapa/mapasagua/pipes?${qs}`;

  // 🔎 LOG 2: URL final
  console.log("[mapasagua] GET", url);

  const res = await fetch(url);

  // 🔎 LOG 3: status
  console.log("[mapasagua] response status:", res.status);

  if (!res.ok) {
    const txt = await res.text();
    console.error("[mapasagua] ERROR response:", txt);
    throw new Error(`Error loading pipes (${res.status})`);
  }

  const json = await res.json();

  // 🔎 LOG 4: cantidad de features
  const count = Array.isArray(json?.features) ? json.features.length : 0;
  console.log("[mapasagua] features:", count);

  // 🔎 LOG 5: ejemplo
  if (count > 0) {
    console.log("[mapasagua] first feature id:", json.features[0]?.id);
  }

  return json;
}

/* =========================
   PIPES SIN BBOX (DEBUG)
========================= */
export async function fetchPipesAll() {
  const url = `${API_BASE}/mapa/mapasagua/pipes`;
  console.log("[mapasagua] GET (ALL)", url);

  const res = await fetch(url);
  console.log("[mapasagua] response status:", res.status);

  if (!res.ok) {
    const txt = await res.text();
    console.error("[mapasagua] ERROR response:", txt);
    throw new Error(`Error loading pipes (${res.status})`);
  }

  const json = await res.json();
  const count = Array.isArray(json?.features) ? json.features.length : 0;
  console.log("[mapasagua] features (ALL):", count);

  return json;
}

/* =========================
   EXTENT (auto-fit)
========================= */
export async function fetchPipesExtent(): Promise<PipesExtent> {
  const url = `${API_BASE}/mapa/mapasagua/pipes/extent`;
  console.log("[mapasagua] GET extent", url);

  const res = await fetch(url);
  console.log("[mapasagua] extent status:", res.status);

  if (!res.ok) {
    const txt = await res.text();
    console.error("[mapasagua] extent ERROR:", txt);
    throw new Error("Error loading pipes extent");
  }

  const json = await res.json();
  console.log("[mapasagua] extent:", json);

  return json as PipesExtent;
}

/* =========================
   GET PIPE POR ID
========================= */
export async function fetchPipeById(id: string) {
  const url = `${API_BASE}/mapa/mapasagua/pipes/${id}`;
  console.log("[mapasagua] GET by id:", url);

  const res = await fetch(url);
  console.log("[mapasagua] response status:", res.status);

  if (!res.ok) {
    const txt = await res.text();
    console.error("[mapasagua] ERROR response:", txt);
    throw new Error("Pipe not found");
  }

  return res.json();
}

/* =========================
   PATCH PIPE (editar)
========================= */
export async function patchPipe(
  id: string,
  payload: Record<string, any>
) {
  const url = `${API_BASE}/mapa/mapasagua/pipes/${id}`;

  // 🔎 LOG PATCH
  console.log("[mapasagua] PATCH", url, payload);

  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  console.log("[mapasagua] PATCH status:", res.status);

  if (!res.ok) {
    const txt = await res.text();
    console.error("[mapasagua] PATCH ERROR:", txt);
    throw new Error("Error updating pipe");
  }

  const json = await res.json();
  console.log("[mapasagua] PATCH OK id:", json?.id);

  return json;
}
