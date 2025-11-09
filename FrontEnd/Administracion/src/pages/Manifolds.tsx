// src/pages/Manifolds.tsx
import React, { useEffect, useMemo, useState } from "react";
import Section from "../components/Section";
import { useApi } from "../lib/api";
import SlideOver from "../components/SlideOver";
import ManifoldEditor from "../components/ManifoldEditor";

type Row = { id: number; name: string; location_id?: number|null };
type Company = { id: number; name: string };
type Location = { id: number; name: string; company_id?: number|null };

export default function Manifolds() {
  const { getJSON, postJSON } = useApi();

  // data
  const [items, setItems] = useState<Row[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [err, setErr] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);

  // create
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState<number| "">("");
  const [locationId, setLocationId] = useState<number| "">("");
  const [locationName, setLocationName] = useState("");

  // filters
  const [filterCompanyId, setFilterCompanyId] = useState<number|"">("");

  // editor
  const [editing, setEditing] = useState<Row|null>(null);

  async function loadCompanies() {
    const cs: Company[] = await getJSON("/dirac/admin/companies");
    setCompanies(cs);
  }

  async function loadLocations(cid?: number) {
    const ls: Location[] = await getJSON(
      cid ? `/dirac/admin/locations?company_id=${cid}` : "/dirac/admin/locations"
    );
    setLocations(ls);
  }

  async function loadList() {
    setLoading(true); setErr(null);
    try {
      const qs = filterCompanyId !== "" ? `?company_id=${Number(filterCompanyId)}` : "";
      const rows: Row[] = await getJSON(`/dirac/admin/manifolds${qs}`);
      setItems(rows);
    } catch (e:any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCompanies(); loadLocations(); loadList(); }, []);
  useEffect(() => { loadList(); if (filterCompanyId!=="") loadLocations(Number(filterCompanyId)); }, [filterCompanyId]);

  const companiesById = useMemo(() => {
    const m = new Map<number, Company>(); companies.forEach(c => m.set(c.id, c)); return m;
  }, [companies]);

  async function create() {
    setErr(null);
    try {
      const payload:any = { name: name.trim() };
      if (!payload.name) { setErr("Ingresá un nombre"); return; }
      if (locationId !== "") {
        payload.location_id = Number(locationId);
      } else {
        if (companyId === "" || !locationName.trim()) {
          setErr("Elegí una ubicación o poné empresa + nombre de ubicación");
          return;
        }
        payload.company_id = Number(companyId);
        payload.location_name = locationName.trim();
      }
      await postJSON("/dirac/admin/manifolds", payload);
      // reset
      setName(""); setCompanyId(""); setLocationId(""); setLocationName("");
      await loadList();
    } catch (e:any) {
      setErr(e?.message || String(e));
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Manifolds</h1>

      {/* Filtros */}
      <Section title="Filtros" right={null}>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <div className="text-xs text-slate-500">Empresa</div>
            <select
              className="border rounded px-2 py-1"
              value={filterCompanyId}
              onChange={(e)=> setFilterCompanyId(e.target.value===""?"":Number(e.target.value))}
            >
              <option value="">(todas)</option>
              {companies.map(c=> <option key={c.id} value={c.id}>{c.name} #{c.id}</option>)}
            </select>
          </div>
          <button onClick={loadList} className="px-3 py-1.5 rounded bg-slate-900 text-white">Aplicar</button>
          <button onClick={async()=>{ setFilterCompanyId(""); await loadList(); }} className="px-3 py-1.5 rounded bg-slate-200">Limpiar</button>
        </div>
        {err && <div className="text-sm text-red-600 mt-2">{err}</div>}
      </Section>

      {/* Crear */}
      <Section title="Crear manifold" right={null}>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <div className="text-xs text-slate-500">Nombre</div>
            <input className="border rounded px-2 py-1" value={name} onChange={(e)=>setName(e.target.value)} placeholder="Ej. Colector principal" />
          </div>

          <div>
            <div className="text-xs text-slate-500">Ubicación (existente)</div>
            <select className="border rounded px-2 py-1" value={locationId} onChange={(e)=>setLocationId(e.target.value===""?"":Number(e.target.value))}>
              <option value="">(crear nueva…)</option>
              {locations.map(l=> <option key={l.id} value={l.id}>{l.name} #{l.id}</option>)}
            </select>
          </div>

          <div className="text-slate-400 text-xs">o</div>

          <div>
            <div className="text-xs text-slate-500">Empresa (para crear ubicación)</div>
            <select className="border rounded px-2 py-1" value={companyId} onChange={(e)=>setCompanyId(e.target.value===""?"":Number(e.target.value))}>
              <option value="">(sin empresa)</option>
              {companies.map(c=> <option key={c.id} value={c.id}>{c.name} #{c.id}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs text-slate-500">Nombre de ubicación (si se crea)</div>
            <input className="border rounded px-2 py-1" value={locationName} onChange={(e)=>setLocationName(e.target.value)} placeholder="Ej. Planta Norte" />
          </div>

          <button onClick={create} className="px-3 py-1.5 rounded bg-blue-600 text-white">Crear</button>
        </div>
      </Section>

      {/* Listado */}
      <Section title="Listado (click para editar)" right={loading ? <span className="text-xs text-slate-500">Cargando…</span> : null}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-2 py-1">ID</th>
              <th className="px-2 py-1">Nombre</th>
              <th className="px-2 py-1">Ubicación</th>
              <th className="px-2 py-1">Empresa</th>
            </tr>
          </thead>
          <tbody>
            {items.map(m=>(
              <tr key={m.id} className="border-t hover:bg-slate-50 cursor-pointer" onClick={()=>setEditing(m)}>
                <td className="px-2 py-1">{m.id}</td>
                <td className="px-2 py-1">{m.name}</td>
                <td className="px-2 py-1">{m.location_id ?? "—"}</td>
                <td className="px-2 py-1">
                  {(() => {
                    const loc = locations.find(l => l.id === m.location_id);
                    return loc?.company_id ?? "—";
                  })()}
                </td>
              </tr>
            ))}
            {items.length===0 && (
              <tr><td colSpan={4} className="px-2 py-6 text-center text-slate-500">{loading ? "Cargando…" : "Sin manifolds"}</td></tr>
            )}
          </tbody>
        </table>
      </Section>

      {/* Editor */}
      <SlideOver open={!!editing} title={editing ? `Editar manifold #${editing.id}` : ""} onClose={()=>setEditing(null)}>
        {editing && (
          <ManifoldEditor
            row={editing}
            onSaved={async()=>{ setEditing(null); await loadList(); }}
            onClose={()=>setEditing(null)}
          />
        )}
      </SlideOver>
    </div>
  );
}
