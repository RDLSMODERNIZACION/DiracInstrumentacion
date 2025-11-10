// src/api/graphs.ts
import { withScope } from "@/lib/scope";
import { authHeaders } from "@/lib/http";

const BASE =
  (import.meta.env?.VITE_API_BASE?.replace?.(/\/$/, "")) ??
  "https://diracinstrumentacion.onrender.com";

export type Bucket = { local_hour: string };
export type PumpsActive = { local_hour: string; pumps_count: number };
export type TankLevelAvg = { local_hour: string; avg_level_pct: number | null };

async function http<T>(path: string): Promise<T> {
  const url = withScope(`${BASE}${path}`);
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...authHeaders() },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[API ${res.status}] ${res.statusText} ::`, body || "(sin cuerpo)");
    throw new Error(`[API ${res.status}] ${res.statusText}`);
  }
  return res.json();
}

/** Buckets horarios entre [from, to] — usado para alinear series */
export function fetchBuckets(fromISO: string, toISO: string) {
  const qs = new URLSearchParams({ from: fromISO, to: toISO });
  return http<Bucket[]>(`/kpi/graphs/buckets?${qs.toString()}`);
}

/** Bombas activas por hora (opcional location_id) */
export function fetchPumpsActive(fromISO: string, toISO: string, locationId?: number) {
  const qs = new URLSearchParams({ from: fromISO, to: toISO });
  if (locationId != null) qs.set("location_id", String(locationId));
  return http<PumpsActive[]>(`/kpi/graphs/pumps/active?${qs.toString()}`);
}

/** Promedio de nivel por hora (opcional location_id o tank entity_id) */
export function fetchTankLevelAvg(fromISO: string, toISO: string, locationId?: number, entityId?: number) {
  const qs = new URLSearchParams({ from: fromISO, to: toISO });
  if (locationId != null) qs.set("location_id", String(locationId));
  if (entityId != null)  qs.set("entity_id",  String(entityId));
  return http<TankLevelAvg[]>(`/kpi/graphs/tanks/level_avg?${qs.toString()}`);
}
