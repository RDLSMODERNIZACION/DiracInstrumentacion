// src/lib/api.ts
import { withScope } from "./scope";

export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, "") ||
  "https://diracinstrumentacion.onrender.com"; // tu backend

async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
  // ⬇️ asegura que la URL lleve ?company_id=XX si no lo trae
  const scopedUrl = withScope(url);
  const res = await fetch(scopedUrl, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Ajustá las rutas a tus endpoints reales:
 * - getInfraGraph: grafo de nodos/edges (tanques, bombas, manifolds)
 * - getTanks: niveles/estados por tanque
 * - getPumps: estados de bombas
 */
export const api = {
  getInfraGraph: (signal?: AbortSignal) =>
    json<any>(`${API_BASE}/plant/graph`, signal),
  getTanks: (signal?: AbortSignal) =>
    json<any[]>(`${API_BASE}/plant/tanks`, signal),
  getPumps: (signal?: AbortSignal) =>
    json<any[]>(`${API_BASE}/plant/pumps`, signal),
};
