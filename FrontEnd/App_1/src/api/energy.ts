// Distribución mensual de HORAS ON por bandas
import * as http from "@/lib/http";

export type EnergyBucketH = { key: string; label: string; hours: number };
export type EnergyRuntime = { month: string; total_hours: number; buckets: EnergyBucketH[] };

async function getJSONCompat<T>(url: string): Promise<T> {
  const anyHttp = http as any;
  if (typeof anyHttp.getJSON === "function") return anyHttp.getJSON(url);
  if (typeof anyHttp.fetchJSON === "function") return anyHttp.fetchJSON(url);
  const headers: Record<string, string> = { Accept: "application/json" };
  const basic =
    sessionStorage.getItem("BASIC_AUTH") ||
    localStorage.getItem("BASIC_AUTH") ||
    localStorage.getItem("Authorization");
  if (basic) headers.Authorization = basic;
  const res = await fetch(url, { headers, credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchEnergyRuntime(params: {
  month: string;              // "YYYY-MM"
  locationId?: number;
  tz?: string;
  bandSetId?: number;
}): Promise<EnergyRuntime | null> {
  // En tu backend quedó bajo /energy/runtime (sin /kpi)
  const url = new URL("/energy/runtime", window.location.origin);
  url.searchParams.set("month", params.month);
  if (params.locationId) url.searchParams.set("location_id", String(params.locationId));
  if (params.tz) url.searchParams.set("tz", params.tz);
  if (params.bandSetId) url.searchParams.set("band_set_id", String(params.bandSetId));

  try {
    const data = await getJSONCompat<EnergyRuntime>(url.toString());
    if (!data || !Array.isArray(data.buckets)) return null;
    return data;
  } catch (e) {
    console.error("[energy] runtime fetch error:", e);
    return null;
  }
}
