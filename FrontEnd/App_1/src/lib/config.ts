// src/lib/config.ts
import { withScope } from "@/lib/scope";
import { authHeaders } from "@/lib/http";

/**
 * Raíz del backend:
 * - Primero VITE_API_ROOT
 * - Luego VITE_API_BASE (compat con otros módulos)
 * - Fallback al dominio productivo
 *
 * Esto NO maneja company_id. El scope se agrega después vía withScope().
 */
export function getApiRoot(): string {
  const base =
    import.meta.env.VITE_API_ROOT?.trim() ||
    import.meta.env.VITE_API_BASE?.trim() ||
    "https://diracinstrumentacion.onrender.com";

  // sin trailing slash
  return base.replace(/\/$/, "");
}

/**
 * Headers comunes para llamadas al backend.
 * - Accept JSON
 * - Content-Type JSON (para requests con body)
 * - Authorization: Basic ... si está seteado en session/localStorage (ver src/lib/http.ts)
 * - X-API-Key si está definido (igual esquema que infraestructura)
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
      extra.forEach((v, k) => {
        h[k] = v;
      });
    } else if (Array.isArray(extra)) {
      for (const [k, v] of extra) {
        h[k] = String(v);
      }
    } else {
      Object.assign(h, extra as Record<string, string>);
    }
  }

  return h;
}

/**
 * Compone una URL absoluta al backend y le agrega ?company_id=XX si no estaba.
 *
 * El company_id se resuelve en withScope() a partir de:
 *   - cid explícito (argumento)
 *   - URL (?company_id= / ?org_id=)
 *   - sessionStorage / localStorage (dirac.company_id, seteado luego del login)
 *   - (solo en DEV) VITE_COMPANY_ID / VITE_ORG_ID
 *
 * Ej:
 *   scopedUrl("/tanks/status") -> "https://api.../tanks/status?company_id=7"
 *   scopedUrl("tanks/status")  -> idem (normaliza el slash)
 */
export function scopedUrl(path: string, cid?: number | null): string {
  const root = getApiRoot();
  const p = path.startsWith("/") ? path : `/${path}`;
  return withScope(`${root}${p}`, cid);
}
