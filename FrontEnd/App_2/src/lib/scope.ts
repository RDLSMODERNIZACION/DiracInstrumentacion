// src/lib/scope.ts

/** Devuelve el company_id leído de la URL (querystring) si es válido (> 0) */
export function getCompanyIdFromURL(): number | null {
  try {
    const qs = new URLSearchParams(window.location.search);
    const raw = qs.get("company_id");
    if (raw == null) return null;
    const v = Number(String(raw).trim());
    if (!Number.isFinite(v) || v <= 0) return null;
    return v;
  } catch {
    return null;
  }
}

/** Agrega ?company_id=XX a una ruta si aún no lo tiene. */
export function withScope(path: string, cid?: number | null): string {
  const companyId = cid ?? getCompanyIdFromURL();
  if (!companyId) return path;
  if (path.includes("company_id=")) return path; // ya lo tiene
  const hasQuery = path.includes("?");
  return `${path}${hasQuery ? "&" : "?"}company_id=${companyId}`;
}
