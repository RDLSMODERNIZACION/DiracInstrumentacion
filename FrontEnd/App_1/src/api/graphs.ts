// src/api/graphs.ts
//
// API helper para consultas gráficas del módulo KPI.
//
// Mantiene compatibilidad con endpoints existentes:
//   - /kpi/bombas/live
//   - /kpi/tanques/live
//   - /kpi/graphs/buckets
//   - /kpi/graphs/pumps/active
//   - /kpi/graphs/tanks/level_avg
//   - /kpi/pumps/status
//   - /kpi/tanks/latest
//
// Agrega endpoints nuevos de operación:
//   Bombas:
//   - /kpi/bombas/operation/summary-24h
//   - /kpi/bombas/operation/on-1m
//   - /kpi/bombas/operation/timeline-1m
//   - /kpi/bombas/operation/events
//
//   Tanques:
//   - /kpi/tanques/operation/summary-24h
//   - /kpi/tanques/operation/level-1m
//   - /kpi/tanques/operation/events
//
// Notas:
// - Todas las URL se construyen con withScope(...).
// - http<T> agrega auth headers, timeout y dedupe de requests GET.
// - credentials: "omit" para evitar problemas CORS con credenciales cruzadas.
// - buildQS ignora null/undefined y transforma arrays en CSV.
// - Fechas: usar strings ISO. Si tenés Date/ms, usar toISO(...).

import { withScope } from "@/lib/scope";
import { authHeaders } from "@/lib/http";

/** Base de API sin slash final. */
const BASE =
  (import.meta.env?.VITE_API_BASE?.replace?.(/\/$/, "")) ??
  "https://diracinstrumentacion.onrender.com";

/* =========================================================
 * Tipos comunes
 * =======================================================*/

export type ApiWindow = {
  from: string;
  to: string;
};

export type OperationSeverity = "normal" | "info" | "warning" | "critical" | string;

export type OperationState = "run" | "stop";

export type DataQuality = "ok" | "dato viejo" | "sin dato";

export type BucketName = "1min" | "5min" | "15min" | "1h" | "1d";

export type ApiOkResponse<TItem = any, TSummary = any> = {
  ok: boolean;
  window?: ApiWindow | { last_hours: number };
  count?: number;
  summary?: TSummary;
  items?: TItem[];
};

/* =========================================================
 * Tipos legacy
 * =======================================================*/

export type Bucket = {
  local_hour: string;
};

export type PumpsActive = {
  local_hour: string;
  pumps_count: number;
};

export type TankLevelAvg = {
  local_hour: string;
  avg_level_pct: number | null;
};

export type PumpsLiveResp = {
  timestamps: number[];
  is_on: Array<number | null>;
  pumps_total: number;
  pumps_connected: number;
  window: ApiWindow;
  bucket?: string;
  agg_mode?: string;
};

export type TanksLiveResp = {
  timestamps: number[];
  level_percent: Array<number | null>;
  tanks_total: number;
  tanks_connected: number;
  window: ApiWindow;
  bucket?: string;
};

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
  low_pct?: number | null;
  low_low_pct?: number | null;
  high_pct?: number | null;
  high_high_pct?: number | null;
  age_sec?: number | null;
  alarma?: string | null;
};

/* =========================================================
 * Tipos nuevos - Operación Bombas
 * =======================================================*/

export type PumpOperationSummary = {
  pumps_total: number;
  pumps_online: number;
  pumps_offline: number;

  pumps_running: number;
  pumps_stopped: number;

  starts_24h: number;
  stops_24h: number;

  running_seconds_24h: number;
  stopped_seconds_24h: number;

  avg_availability_pct_24h: number | null;
  avg_online_pct_24h: number | null;

  pumps_with_alert: number;
  without_communication: number;
  cycling_severe: number;
  low_availability: number;
  no_running: number;
  high_utilization: number;
};

