// src/lib/scope.ts

const DEBUG =
  String(import.meta.env?.VITE_DEBUG_SCOPE ?? "") === "1" ||
  localStorage.getItem("DEBUG_SCOPE") === "1";

function log(...args: any[]) {
  if (DEBUG) console.debug("[scope]", ...args);
}

function toNum(v: any): number | null {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type ScopeResolution = {
  companyId: number | null;
  from: "query" | "session" | "local" | "env" | "none";
  details?: Record<string, any>;
};

export function getCompanyIdDetailed(): ScopeResolution {
  try {
    // 1) ?company_id=XX
    const qs = new URLSearchParams(window.location.search);
    const q = toNum(qs.get("company_id"));
    if (q) {
      log("found company_id in query", q);
      return { companyId: q, from: "query", details: { qs: window.location.search } };
    }

    // 2) sessionStorage
    const sRaw =
      sessionStorage.getItem("dirac.company_id") ??
      sessionStorage.getItem("company_id");
    const s = toNum(sRaw);
    if (s) {
      log("found company_id in sessionStorage", sRaw);
      return { companyId: s, from: "session" };
    }

    // 3) localStorage
    const lRaw =
      localStorage.getItem("dirac.company_id") ??
      localStorage.getItem("company_id");
    const l = toNum(lRaw);
    if (l) {
      log("found company_id in localStorage", lRaw);
      return { companyId: l, from: "local" };
    }

    // 4) ENV (Vite)
    const envRaw =
      (import.meta.env?.VITE_ORG_ID ?? import.meta.env?.VITE_COMPANY_ID ?? "")
        .toString()
        .trim();
    const env = toNum(envRaw);
    if (env) {
      log("found company_id in env", envRaw);
      return { companyId: env, from: "env" };
    }

    log("NO company_id found");
    return { companyId: null, from: "none" };
  } catch (e) {
    console.warn("[scope] error resolving company_id", e);
    return { companyId: null, from: "none", details: { error: String(e) } };
  }
}

export function getCompanyId(): number | null {
  return getCompanyIdDetailed().companyId;
}

/** Agrega ?company_id=XX si no está. Loguea el resultado. */
export function withScope(url: string, cid?: number | null): string {
  const res = getCompanyIdDetailed();
  const companyId = cid ?? res.companyId;
  if (!companyId) {
    log("NOT appending company_id (missing)", { url, resolver: res });
    return url;
  }
  if (/[?&]company_id=/.test(url)) {
    log("URL already has company_id, leaving as is", url);
    return url;
  }
  const sep = url.includes("?") ? "&" : "?";
  const final = `${url}${sep}company_id=${companyId}`;
  log("appending company_id", { from: res.from, final });
  return final;
}

// Helpers para debugear desde consola
export function forceCompanyId(cid: number) {
  sessionStorage.setItem("dirac.company_id", String(cid));
  localStorage.setItem("dirac.company_id", String(cid));
  log("forced company_id", cid);
}
export function clearCompanyId() {
  sessionStorage.removeItem("dirac.company_id");
  localStorage.removeItem("dirac.company_id");
  log("cleared company_id");
}
