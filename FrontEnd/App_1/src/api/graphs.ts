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
// ✅ Update (24h fijo):
// - Bombas: bucket por defecto 5min (y en backend ya lo forzamos a 5min).
// - Tanques: bucket por defecto 5min para mantener consistencia y rendimiento.
// - `http` agrega un cache in-flight opcional (dedupe) para evitar requests duplicados
//   si el mismo componente/hook llama dos veces (montaje doble, strict mode, etc).
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
  bucket?: string;                        // backend puede devolver bucket efectivo
  agg_mode?: string;
};

export type TanksLiveResp = {
  timestamps: number[];                   // epoch ms (alineado/bucketizado)
  level_percent: Array<number | null>;    // promedio por punto (ignora nulls)
  tanks_total: number;
  tanks_connected: number;
  window: { from: string; to: string };
  bucket?: string;
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

/**
 * Cache in-flight (dedupe):
 * Si se pide el mismo URL+method al mismo tiempo, devuelve la misma Promise.
 * Evita duplicados por montajes dobles y hooks concurrentes.
 */
const inflight = new Map<string, Promise<any>>();
function inflightKey(url: string, init?: RequestInit) {
  const m = (init?.method ?? "GET").toUpperCase();
  return `${m} ${url}`;
}

/** GET/POST genérico con auth, scope y timeout. */
async function http<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number; dedupeKey?: string }
): Promise<T> {
  const url = withScope(`${BASE}${path}`);
  const key = init?.dedupeKey ? `${init.dedupeKey}::${inflightKey(url, init)}` : inflightKey(url, init);

  // dedupe (solo para GET por defecto; para POST/PUT mejor no dedupe salvo que lo pidas explícito)
  const method = (init?.method ?? "GET").toUpperCase();
  const shouldDedupe = method === "GET";

  if (shouldDedupe) {
    const hit = inflight.get(key);
    if (hit) return hit as Promise<T>;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const p = (async () => {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          ...authHeaders(),
          ...(init?.headers ?? {}),
        },
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
  })();

  if (shouldDedupe) {
    inflight.set(key, p);
    p.finally(() => inflight.delete(key));
  }

  return p;
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
  /** Bucket de salida (fijamos 5min por default para 24h). */
  bucket?: "1min" | "5min" | "15min" | "1h";
  /** Agregación por bucket (avg|max). */
  aggMode?: "avg" | "max";
  /** Redondear conteo por bucket (útil con avg). */
  roundCounts?: boolean;
};

/**
 * Serie continua de “bombas ON” en [from,to), bucketizada.
 * ✅ 24h fijo → default 5min (y backend fuerza 5min).
 */
export async function fetchPumpsLive(args: PumpsLiveArgs = {}) {
  const qs = buildQS({
    from: args.from,
    to: args.to,
    location_id: args.locationId,
    company_id: args.companyId,
    pump_ids: args.pumpIds,
    connected_only: args.connectedOnly,
    // ✅ default 5min
    bucket: args.bucket ?? "5min",
    agg_mode: args.aggMode ?? "avg",
    round_counts: args.roundCounts ?? false,
  });
  // dedupeKey: evita doble llamada si un hook se monta 2 veces
  return http<PumpsLiveResp>(`/kpi/bombas/live?${qs}`, { dedupeKey: "kpi:pumpsLive" });
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
  /** Bucket de salida (default 5min para 24h). */
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
    // ✅ default 5min
    bucket: args.bucket ?? "5min",
    connected_only: args.connectedOnly ?? true,
  });
  return http<TanksLiveResp>(`/kpi/tanques/live?${qs}`, { dedupeKey: "kpi:tanksLive" });
}

/* =========================
 * Listados para filtros (bombas / tanques)
 * =======================*/

export function listPumps(opts?: { locationId?: number; companyId?: number }) {
  const qs = buildQS({
    location_id: opts?.locationId,
    company_id: opts?.companyId,
  });
  return http<PumpInfo[]>(`/kpi/pumps/status?${qs}`, { dedupeKey: "kpi:listPumps" });
}

export function listTanks(opts?: { locationId?: number; companyId?: number }) {
  const qs = buildQS({
    location_id: opts?.locationId,
    company_id: opts?.companyId,
  });
  return http<TankInfo[]>(`/kpi/tanks/latest?${qs}`, { dedupeKey: "kpi:listTanks" });
}