export type PumpOperationSummaryItem = {
  pump_id: number;
  pump_name: string;
  location_id: number | null;
  location_name: string | null;

  current_state: OperationState | string | null;
  current_state_label: string | null;
  current_state_at: string | null;

  online: boolean;
  data_quality: DataQuality | string | null;
  last_hb_at: string | null;
  age_sec: number | null;

  starts_24h: number;
  stops_24h: number;

  running_seconds_24h: number;
  stopped_seconds_24h: number;

  availability_pct_24h: number | null;
  online_pct_24h: number | null;

  minutes_online: number;
  minutes_offline: number;

  estado_operativo: string;
};

export type PumpOperationSummaryResp = {
  ok: boolean;
  window: { last_hours: number };
  summary: PumpOperationSummary;
  count: number;
  items: PumpOperationSummaryItem[];
};

export type PumpOperationOn1mItem = {
  minute_ts: string;
  ts_ms: number;
  local_minute_ts: string;

  pumps_total: number;
  pumps_online: number;
  pumps_offline: number;

  pumps_on: number;
  pumps_off: number;

  pumps_on_pct: number | null;
  online_pct: number | null;
};

export type PumpOperationOn1mResp = {
  ok: boolean;
  window: ApiWindow;
  count: number;
  timestamps: number[];
  pumps_on: number[];
  pumps_off: number[];
  pumps_online: number[];
  pumps_offline: number[];
  items: PumpOperationOn1mItem[];
};

export type PumpOperationTimelineItem = {
  minute_ts: string;
  ts_ms: number;
  day_ts: string;
  local_minute_ts: string;

  pump_id: number;
  pump_name: string | null;
  location_id: number | null;
  location_name: string | null;

  is_on: boolean;
  state: OperationState | string;
  state_label: string;
  on_int: number;

  last_hb_at: string | null;
  age_sec: number | null;
  online: boolean;
  data_quality: DataQuality | string;
};

export type PumpOperationTimelineResp = {
  ok: boolean;
  window: ApiWindow;
  count: number;
  items: PumpOperationTimelineItem[];
};

export type PumpOperationEvent = {
  id: number;

  event_ts: string;
  event_ts_ms: number;

  pump_id: number;
  pump_name: string | null;
  location_id: number | null;
  location_name: string | null;

  state: OperationState | string;
  state_label: string;

  started_at: string;
  ended_at: string | null;

  duration_seconds: number | null;
  duration_label: string | null;

  is_open: boolean;
  source: string | null;
  created_at: string | null;

  severity: OperationSeverity;
};

export type PumpOperationEventsResp = {
  ok: boolean;
  window: ApiWindow;
  count: number;
  items: PumpOperationEvent[];
};

/* =========================================================
 * Tipos nuevos - Operación Tanques
 * =======================================================*/

export type TankOperationSummary = {
  tanks_total: number;
  tanks_online: number;
  tanks_offline: number;

  tanks_in_alarm: number;

  low_critical_count: number;
  low_count: number;
  high_critical_count: number;
  high_count: number;

  min_level_24h: number | null;
  max_level_24h: number | null;
  avg_level_24h: number | null;

  active_events: number;
};

export type TankOperationSummaryItem = {
  tank_id: number;
  tank_name: string;
  location_id: number | null;
  location_name: string | null;

  current_level: number | null;
  last_level_at: string | null;

  min_24h: number | null;
  min_24h_at: string | null;

  max_24h: number | null;
  max_24h_at: string | null;

  avg_24h: number | null;
  samples_24h: number | null;

  low_pct: number | null;
  low_low_pct: number | null;
  high_pct: number | null;
  high_high_pct: number | null;

  age_sec: number | null;
  online: boolean | null;
  alarma: string | null;

  estado_operativo: string;
  severity: OperationSeverity;
};

export type TankOperationSummaryResp = {
  ok: boolean;
  window: { last_hours: number };
  summary: TankOperationSummary;
  count: number;
  items: TankOperationSummaryItem[];
};

