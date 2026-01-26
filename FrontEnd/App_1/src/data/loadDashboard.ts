// src/data/loadDashboard.ts
import { MOCK_DATA } from "./mock";

type AnyObj = Record<string, any>;

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").toString().trim();
const ORG_ID = (import.meta.env.VITE_ORG_ID ?? "").toString().trim();
const SEND_ORG_AS_QUERY = false;

const DEFAULT_LOC_ID = Number(import.meta.env.VITE_LOCATION_ID ?? 1) || 1;
const DEFAULT_WINDOW = (import.meta.env.VITE_KPI_WINDOW ?? "7d").toString();

function buildUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>
) {
  if (!API_BASE) throw new Error("VITE_API_BASE no configurado");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(cleanPath, API_BASE);

  if (SEND_ORG_AS_QUERY) {
    const org = (ORG_ID || "1").trim();
    if (org && !url.searchParams.has("org_id")) url.searchParams.set("org_id", org);
  }

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url;
}

function ms(n: number) {
  return `${Math.round(n)}ms`;
}

async function getJSON<T = AnyObj>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  init?: RequestInit,
  opts?: { timeoutMs?: number; debug?: boolean }
): Promise<T | null> {
  const url = buildUrl(path, params);
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    // si tu backend usa X-Org-Id, mantenelo:
    "X-Org-Id": (ORG_ID || "1").trim(),
    ...(init?.headers ?? {}),
  };

  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? 15000;
  const t = setTimeout(() => controller.abort(), timeoutMs);

  const t0 = performance.now();
  try {
    if (opts?.debug) {
      console.groupCollapsed(`[getJSON] → ${url.pathname}${url.search}`);
      console.log("method = GET");
      console.log("timeout =", timeoutMs);
      console.log("headers =", headers);
      console.groupEnd();
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      ...init,
      headers,
      signal: controller.signal,
      // ⚠️ si tu API es cross-origin y usa cookies, cambiá a "include"
      credentials: init?.credentials ?? "same-origin",
    });

    const bodyText = await res.text();
    const dt = performance.now() - t0;

    if (!res.ok) {
      console.warn(`[getJSON] ${res.status} ${res.statusText} (${ms(dt)}) -> ${url}`, bodyText);
      return null;
    }

    try {
      const json = JSON.parse(bodyText);
      if (opts?.debug) {
        console.groupCollapsed(`[getJSON] ✓ ${url.pathname}${url.search} (${ms(dt)})`);
        console.log("payload =", json);
        console.groupEnd();
      } else if (dt > 1200) {
        console.warn(`[getJSON] lento ${url.pathname} (${ms(dt)})`);
      }
      return json as T;
    } catch (e) {
      console.warn(`[getJSON] JSON parse error (${ms(dt)}) -> ${url}`, e);
      return null;
    }
  } catch (err: any) {
    const dt = performance.now() - t0;
    const msg = err?.name === "AbortError" ? `timeout ${timeoutMs}ms` : (err?.message || err);
    console.warn(`[getJSON] error (${ms(dt)}) -> ${url}`, msg);
    return null;
  } finally {
    clearTimeout(t);
  }
}

export type DashboardData = {
  overview?: AnyObj; // /kpi/overview
  locations?: AnyObj[]; // /kpi/locations
  byLocation?: AnyObj[]; // /kpi/by-location

  // legacy para compatibilidad con MOCK_DATA
  org?: AnyObj;
  kpis?: AnyObj;
  assets?: AnyObj[];
  latest?: AnyObj[];
  timeseries?: AnyObj;
  alarms?: AnyObj[];
  analytics30d?: AnyObj;
  topology?: AnyObj;
};

type LoadDashboardOpts = {
  locationId?: number;
  window?: string;

  /** si true, trae locations y by-location además del overview */
  includeOptional?: boolean;

  /** si true, mezcla MOCK_DATA como fallback (útil dev) */
  useMockFallback?: boolean;

  /** cache en memoria para evitar refetch */
  cacheTtlMs?: number;

  /** si true y hay cache, devuelve cache al instante y refresca en bg */
  staleWhileRevalidate?: boolean;

  /** timeout para cada request */
  timeoutMs?: number;

  debug?: boolean;
};

type CacheEntry<T> = {
  exp: number;
  value?: T;
  inflight?: Promise<T>;
};

const DEFAULT_CACHE_TTL = 20_000;
const cache = new Map<string, CacheEntry<DashboardData>>();

function cacheKey(locId: number, window: string) {
  // separa por API_BASE + org + loc + window
  return `${API_BASE}::org=${ORG_ID || "1"}::loc=${locId}::win=${window}`;
}

function safeArray(x: any): any[] | undefined {
  return Array.isArray(x) ? x : undefined;
}

