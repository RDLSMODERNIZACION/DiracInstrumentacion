// src/api/graphs.ts
//
// API helper para consultas “gráficas” del módulo KPI.
// Mantiene compatibilidad con los endpoints existentes y agrega:
//   - /kpi/bombas/live  (perfil continuo + bucket)
//   - /kpi/tanques/live (nivel promedio + bucket)
//   - listados de Bombas/Tanques por ubicación/empresa para filtros del front
//
// Notas de diseño:
// - Todas las URL se construyen con `withScope(...)` para respetar el scope multi-tenant.
// - `http<T>` agrega cabeceras de auth y timeout por defecto.
// - IMPORTANT: usamos `credentials: "omit"` para evitar bloqueo CORS con orígenes distintos.
// - `buildQS` arma querystrings ignorando null/undefined y soporta arrays (CSV).
// - Fechas: las funciones aceptan ISO strings; si enviás Date/ms, usá `toISO(...)`.
//

import { withScope } from "@/lib/scope";
import { authHeaders } from "@/lib/http";

/** Base de API (sin slash final). Se puede overridear con VITE_API_BASE en .env */
const BASE =
  (import.meta.env?.VITE_API_BASE?.replace?.(/\/$/, "")) ??
  "https://diracinstrumentacion.onrender.com";

/* =========================
 * Tipos de respuesta
 * =======================*/
export type Bucket = { local_hour: string };

export type PumpsActive = {
  local_hour: string;
  pumps_count: number;
};

export type TankLevelAvg = {
  local_hour: string;
  avg_level_pct: number | null;
};

export type PumpsLiveResp = {
  timestamps: number[];                   // epoch ms (alineado/bucketizado)
  is_on: Array<number | null>;            // cantidad de bombas ON por punto
  pumps_total: number;                    // total de bombas en el scope (empresa/loc o ids)
  pumps_connected: number;                // cuántas reportaron en la ventana
  window: { from: string; to: string };   // ISO-UTC
};

export type TanksLiveResp = {
  timestamps: number[];                   // epoch ms (alineado/bucketizado)
  level_percent: Array<number | null>;    // promedio por punto (ignora nulls)
  tanks_total: number;
  tanks_connected: number;
  window: { from: string; to: string };
};

/* Listados para filtros */
export type PumpInfo = {
  pump_id: number;
  name: string;
  location_id: number;
  location_name: string;
  state?: string;
  online?: boolean;
};
export type TankInfo = {
  tank_id: number;
  name: string;
  location_id: number;
  location_name: string;
  level_pct?: number | null;
  online?: boolean;
};

/* =========================
 * Utilidades internas
 * =======================*/

/** Timeout por defecto de requests */
const DEFAULT_TIMEOUT_MS = 15_000;

