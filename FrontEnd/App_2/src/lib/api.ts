// src/lib/api.ts
import { withScope } from "./scope";
import { authHeaders } from "./http";         // Authorization: Basic ...
import { netLog, netError, netLogGroup } from "./netdebug";

export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, "") ||
  "https://diracinstrumentacion.onrender.com";

async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
  const scopedUrl = withScope(url);
  const headers = { Accept: "application/json", ...authHeaders() };

  const t0 = performance.now();
  netLogGroup("GET json()", { scopedUrl, headers, credentials: "omit" });

  let res: Response;
  try {
    res = await fetch(scopedUrl, {
      signal,
      headers,
      // Si tu backend requiere cookie para GET, descomentá:
      // credentials: "include",
    });
  } catch (err) {
    const t1 = performance.now();
    netError("GET failed (network)", { url: scopedUrl, durMs: Math.round(t1 - t0), err });
    throw err;
  }

  const t1 = performance.now();
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    netError("GET non-2xx", { url: scopedUrl, status: res.status, statusText: res.statusText, durMs: Math.round(t1 - t0), msg });
    throw new Error(`${res.status} ${res.statusText}${msg ? " - " + msg : ""}`);
  }

  netLog("GET ok", { url: scopedUrl, status: res.status, durMs: Math.round(t1 - t0) });
  return res.json();
}

/** Endpoints de ejemplo */
export const api = {
  getInfraGraph: (signal?: AbortSignal) =>
    json<any>(`${API_BASE}/plant/graph`, signal),
  getTanks: (signal?: AbortSignal) =>
    json<any[]>(`${API_BASE}/plant/tanks`, signal),
  getPumps: (signal?: AbortSignal) =>
    json<any[]>(`${API_BASE}/plant/pumps`, signal),
};
