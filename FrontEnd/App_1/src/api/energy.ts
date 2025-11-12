// API para traer la distribución mensual por franja horaria (torta).
// Evita depender de un named export específico: usa un wrapper compatible.

import * as http from "@/lib/http";

export type EnergyBucket = { key: string; label: string; kwh: number };
export type EnergyDistribution = {
  month: string;           // "YYYY-MM"
  total_kwh: number;       // suma de buckets
  buckets: EnergyBucket[]; // ej: [{ key:"VALLE", label:"Valle (00–06)", kwh:123.4 }, ...]
};

// Intenta usar helpers del proyecto si existen; si no, cae a fetch().
async function getJSONCompat<T>(url: string): Promise<T> {
  const anyHttp = http as any;

  if (typeof anyHttp.getJSON === "function") return anyHttp.getJSON(url);
  if (typeof anyHttp.fetchJSON === "function") return anyHttp.fetchJSON(url);
  if (typeof anyHttp.get === "function") return anyHttp.get(url);

  const headers: Record<string, string> = { Accept: "application/json" };

  // Si tu http expone algo tipo getAuthHeader(), úsalo; si no, probá storage.
  if (typeof anyHttp.getAuthHeader === "function") {
    const h = anyHttp.getAuthHeader();
    if (h) headers.Authorization = h;
  } else {
    const basic =
      sessionStorage.getItem("BASIC_AUTH") ||
      localStorage.getItem("BASIC_AUTH") ||
      localStorage.getItem("Authorization");
    if (basic) headers.Authorization = basic;
  }

  const res = await fetch(url, { headers, credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchEnergyDistribution(params: {
  month: string; // "YYYY-MM"
  locationId?: number;
  tz?: string;
}): Promise<EnergyDistribution | null> {
  const url = new URL("/kpi/energy/distribution", window.location.origin);
  url.searchParams.set("month", params.month);
  if (params.locationId) url.searchParams.set("location_id", String(params.locationId));
  if (params.tz) url.searchParams.set("tz", params.tz);

  try {
    const data = await getJSONCompat<EnergyDistribution>(url.toString());
    if (!data || !Array.isArray((data as any).buckets)) {
      return { month: params.month, total_kwh: 0, buckets: [] };
    }
    return data;
  } catch (e) {
    console.error("[energy] distribution fetch error:", e);
    return null;
  }
}
