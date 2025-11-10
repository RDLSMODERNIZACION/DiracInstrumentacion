// src/lib/http.ts

/** Mapa simple de headers */
export type HeaderMap = Record<string, string>;

/**
 * Devuelve Authorization: Basic ... si hay sesión guardada.
 * - Fuente: sessionStorage/localStorage clave "dirac.basic"
 *   { basicToken: "Basic xxxxx" }
 */
export function authHeaders(): HeaderMap {
  try {
    // preferí sessionStorage; caé a localStorage si no está
    const raw =
      sessionStorage.getItem("dirac.basic") ??
      localStorage.getItem("dirac.basic");
    if (!raw) return {};
    const { basicToken } = JSON.parse(raw);
    if (typeof basicToken === "string" && basicToken.trim()) {
      return { Authorization: basicToken.trim() };
    }
  } catch {
    /* ignorar */
  }
  return {};
}

/**
 * Helper para fusionar headers existentes con Authorization.
 * Útil cuando ya tenés otros headers (Accept, Content-Type, X-API-Key, etc).
 */
export function withAuthHeaders(base?: HeadersInit): HeadersInit {
  const merged: Record<string, string> = {};

  // aplanar HeadersInit → objeto
  if (base) {
    if (base instanceof Headers) {
      base.forEach((v, k) => (merged[k] = v));
    } else if (Array.isArray(base)) {
      for (const [k, v] of base) merged[k] = String(v);
    } else {
      Object.assign(merged, base as Record<string, string>);
    }
  }

  Object.assign(merged, authHeaders());
  return merged;
}