export type TankOperationLevelItem = {
  minute_ts: string;
  ts_ms: number;
  local_minute_ts: string;

  tank_id?: number;
  tank_name?: string;
  location_id?: number | null;
  location_name?: string | null;

  level_avg: number | null;
  level_min: number | null;
  level_max: number | null;
  samples: number | null;

  tanks_count?: number;

  low_pct?: number | null;
  low_low_pct?: number | null;
  high_pct?: number | null;
  high_high_pct?: number | null;

  online?: boolean | null;
  alarma?: string | null;
  estado_operativo?: string;
};

export type TankOperationLevelResp = {
  ok: boolean;
  bucket: BucketName | string;
  aggregate: boolean;
  window: ApiWindow;
  count: number;
  items: TankOperationLevelItem[];

  /** Solo cuando aggregate=true */
  timestamps?: number[];
  level_avg?: Array<number | null>;
  level_min?: Array<number | null>;
  level_max?: Array<number | null>;
};

export type TankOperationEvent = {
  id: number;

  event_ts: string;
  event_ts_ms: number;

  tank_id: number;
  tank_name: string | null;
  location_id: number | null;
  location_name: string | null;

  event_type: "low" | "low_low" | "high" | "high_high" | string;
  event_label: string;

  configured_limit: number | null;
  detected_value: number | null;

  started_at: string;
  ended_at: string | null;

  started_local: string | null;
  ended_local: string | null;

  duration_seconds: number | null;
  duration_label: string | null;

  status: "active" | "normalized" | string;
  status_label: string;

  is_open: boolean;
  severity: OperationSeverity;

  created_at: string | null;
  raw?: Record<string, any> | null;
};

export type TankOperationEventsResp = {
  ok: boolean;
  window: ApiWindow;
  count: number;
  items: TankOperationEvent[];
};

/* =========================================================
 * Utilidades internas
 * =======================================================*/

const DEFAULT_TIMEOUT_MS = 15_000;

const inflight = new Map<string, Promise<any>>();

function inflightKey(url: string, init?: RequestInit) {
  const m = (init?.method ?? "GET").toUpperCase();
  return `${m} ${url}`;
}

async function http<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number; dedupeKey?: string }
): Promise<T> {
  const url = withScope(`${BASE}${path}`);
  const method = (init?.method ?? "GET").toUpperCase();

  const key = init?.dedupeKey
    ? `${init.dedupeKey}::${inflightKey(url, init)}`
    : inflightKey(url, init);

  const shouldDedupe = method === "GET";

  if (shouldDedupe) {
    const hit = inflight.get(key);
    if (hit) return hit as Promise<T>;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    init?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

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

export function toISO(input: Date | number | string): string {
  if (typeof input === "string") return input;
  if (typeof input === "number") return new Date(input).toISOString();
  return input.toISOString();
}

export function lastHoursWindow(hours = 24) {
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

/* =========================================================
 * Endpoints KPI existentes
 * =======================================================*/

export function fetchBuckets(fromISO: string, toISO: string) {
  const qs = buildQS({ from: fromISO, to: toISO });
  return http<Bucket[]>(`/kpi/graphs/buckets?${qs}`, {
    dedupeKey: "kpi:buckets",
  });
}

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

  return http<PumpsActive[]>(`/kpi/graphs/pumps/active?${qs}`, {
    dedupeKey: "kpi:pumpsActive",
  });
}

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

  return http<TankLevelAvg[]>(`/kpi/graphs/tanks/level_avg?${qs}`, {
    dedupeKey: "kpi:tankLevelAvg",
  });
}

/* =========================================================
 * Legacy LIVE - Bombas
 * =======================================================*/

export type PumpsLiveArgs = {
  from?: string;
  to?: string;
  locationId?: number;
  companyId?: number;
  pumpIds?: number[];
  connectedOnly?: boolean;

  /** Ahora el backend soporta 1min real. */
  bucket?: "1min" | "5min" | "15min" | "1h" | "1d";

  aggMode?: "avg" | "max";
  roundCounts?: boolean;
};

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

  return http<PumpsLiveResp>(`/kpi/bombas/live?${qs}`, {
    dedupeKey: "kpi:pumpsLive",
  });
}