/** GET/POST genérico con auth, scope y timeout. */
async function http<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const url = withScope(`${BASE}${path}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: { Accept: "application/json", ...authHeaders(), ...(init?.headers ?? {}) },
      body: init?.body,
      signal: controller.signal,
      // ⚠️ Evitamos CORS con credenciales cruzadas. Si algún día necesitás cookies,
      // cambiá a "include" y configurá CORS en el backend con allow_credentials=True
      // y allow_origins sin wildcard.
      credentials: "omit",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[API ${res.status}] ${res.statusText} ::`, body || "(sin cuerpo)");
      throw new Error(`[API ${res.status}] ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

/** Construye un querystring ignorando null/undefined. Arrays → CSV. */
function buildQS(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (v.length) qs.set(k, v.join(","));
    } else {
      qs.set(k, String(v));
    }
  }
  return qs.toString();
}

/** Convierte Date | number (ms) | string ISO a string ISO */
export function toISO(input: Date | number | string): string {
  if (typeof input === "string") return input;
  if (typeof input === "number") return new Date(input).toISOString();
  return input.toISOString();
}

/* =========================
 * Endpoints KPI existentes
 * =======================*/

/** Buckets horarios entre [from, to] — usado para alinear series */
export function fetchBuckets(fromISO: string, toISO: string) {
  const qs = buildQS({ from: fromISO, to: toISO });
  return http<Bucket[]>(`/kpi/graphs/buckets?${qs}`);
}

/** Bombas activas por hora (soporta company_id y/o location_id) */
export function fetchPumpsActive(
  fromISO: string,
  toISO: string,
  opts?: { locationId?: number; companyId?: number }
) {
  const qs = buildQS({
    from: fromISO,
    to: toISO,
    location_id: opts?.locationId,
    company_id: opts?.companyId,
  });
  return http<PumpsActive[]>(`/kpi/graphs/pumps/active?${qs}`);
}

/** Promedio de nivel por hora (soporta company_id, location_id o tank entity_id) */
export function fetchTankLevelAvg(
  fromISO: string,
  toISO: string,
  opts?: { locationId?: number; entityId?: number; companyId?: number }
) {
  const qs = buildQS({
    from: fromISO,
    to: toISO,
    location_id: opts?.locationId,
    entity_id: opts?.entityId,
    company_id: opts?.companyId,
  });
  return http<TankLevelAvg[]>(`/kpi/graphs/tanks/level_avg?${qs}`);
}

/* =========================
 * LIVE: /kpi/bombas/live
 * =======================*/

export type PumpsLiveArgs = {
  /** Ventana de consulta en ISO-UTC (si no se envían, el backend usa últimas 24h). */
  from?: string;
  to?: string;
  /** Scope por ubicación/empresa; si no se envían y tampoco pumpIds, el backend toma bombas con actividad reciente. */
  locationId?: number;
  companyId?: number;
  /** Lista explícita de bombas a incluir (omite company/location). */
  pumpIds?: number[];
  /** True = cuenta sólo bombas con heartbeats en ventana (default backend). */
  connectedOnly?: boolean;
  /** Bucket de salida para ventanas largas. */
  bucket?: "1min" | "5min" | "15min" | "1h";
  /** Agregación por bucket (avg|max). */
  aggMode?: "avg" | "max";
  /** Redondear conteo por bucket (útil con avg). */
  roundCounts?: boolean;
};

/**
 * Serie continua de “bombas ON” en [from,to), minuto a minuto o bucketizada.
 * - Usa carry-forward del estado y alinea a minuto.
 * - Ideal para OpsPumpsProfile.
 */
export async function fetchPumpsLive(args: PumpsLiveArgs = {}) {
  const qs = buildQS({
    from: args.from,
    to: args.to,
    location_id: args.locationId,
    company_id: args.companyId,
    pump_ids: args.pumpIds,
    connected_only: args.connectedOnly,
    bucket: args.bucket ?? "1min",
    agg_mode: args.aggMode ?? "avg",
    round_counts: args.roundCounts ?? false,
  });
  return http<PumpsLiveResp>(`/kpi/bombas/live?${qs}`);
}

/* =========================
 * LIVE: /kpi/tanques/live
 * =======================*/

export type TanksLiveArgs = {
  from?: string;
  to?: string;
  locationId?: number;
  companyId?: number;
  tankIds?: number[];
  /** Agregación dentro del minuto (avg|last). */
  agg?: "avg" | "last";
  /** Carry-forward por minuto (LOCF). */
  carry?: boolean;
  /** Bucket de salida (1min|5min|15min|1h|1d). */
  bucket?: "1min" | "5min" | "15min" | "1h" | "1d";
  /** Sólo tanques con lecturas en ventana (default true). */
  connectedOnly?: boolean;
};

export async function fetchTanksLive(args: TanksLiveArgs = {}) {
  const qs = buildQS({
    from: args.from,
    to: args.to,
    location_id: args.locationId,
    company_id: args.companyId,
    tank_ids: args.tankIds,
    agg: args.agg ?? "avg",
    carry: args.carry ?? true,
    bucket: args.bucket ?? "1min",
    connected_only: args.connectedOnly ?? true,
  });
  return http<TanksLiveResp>(`/kpi/tanques/live?${qs}`);
}

/* =========================
 * Listados para filtros (bombas / tanques)
 * =======================*/

export function listPumps(opts?: { locationId?: number; companyId?: number }) {
  const qs = buildQS({
    location_id: opts?.locationId,
    company_id: opts?.companyId,
  });
  return http<PumpInfo[]>(`/kpi/pumps/status?${qs}`);
}

export function listTanks(opts?: { locationId?: number; companyId?: number }) {
  const qs = buildQS({
    location_id: opts?.locationId,
    company_id: opts?.companyId,
  });
  return http<TankInfo[]>(`/kpi/tanks/latest?${qs}`);
}
