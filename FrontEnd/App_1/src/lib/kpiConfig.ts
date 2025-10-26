/**
 * Config común para API KPI (compat X-Org-Id y x_org_id)
 */
const API_BASE_RAW = (import.meta.env.VITE_API_BASE ?? "https://diracinstrumentacion.onrender.com").toString().trim();
export const API_BASE = API_BASE_RAW.replace(/\/$/, "");

const ORG_ID_RAW = (import.meta.env.VITE_ORG_ID ?? "").toString().trim();
export const ORG_ID = Number(ORG_ID_RAW);

export const DEFAULT_LOCATION_ID = (() => {
  const raw = (import.meta.env.VITE_LOCATION_ID ?? "").toString().trim();
  return raw ? Number(raw) : undefined;
})();

// Fallar temprano si falta ORG_ID
if (!Number.isFinite(ORG_ID) || ORG_ID <= 0) {
  console.error("[KPI] VITE_ORG_ID inválido o vacío. Definí VITE_ORG_ID en tu .env");
  throw new Error("VITE_ORG_ID inválido o vacío. Definí VITE_ORG_ID en tu .env");
}

export function buildUrl(path: string, params?: Record<string, any>) {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "" && v !== false) {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

export function kpiHeaders(extra?: HeadersInit): HeadersInit {
  // 👇 Mandamos ambas variantes para cubrir convert_underscores=False del backend
  const base: Record<string, string> = {
    "X-Org-Id": String(ORG_ID),
    "x_org_id": String(ORG_ID),
  };
  return { ...(extra as any), ...base };
}

export async function getJSON<T>(path: string, params?: Record<string, any>, init?: RequestInit) {
  const url = buildUrl(path, params);
  const headers = { ...(init?.headers || {}), ...kpiHeaders() };

  console.info("[KPI][GET]", url, headers);

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("[KPI][ERR]", res.status, res.statusText, url, txt);
    throw new Error(`[${res.status} ${res.statusText}] ${url}\n${txt}`);
  }
  return (await res.json()) as T;
}
