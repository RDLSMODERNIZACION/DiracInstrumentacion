// src/components/CompanyBar.tsx
import React from "react";
import { useMe } from "../lib/me";

export default function CompanyBar() {
  const { me, companies, companyId, setCompanyId, loading, err } = useMe();

  if (err) return <div className="text-sm text-red-600">Error: {err}</div>;
  if (loading && !me) return <div className="text-sm text-slate-500">Cargando usuario…</div>;
  if (!me) return null;

  return (
    <div className="mb-3 flex items-end gap-3">
      <div>
        <div className="text-xs text-slate-500">Empresa</div>
        <select
          className="border rounded px-2 py-1 min-w-[16rem]"
          value={companyId ?? ""}
          onChange={(e)=> setCompanyId(e.target.value===""? null : Number(e.target.value))}
        >
          {companies.map(c=>(
            <option key={c.company_id} value={c.company_id}>
              {c.company_name} #{c.company_id}
            </option>
          ))}
        </select>
      </div>
      <div className="text-xs text-slate-500">Usuario: {me.user.full_name || me.user.email}</div>
      {me.user.is_superadmin && <span className="ml-2 px-2 py-0.5 text-xs bg-emerald-100 rounded">superadmin</span>}
    </div>
  );
}
