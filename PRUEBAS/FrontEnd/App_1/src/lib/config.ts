// src/lib/config.ts
import { withScope } from "@/lib/scope";
import { authHeaders } from "@/lib/http";

/**
 * Raíz del backend:
 * - Primero VITE_API_ROOT
 * - Luego VITE_API_BASE (compat con otros módulos)
 * - Fallback al dominio productivo
 */
export function getApiRoot(): string {
  const base =
    import.meta.env.VITE_API_ROOT?.trim() ||
    import.meta.env.VITE_API_BASE?.trim() ||
    "https://diracinstrumentacion.onrender.com";
  return base.replace(/\/$/, ""); // sin trailing slash
}

/**
 * Headers comunes para llamadas al backend.
 * - Content-Type / Accept JSON
 * - X-API-Key si está definido (mismo esquema que infraestructura)
 * - Authorization: Basic ... si está seteado en session/localStorage (ver src/lib/http.ts)
 *
 * Podés pasar `extra` para fusionar headers específicos.
 */
export function getApiHeaders(extra?: HeadersInit): HeadersInit {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...authHeaders(),
  };

  const apiKey = import.meta.env.VITE_API_KEY?.trim();
  if (apiKey) h["X-API-Key"] = apiKey;

  // Fusionar headers extra (aplana HeadersInit → objeto)
  if (extra) {
    if (extra instanceof Headers) {
      extra.forEach((v, k) => (h[k] = v));
    } else if (Array.isArray(extra)) {
      for (const [k, v] of extra) h[k] = String(v);
    } else {
      Object.assign(h, extra as Record<string, string>);
    }
  }
  return h;
}

/**
 * Compone una URL absoluta al backend y le agrega ?company_id=XX si no estaba.
 * Ej: scopedUrl("/tanks/status") -> "https://api.../tanks/status?company_id=7"
 *     scopedUrl("tanks/status")  -> igual (normaliza el slash)
 */
export function scopedUrl(path: string, cid?: number | null): string {
  const root = getApiRoot();
  const p = path.startsWith("/") ? path : `/${path}`;
  return withScope(`${root}${p}`, cid);
}
