// src/api/graphs.ts
//
// API helper para consultas “gráficas” del módulo KPI.
// ⮕ Mantiene compatibilidad con las funciones existentes
//    y agrega /kpi/bombas/live para el nuevo perfil continuo de bombas.
//
// Notas de diseño:
// - Todas las URL se construyen con `withScope(...)` para respetar el scope multi-tenant.
// - `http<T>` agrega cabeceras de auth y timeout por defecto.
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
  timestamps: number[];            // epoch ms alineado a minuto
  is_on: number[];                 // cantidad de bombas ON por minuto
  pumps_total: number;             // total de bombas en el scope (empresa/loc o ids)
  pumps_connected: number;         // cuántas reportaron en la ventana
  window: { from: string; to: string }; // ISO-UTC
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
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Log de diagnóstico útil si falla la API
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
 * NUEVO: /kpi/bombas/live
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
};

/**
 * Serie continua por minuto de “bombas ON” en [from,to).
 * - Usa carry-forward del estado y alinea a minuto.
 * - Ideal para el gráfico OpsPumpsProfile.
 */
export async function fetchPumpsLive(args: PumpsLiveArgs = {}) {
  const qs = buildQS({
    from: args.from,
    to: args.to,
    location_id: args.locationId,
    company_id: args.companyId,
    pump_ids: args.pumpIds,
    connected_only: args.connectedOnly,
  });
  return http<PumpsLiveResp>(`/kpi/bombas/live?${qs}`);
}