/* =========================================================
 * Legacy LIVE - Tanques
 * =======================================================*/

export type TanksLiveArgs = {
  from?: string;
  to?: string;
  locationId?: number;
  companyId?: number;
  tankIds?: number[];
  agg?: "avg" | "last";
  carry?: boolean;
  bucket?: "1min" | "5min" | "15min" | "1h" | "1d";
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

  return http<TanksLiveResp>(`/kpi/tanques/live?${qs}`, {
    dedupeKey: "kpi:tanksLive",
  });
}

/* =========================================================
 * Listados para filtros
 * =======================================================*/

export function listPumps(opts?: { locationId?: number; companyId?: number }) {
  const qs = buildQS({
    location_id: opts?.locationId,
    company_id: opts?.companyId,
  });

  return http<PumpInfo[]>(`/kpi/pumps/status?${qs}`, {
    dedupeKey: "kpi:listPumps",
  });
}

export function listTanks(opts?: {
  locationId?: number;
  companyId?: number;
  includeLive?: boolean;
}) {
  const qs = buildQS({
    location_id: opts?.locationId,
    company_id: opts?.companyId,
    include_live: opts?.includeLive ?? false,
  });

  return http<TankInfo[]>(`/kpi/tanks/latest?${qs}`, {
    dedupeKey: "kpi:listTanks",
  });
}

/* =========================================================
 * Operación PRO - Bombas
 * =======================================================*/

export type OperationPumpScopeArgs = {
  companyId?: number;
  locationId?: number;
  pumpIds?: number[];
};

export type FetchOperationPumpSummaryArgs = OperationPumpScopeArgs & {
  onlyProblems?: boolean;
  limit?: number;
};

export function fetchOperationPumpSummary24h(
  args: FetchOperationPumpSummaryArgs = {}
) {
  const qs = buildQS({
    company_id: args.companyId,
    location_id: args.locationId,
    pump_ids: args.pumpIds,
    only_problems: args.onlyProblems ?? false,
    limit: args.limit ?? 200,
  });

  return http<PumpOperationSummaryResp>(
    `/kpi/bombas/operation/summary-24h?${qs}`,
    { dedupeKey: "kpi:operation:pumps:summary24h" }
  );
}

export type FetchOperationPumpsOn1mArgs = OperationPumpScopeArgs & {
  from?: string;
  to?: string;
  onlineOnly?: boolean;
};

export function fetchOperationPumpsOn1m(args: FetchOperationPumpsOn1mArgs = {}) {
  const qs = buildQS({
    from: args.from,
    to: args.to,
    company_id: args.companyId,
    location_id: args.locationId,
    pump_ids: args.pumpIds,
    online_only: args.onlineOnly ?? false,
  });

  return http<PumpOperationOn1mResp>(
    `/kpi/bombas/operation/on-1m?${qs}`,
    { dedupeKey: "kpi:operation:pumps:on1m" }
  );
}

export type FetchOperationPumpTimelineArgs = OperationPumpScopeArgs & {
  from?: string;
  to?: string;
  state?: OperationState;
  online?: boolean;
  dataQuality?: DataQuality;
  limit?: number;
};

export function fetchOperationPumpTimeline1m(
  args: FetchOperationPumpTimelineArgs = {}
) {
  const qs = buildQS({
    from: args.from,
    to: args.to,
    company_id: args.companyId,
    location_id: args.locationId,
    pump_ids: args.pumpIds,
    state: args.state,
    online: args.online,
    data_quality: args.dataQuality,
    limit: args.limit ?? 200000,
  });

  return http<PumpOperationTimelineResp>(
    `/kpi/bombas/operation/timeline-1m?${qs}`,
    { dedupeKey: "kpi:operation:pumps:timeline1m" }
  );
}

