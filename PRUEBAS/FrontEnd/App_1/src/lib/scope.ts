// src/lib/scope.ts

const DEBUG =
  String(import.meta.env?.VITE_DEBUG_SCOPE ?? "") === "1" ||
  (typeof localStorage !== "undefined" &&
    localStorage.getItem("DEBUG_SCOPE") === "1");

function log(...args: any[]) {
  if (DEBUG) console.debug("[scope]", ...args);
}

function toNum(v: any): number | null {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type ScopeResolution = {
  companyId: number | null;
  source: "explicit" | "url" | "session" | "local" | "env" | "none";
};

/**
 * Resuelve el company_id siguiendo esta prioridad:
 *   1) cid explícito (argumento)
 *   2) URL ?company_id= / ?org_id=
 *   3) sessionStorage / localStorage (dirac.company_id)
 *   4) VITE_COMPANY_ID / VITE_ORG_ID (solo para dev)
 */
export function resolveScope(cidOverride?: number | null): ScopeResolution {
  // 1) explícito
  const fromExplicit = toNum(cidOverride);
  if (fromExplicit) {
    log("scope from explicit =", fromExplicit);
    return { companyId: fromExplicit, source: "explicit" };
  }

  // 2) URL
  let fromUrl: number | null = null;
  if (typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      fromUrl =
        toNum(params.get("company_id")) ?? toNum(params.get("org_id"));
      if (fromUrl) {
        log("scope from URL =", fromUrl);
        return { companyId: fromUrl, source: "url" };
      }
    } catch (e) {
      log("error parsing URL params", e);
    }
  }

  // 3) sessionStorage / localStorage
  let fromStorage: number | null = null;
  if (typeof window !== "undefined") {
    try {
      fromStorage =
        toNum(window.sessionStorage.getItem("dirac.company_id")) ??
        toNum(window.localStorage.getItem("dirac.company_id"));
      if (fromStorage) {
        log("scope from storage =", fromStorage);
        return { companyId: fromStorage, source: "session" };
      }
    } catch (e) {
      log("error reading storage", e);
    }
  }

  // 4) ENV (fallback para desarrollo)
  const envCid =
    toNum(import.meta.env?.VITE_COMPANY_ID) ??
    toNum(import.meta.env?.VITE_ORG_ID);
  if (envCid) {
    log("scope from ENV =", envCid);
    return { companyId: envCid, source: "env" };
  }

  log("no company_id resolved");
  return { companyId: null, source: "none" };
}

/**
 * Toma una URL absoluta y le agrega ?company_id=XX si no estaba.
 */
export function withScope(baseUrl: string, cid?: number | null): string {
  const { companyId } = resolveScope(cid);

  if (!companyId) {
    // No forzamos nada, dejamos la URL como vino.
    return baseUrl;
  }

  try {
    const url = new URL(baseUrl);
    if (!url.searchParams.get("company_id")) {
      url.searchParams.set("company_id", String(companyId));
    }
    const out = url.toString();
    log("withScope", { in: baseUrl, out });
    return out;
  } catch (e) {
    log("withScope error", e);
    return baseUrl;
  }
}

// Helpers para debugear desde consola
export function forceCompanyId(cid: number) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem("dirac.company_id", String(cid));
  window.localStorage.setItem("dirac.company_id", String(cid));
  log("forced company_id", cid);
}

export function clearCompanyId() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem("dirac.company_id");
  window.localStorage.removeItem("dirac.company_id");
  log("cleared company_id");
}
