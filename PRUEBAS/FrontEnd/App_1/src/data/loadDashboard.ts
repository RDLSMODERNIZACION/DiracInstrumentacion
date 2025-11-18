// src/data/loadDashboard.ts
import { MOCK_DATA } from "./mock";

type AnyObj = Record<string, any>;

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").toString().trim();
const ORG_ID = (import.meta.env.VITE_ORG_ID ?? "").toString().trim();
const SEND_ORG_AS_QUERY = false;

const DEBUG = true;

function buildUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>
) {
  if (!API_BASE) throw new Error("VITE_API_BASE no configurado");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(cleanPath, API_BASE);

  if (SEND_ORG_AS_QUERY) {
    const org = (ORG_ID || "1").trim();
    if (org && !url.searchParams.has("org_id")) {
      url.searchParams.set("org_id", org);
    }
  }

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url;
}

async function getJSON<T = AnyObj>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  init?: RequestInit
): Promise<T | null> {
  const url = buildUrl(path, params);
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "X-Org-Id": (ORG_ID || "1").trim(),
    ...(init?.headers ?? {}),
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);

  try {
    if (DEBUG) {
      console.groupCollapsed(`[getJSON] → ${url.pathname}${url.search}`);
      console.log("method = GET");
      console.log("headers =", headers);
      console.groupEnd();
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      ...init,
      headers,
      signal: controller.signal,
      credentials: "same-origin",
    });

    const bodyText = await res.text();
    if (!res.ok) {
      console.warn(`[getJSON] ${res.status} ${res.statusText} -> ${url}`, bodyText);
      return null;
    }
    try {
      const json = JSON.parse(bodyText);
      if (DEBUG) {
        console.groupCollapsed(`[getJSON] ✓ ${url.pathname}${url.search}`);
        console.log("payload =", json);
        console.groupEnd();
      }
      return json as T;
    } catch (e) {
      console.warn(`[getJSON] JSON parse error -> ${url}`, e);
      return null;
    }
  } catch (err: any) {
    console.warn(`[getJSON] error -> ${url}`, err?.message || err);
    return null;
  } finally {
    clearTimeout(t);
  }
}

export type DashboardData = {
  overview?: AnyObj;      // /kpi/overview  (incluye assets, latest, timeseries, alarms, analytics30d, topology)
  locations?: AnyObj[];   // /kpi/locations
  byLocation?: AnyObj[];  // /kpi/by-location
  // Campos legacy para compatibilidad con MOCK_DATA (no se pueblan desde el backend):
  org?: AnyObj;
  kpis?: AnyObj;
  assets?: AnyObj[];
  latest?: AnyObj[];
  timeseries?: AnyObj;
  alarms?: AnyObj[];
  analytics30d?: AnyObj;
  topology?: AnyObj;
};

function logOpt(path: string, e: any) {
  console.warn(`[loadDashboard] opcional ${path}:`, e?.message || e);
}

export async function loadDashboard(): Promise<DashboardData> {
  const result: DashboardData = { ...MOCK_DATA };

  const DEFAULT_LOC_ID = Number(import.meta.env.VITE_LOCATION_ID ?? 1) || 1;
  const DEFAULT_WINDOW = (import.meta.env.VITE_KPI_WINDOW ?? "7d").toString();

  // 1) overview (principal)
  await getJSON("/kpi/overview", { loc_id: DEFAULT_LOC_ID, window: DEFAULT_WINDOW })
    .then((v) => (result.overview = v ?? result.overview))
    .catch((err) => console.warn("[loadDashboard] /kpi/overview:", err?.message || err));

  // 2) endpoints reales adicionales
  await Promise.all([
    getJSON("/kpi/locations")
      .then((v) => (result.locations = Array.isArray(v) ? v : result.locations))
      .catch((e) => logOpt("/kpi/locations", e)),

    getJSON("/kpi/by-location")
      .then((v) => (result.byLocation = Array.isArray(v) ? v : result.byLocation))
      .catch((e) => logOpt("/kpi/by-location", e)),
  ]);

  if (DEBUG) {
    console.groupCollapsed("[loadDashboard] RESULT");
    console.log("overview.keys =", result.overview ? Object.keys(result.overview) : "(null)");
    console.log("locations.count =", result.locations?.length ?? 0);
    console.log("byLocation.count =", result.byLocation?.length ?? 0);
    console.groupEnd();
  }

  return result;
}
