import React, { useEffect, useMemo, useState } from "react";
import Section from "../components/Section";
import { useApi } from "../lib/api";
import SlideOver from "../components/SlideOver";
import UserEditor from "../components/UserEditor";

type UserRow = { id: number; email: string; full_name?: string; status: string };
type Company = { id: number; name: string };
type Location = { id: number; name: string; company_id?: number|null };

export default function Users() {
  const { getJSON } = useApi();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [companyId, setCompanyId] = useState<number | "">("");
  const [locationId, setLocationId] = useState<number | "">("");

  const [selected, setSelected] = useState<UserRow | null>(null);

  async function load() {
    // Cargar combos
    const cs = await getJSON("/dirac/admin/companies");
    setCompanies(cs);
    if (companyId) {
      const ls = await getJSON(`/dirac/admin/locations?company_id=${companyId}`);
      setLocations(ls);
    } else {
      setLocations([]);
    }

    // Cargar la lista filtrada
    const params: string[] = [];
    if (companyId) params.push(`company_id=${companyId}`);
    if (locationId) params.push(`location_id=${locationId}`);
    const qs = params.length ? "?" + params.join("&") : "";
    const r = await getJSON(`/dirac/admin/users${qs}`);
    setRows(Array.isArray(r) ? r : (r.id ? [r] : []));
  }

  useEffect(()=>{ load(); }, [companyId, locationId]);

  function onCompanyChange(v: string) {
    const cid = v === "" ? "" : Number(v);
    setCompanyId(cid);
    setLocationId(""); // reset location cuando cambia empresa
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Usuarios</h1>

      <Section title="Filtros" right={null}>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <div className="text-xs text-slate-500">Empresa</div>
            <select className="border rounded px-2 py-1" value={companyId} onChange={(e)=>onCompanyChange(e.target.value)}>
              <option value="">(todas)</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name} #{c.id}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs text-slate-500">Localización</div>
            <select className="border rounded px-2 py-1" value={locationId} onChange={(e)=>setLocationId(e.target.value===""?"":Number(e.target.value))} disabled={!companyId}>
              <option value="">(todas)</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name} #{l.id}</option>)}
            </select>
          </div>
          <button onClick={()=>load()} className="px-3 py-1.5 rounded bg-slate-900 text-white">Buscar</button>
        </div>
      </Section>

      <Section title="Listado (click en una fila para editar)" right={null}>
        <table className="min-w-full text-sm">
          <thead><tr className="text-left">
            <th className="px-2 py-1">ID</th>
            <th className="px-2 py-1">Email</th>
            <th className="px-2 py-1">Nombre</th>
            <th className="px-2 py-1">Estado</th>
          </tr></thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.id} className="border-t hover:bg-slate-50 cursor-pointer" onClick={()=>setSelected(u)}>
                <td className="px-2 py-1">{u.id}</td>
                <td className="px-2 py-1">{u.email}</td>
                <td className="px-2 py-1">{u.full_name ?? "—"}</td>
                <td className="px-2 py-1">{u.status}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-2 py-6 text-center text-slate-500">Sin resultados</td></tr>
            )}
          </tbody>
        </table>
      </Section>

      <SlideOver open={!!selected} title={selected ? `Editar usuario #${selected.id}` : ""} onClose={()=>setSelected(null)}>
        {selected && (
          <UserEditor
            user={selected}
            onClose={()=>setSelected(null)}
            onSaved={async ()=>{ await load(); setSelected(null); }}
          />
        )}
      </SlideOver>
    </div>
  );
}
