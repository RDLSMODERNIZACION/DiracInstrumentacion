// src/lib/me.ts
import { useEffect, useMemo, useState, useCallback } from "react";
import { useApi } from "./api";

/** Lo que realmente devuelve /dirac/me/locations en tu backend */
export type MeLocation = {
  location_id: number;
  location_name: string;
  access: "view" | "control" | "admin";
  company_id?: number | null;
};

/** Empresa derivada desde locations (sin /dirac/me) */
export type MeCompany = {
  company_id: number;
  company_name: string; // fallback "Empresa #id"
  role: string;         // derivado de access
  is_primary?: boolean;
};

export type MeResponse = {
  // No tenemos /dirac/me => no podemos poblar user real acá
  user?: { id?: number; email?: string; full_name?: string | null; status?: string; is_superadmin?: boolean };
  companies: MeCompany[];
  primary_company_id?: number | null;
  locations: MeLocation[];
};

const COMPANY_KEY = "dirac.company_id";

function roleFromAccess(access: MeLocation["access"]): MeCompany["role"] {
  if (access === "admin") return "admin";
  if (access === "control") return "operator";
  return "viewer";
}

/** Si querés un primary más inteligente, lo marcamos por storage o por primer company_id disponible */
function pickPrimaryCompanyId(companies: MeCompany[], persisted?: string | null) {
  if (persisted) {
    const pid = Number(persisted);
    if (Number.isFinite(pid) && companies.some((c) => c.company_id === pid)) return pid;
  }
  return companies[0]?.company_id ?? null;
}

export function useMe() {
  const { getJSON } = useApi();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [companyId, _setCompanyId] = useState<number | null>(null);

  const setCompanyId = useCallback((cid: number | null) => {
    _setCompanyId(cid);
    if (cid == null) sessionStorage.removeItem(COMPANY_KEY);
    else sessionStorage.setItem(COMPANY_KEY, String(cid));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const rows: MeLocation[] = await getJSON("/dirac/me/locations");
      if (!Array.isArray(rows)) throw new Error("Respuesta inesperada en /dirac/me/locations");

      // companies derivadas desde locations
      const byCompany = new Map<number, { bestRole: MeCompany["role"] }>();

      for (const r of rows) {
        const cid = r.company_id == null ? null : Number(r.company_id);
        if (cid == null || !Number.isFinite(cid)) continue;

        const role = roleFromAccess(r.access);
        const curr = byCompany.get(cid);

        // jerarquía: admin > operator > viewer
        const rank = (x: MeCompany["role"]) => (x === "admin" ? 3 : x === "operator" ? 2 : 1);
        if (!curr || rank(role) > rank(curr.bestRole)) {
          byCompany.set(cid, { bestRole: role });
        }
      }

      const companies: MeCompany[] = Array.from(byCompany.entries()).map(([company_id, v]) => ({
        company_id,
        company_name: `Empresa #${company_id}`,
        role: v.bestRole,
      }));

      companies.sort((a, b) => a.company_id - b.company_id);

      const persisted = sessionStorage.getItem(COMPANY_KEY);
      const primary_company_id = pickPrimaryCompanyId(companies, persisted);

      // marcar primary
      for (const c of companies) c.is_primary = c.company_id === primary_company_id;

      const data: MeResponse = {
        companies,
        primary_company_id,
        locations: rows,
      };

      setMe(data);

      // companyId elegido
      _setCompanyId(primary_company_id);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setMe(null);
      _setCompanyId(null);
    } finally {
      setLoading(false);
    }
  }, [getJSON]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const companies = useMemo(
    () => (me?.companies ?? []).slice().sort((a, b) => a.company_id - b.company_id),
    [me]
  );

  return { me, companies, companyId, setCompanyId, loading, err, refresh };
}

export function useCompanySummary(companyId?: number | null) {
  const { getJSON } = useApi();
  const [data, setData] = useState<{ locations: number; tanks: number; pumps: number; valves: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!companyId) {
        setData(null);
        return;
      }
      setLoading(true);
      setErr(null);
      try {
        const s = await getJSON(`/dirac/me/locations/summary?company_id=${companyId}`);
        setData(s);
      } catch (e: any) {
        setErr(e?.message || String(e));
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId, getJSON]);

  return { data, loading, err };
}