// sanitiza byLocation para que pumps_count etc sean números
function sanitizeByLocation(rows?: AnyObj[]) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => ({
    ...r,
    pumps_count: r?.pumps_count != null ? Number(r.pumps_count) : r?.pumps_total != null ? Number(r.pumps_total) : r?.pumps != null ? Number(r.pumps) : r?.pumps_count,
    tanks_count: r?.tanks_count != null ? Number(r.tanks_count) : r?.tanks_total != null ? Number(r.tanks_total) : r?.tanks != null ? Number(r.tanks) : r?.tanks_count,
    valves_count: r?.valves_count != null ? Number(r.valves_count) : r?.valves_total != null ? Number(r.valves_total) : r?.valves != null ? Number(r.valves) : r?.valves_count,
    manifolds_count:
      r?.manifolds_count != null
        ? Number(r.manifolds_count)
        : r?.manifolds_total != null
        ? Number(r.manifolds_total)
        : r?.manifolds != null
        ? Number(r.manifolds)
        : r?.manifolds_count,
  }));
}

function logOpt(path: string, e: any) {
  console.warn(`[loadDashboard] opcional ${path}:`, e?.message || e);
}

async function fetchDashboardOnce(opts: Required<Pick<
  LoadDashboardOpts,
  "locationId" | "window" | "includeOptional" | "useMockFallback" | "timeoutMs" | "debug"
>>) {
  const { locationId, window, includeOptional, useMockFallback, timeoutMs, debug } = opts;

  // base: si usás mock fallback, empezamos con mock; si no, arrancamos vacío
  const result: DashboardData = useMockFallback ? ({ ...MOCK_DATA } as DashboardData) : {};

  // 1) overview (principal)
  const overview = await getJSON<AnyObj>(
    "/kpi/overview",
    { loc_id: locationId, window },
    undefined,
    { timeoutMs, debug }
  ).catch((err) => {
    console.warn("[loadDashboard] /kpi/overview:", err?.message || err);
    return null;
  });

  if (overview) result.overview = overview;

  // 2) endpoints adicionales (opcionales)
  if (includeOptional) {
    const [locs, byLoc] = await Promise.all([
      getJSON<AnyObj[]>("/kpi/locations", undefined, undefined, { timeoutMs, debug })
        .then((v) => safeArray(v) ?? result.locations)
        .catch((e) => {
          logOpt("/kpi/locations", e);
          return result.locations;
        }),

      getJSON<AnyObj[]>("/kpi/by-location", undefined, undefined, { timeoutMs, debug })
        .then((v) => sanitizeByLocation(safeArray(v)) ?? result.byLocation)
        .catch((e) => {
          logOpt("/kpi/by-location", e);
          return result.byLocation;
        }),
    ]);

    result.locations = locs;
    result.byLocation = byLoc;
  }

  if (debug) {
    console.groupCollapsed("[loadDashboard] RESULT");
    console.log("overview.keys =", result.overview ? Object.keys(result.overview) : "(null)");
    console.log("locations.count =", result.locations?.length ?? 0);
    console.log("byLocation.count =", result.byLocation?.length ?? 0);
    console.groupEnd();
  }

  return result;
}

export async function loadDashboard(opts: LoadDashboardOpts = {}): Promise<DashboardData> {
  const locationId = opts.locationId ?? DEFAULT_LOC_ID;
  const window = (opts.window ?? DEFAULT_WINDOW).toString();
  const includeOptional = opts.includeOptional ?? true;
  const useMockFallback = opts.useMockFallback ?? true;

  const cacheTtlMs = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL;
  const swr = opts.staleWhileRevalidate ?? true;

  const timeoutMs = opts.timeoutMs ?? 15_000;
  const debug = opts.debug ?? false;

  const key = cacheKey(locationId, window);
  const now = Date.now();
  const e = cache.get(key);

  // cache fresh
  if (e?.value && e.exp > now) return e.value;

  // cache stale (SWR): devolvé ya + refrescá bg
  if (swr && e?.value) {
    if (!e.inflight) {
      const p = fetchDashboardOnce({
        locationId,
        window,
        includeOptional,
        useMockFallback,
        timeoutMs,
        debug,
      }).then((val) => {
        cache.set(key, { exp: Date.now() + cacheTtlMs, value: val });
        return val;
      }).finally(() => {
        const cur = cache.get(key);
        if (cur?.inflight) cache.set(key, { exp: cur.exp, value: cur.value });
      });

      cache.set(key, { exp: now + cacheTtlMs, value: e.value, inflight: p });
    }
    return e.value;
  }

  // dedupe inflight
  if (e?.inflight) return e.inflight;

  const inflight = fetchDashboardOnce({
    locationId,
    window,
    includeOptional,
    useMockFallback,
    timeoutMs,
    debug,
  }).then((val) => {
    cache.set(key, { exp: Date.now() + cacheTtlMs, value: val });
    return val;
  }).finally(() => {
    const cur = cache.get(key);
    if (cur?.inflight) cache.set(key, { exp: cur.exp, value: cur.value });
  });

  cache.set(key, { exp: now + cacheTtlMs, inflight });
  return inflight;
}

/** por si cambias org/company/login */
export function invalidateDashboardCache() {
  cache.clear();
}