export type FetchOperationPumpEventsArgs = OperationPumpScopeArgs & {
  from?: string;
  to?: string;
  state?: OperationState;
  onlyOpen?: boolean;
  limit?: number;
};

export function fetchOperationPumpEvents(
  args: FetchOperationPumpEventsArgs = {}
) {
  const qs = buildQS({
    from: args.from,
    to: args.to,
    company_id: args.companyId,
    location_id: args.locationId,
    pump_ids: args.pumpIds,
    state: args.state,
    only_open: args.onlyOpen ?? false,
    limit: args.limit ?? 500,
  });

  return http<PumpOperationEventsResp>(
    `/kpi/bombas/operation/events?${qs}`,
    { dedupeKey: "kpi:operation:pumps:events" }
  );
}

/* =========================================================
 * Operación PRO - Tanques
 * =======================================================*/

export type OperationTankScopeArgs = {
  companyId?: number;
  locationId?: number;
  tankIds?: number[];
};

export type FetchOperationTankSummaryArgs = OperationTankScopeArgs & {
  onlyProblems?: boolean;
  limit?: number;
};

export function fetchOperationTankSummary24h(
  args: FetchOperationTankSummaryArgs = {}
) {
  const qs = buildQS({
    company_id: args.companyId,
    location_id: args.locationId,
    tank_ids: args.tankIds,
    only_problems: args.onlyProblems ?? false,
    limit: args.limit ?? 200,
  });

  return http<TankOperationSummaryResp>(
    `/kpi/tanques/operation/summary-24h?${qs}`,
    { dedupeKey: "kpi:operation:tanks:summary24h" }
  );
}

export type FetchOperationTankLevelArgs = OperationTankScopeArgs & {
  from?: string;
  to?: string;
  bucket?: BucketName;
  aggregate?: boolean;
  limit?: number;
};

export function fetchOperationTankLevel1m(
  args: FetchOperationTankLevelArgs = {}
) {
  const qs = buildQS({
    from: args.from,
    to: args.to,
    company_id: args.companyId,
    location_id: args.locationId,
    tank_ids: args.tankIds,
    bucket: args.bucket ?? "1min",
    aggregate: args.aggregate ?? false,
    limit: args.limit ?? 200000,
  });

  return http<TankOperationLevelResp>(
    `/kpi/tanques/operation/level-1m?${qs}`,
    { dedupeKey: "kpi:operation:tanks:level1m" }
  );
}

export type FetchOperationTankEventsArgs = OperationTankScopeArgs & {
  from?: string;
  to?: string;
  eventType?: "low" | "low_low" | "high" | "high_high";
  status?: "active" | "normalized";
  onlyActive?: boolean;
  limit?: number;
};

export function fetchOperationTankEvents(
  args: FetchOperationTankEventsArgs = {}
) {
  const qs = buildQS({
    from: args.from,
    to: args.to,
    company_id: args.companyId,
    location_id: args.locationId,
    tank_ids: args.tankIds,
    event_type: args.eventType,
    status: args.status,
    only_active: args.onlyActive ?? false,
    limit: args.limit ?? 500,
  });

  return http<TankOperationEventsResp>(
    `/kpi/tanques/operation/events?${qs}`,
    { dedupeKey: "kpi:operation:tanks:events" }
  );
}

/* =========================================================
 * Aliases cómodos
 * =======================================================*/

export const fetchOperationPumpsSummary24h = fetchOperationPumpSummary24h;
export const fetchOperationPumpsTimeline1m = fetchOperationPumpTimeline1m;
export const fetchOperationPumpsEvents = fetchOperationPumpEvents;

export const fetchOperationTanksSummary24h = fetchOperationTankSummary24h;
export const fetchOperationTanksLevel1m = fetchOperationTankLevel1m;
export const fetchOperationTanksEvents = fetchOperationTankEvents;