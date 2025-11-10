// src/lib/scope.ts

/**
 * Lee el company_id (prioridad):
 * 1) Querystring (?company_id=XX)
 * 2) sessionStorage / localStorage (la app principal suele guardar "dirac.company_id")
 */
export function getCompanyId(): number | null {
  try {
    // 1) querystring
    const qs = new URLSearchParams(window.location.search);
    const raw = qs.get("company_id");
    if (raw) {
      const n = Number(String(raw).trim());
      if (Number.isFinite(n) && n > 0) return n;
    }

    // 2) storages
    const keys = ["dirac.company_id", "company_id"];
    for (const k of keys) {
      const v = (sessionStorage.getItem(k) ?? localStorage.getItem(k) ?? "").trim();
      if (!v) continue;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {
    // ignorar
  }
  return null;
}

/**
 * Devuelve la URL con ?company_id=XX si aún no lo tiene.
 * Ej: withScope("https://api/kpi/graphs") -> "https://api/kpi/graphs?company_id=7"
 */
export function withScope(url: string, cid?: number | null): string {
  const companyId = cid ?? getCompanyId();
  if (!companyId) return url;

  // Si ya trae company_id, no tocamos
  if (/[?&]company_id=/.test(url)) return url;

  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}company_id=${companyId}`;
}
