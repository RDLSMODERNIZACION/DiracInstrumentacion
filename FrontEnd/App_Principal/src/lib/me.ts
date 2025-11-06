// src/lib/me.ts
import { useEffect, useMemo, useState, useCallback } from "react";
import { useApi } from "./api";

export type MeCompany = { company_id: number; company_name: string; role: string; is_primary?: boolean };
export type MeResponse = {
  user: { id: number; email: string; full_name?: string|null; status: string; is_superadmin: boolean };
  companies: MeCompany[];
  primary_company_id?: number | null;
};

const COMPANY_KEY = "dirac.company_id";

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
    setLoading(true); setErr(null);
    try {
      const data: MeResponse = await getJSON("/dirac/me");
      setMe(data);
      const persisted = sessionStorage.getItem(COMPANY_KEY);
      if (persisted) _setCompanyId(Number(persisted));
      else _setCompanyId((data.primary_company_id ?? data.companies?.[0]?.company_id) ?? null);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setMe(null);
      _setCompanyId(null);
    } finally {
      setLoading(false);
    }
  }, [getJSON]);

  useEffect(() => { refresh(); }, [refresh]);

  const companies = useMemo(
    () => (me?.companies ?? []).slice().sort((a,b)=>a.company_name.localeCompare(b.company_name)),
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
      if (!companyId) { setData(null); return; }
      setLoading(true); setErr(null);
      try {
        const s = await getJSON(`/dirac/me/summary?company_id=${companyId}`);
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
