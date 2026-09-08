import { useAuthedFetch, useAuth } from "./auth";

function addCompanyQuery(path: string, companyId: number | null) {
  if (companyId == null || !path.startsWith("/dirac/admin/")) return path;
  if (/[?&]company_id=/.test(path)) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}company_id=${companyId}`;
}

function scopeBody(body: any, companyId: number | null) {
  if (companyId == null) return body;
  if (body == null || Array.isArray(body) || typeof body !== "object") return body;
  return { ...body, company_id: companyId };
}

export function useApi() {
  const api = useAuthedFetch();
  const { companyId, companyName } = useAuth();

  async function getJSON(path: string) {
    // La administración ya no expone un catálogo global de empresas.
    if (path === "/dirac/admin/companies" && companyId != null) {
      return [{ id: companyId, name: companyName ?? `Empresa #${companyId}`, status: "active" }];
    }

    const scopedPath = addCompanyQuery(path, companyId);
    const res = await api(scopedPath);
    if (!res.ok) throw new Error(`GET ${scopedPath} -> ${res.status}`);
    return res.json();
  }

  async function postJSON(path: string, body: any) {
    const scopedPath = addCompanyQuery(path, companyId);
    const res = await api(scopedPath, {
      method: "POST",
      body: JSON.stringify(scopeBody(body, companyId)),
    });
    if (!res.ok) throw new Error(`POST ${scopedPath} -> ${res.status}`);
    return res.json();
  }

  async function patchJSON(path: string, body: any) {
    const scopedPath = addCompanyQuery(path, companyId);
    const res = await api(scopedPath, {
      method: "PATCH",
      body: JSON.stringify(scopeBody(body, companyId)),
    });
    if (!res.ok) throw new Error(`PATCH ${scopedPath} -> ${res.status}`);
    return res.json();
  }

  async function del(path: string) {
    const scopedPath = addCompanyQuery(path, companyId);
    const res = await api(scopedPath, { method: "DELETE" });
    if (!res.ok) throw new Error(`DELETE ${scopedPath} -> ${res.status}`);
    return res.json().catch(() => ({}));
  }

  return { getJSON, postJSON, patchJSON, del, companyId, companyName };
}
