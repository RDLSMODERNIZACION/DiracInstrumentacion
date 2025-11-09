// src/components/ManifoldEditor.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useApi } from "../lib/api";
import Section from "./Section";

type Row = { id: number; name: string; location_id?: number|null };
type Company = { id: number; name: string };
type Location = { id: number; name: string; company_id?: number|null };

export default function ManifoldEditor({
  row,
  onSaved,
  onClose,
}: {
  row: Row;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { getJSON, patchJSON, del } = useApi();

  const [name, setName] = useState(row.name);
  const [companyId, setCompanyId] = useState<number | "">("");
  const [locationId, setLocationId] = useState<number | "">(row.location_id ?? "");
  const [locationName, setLocationName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => { (async()=>{
    setCompanies(await getJSON("/dirac/admin/companies"));
  })(); }, []);

  useEffect(() => { (async()=>{
    if (companyId !== "") setLocations(await getJSON(`/dirac/admin/locations?company_id=${Number(companyId)}`));
    else setLocations(await getJSON("/dirac/admin/locations"));
  })(); }, [companyId]);

  const canSave = useMemo(() => name.trim().length > 0, [name]);

  async function save() {
    setErr(null); setBusy(true);
    try {
      const payload:any = { name: name.trim() };
      if (locationId !== "") {
        payload.location_id = Number(locationId);
      } else if (companyId !== "" && locationName.trim()) {
        payload.company_id = Number(companyId);
        payload.location_name = locationName.trim();
      }
      await patchJSON(`/dirac/admin/manifolds/${row.id}`, payload);
      onSaved();
    } catch (e:any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(force=false) {
    setErr(null); setBusy(true);
    try {
      await del(`/dirac/admin/manifolds/${row.id}${force ? "?force=true": ""}`);
      onSaved();
    } catch (e:any) {
      // si es 409 devolvé detalle
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Section title="Datos" right={null}>
        <div className="flex flex-col gap-3">
          <label className="text-sm">
            <div className="text-xs text-slate-500">Nombre</div>
            <input className="border rounded px-2 py-1 w-full" value={name} onChange={(e)=>setName(e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <div className="text-xs text-slate-500">Ubicación (existente)</div>
              <select className="border rounded px-2 py-1 w-full" value={locationId} onChange={(e)=>setLocationId(e.target.value===""?"":Number(e.target.value))}>
                <option value="">(crear nueva…)</option>
                {locations.map(l=> <option key={l.id} value={l.id}>{l.name} #{l.id}</option>)}
              </select>
            </label>
            <div className="text-slate-400 text-xs flex items-end">o</div>
            <label className="text-sm">
              <div className="text-xs text-slate-500">Empresa (para crear ubicación)</div>
              <select className="border rounded px-2 py-1 w-full" value={companyId} onChange={(e)=>setCompanyId(e.target.value===""?"":Number(e.target.value))}>
                <option value="">(sin empresa)</option>
                {companies.map(c=> <option key={c.id} value={c.id}>{c.name} #{c.id}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <div className="text-xs text-slate-500">Nombre de ubicación (si se crea)</div>
              <input className="border rounded px-2 py-1 w-full" value={locationName} onChange={(e)=>setLocationName(e.target.value)} placeholder="Ej. Planta Norte" />
            </label>
          </div>

          {err && <div className="text-sm text-red-600">{err}</div>}
          <div className="flex gap-2">
            <button onClick={save} disabled={!canSave || busy} className="px-3 py-1.5 rounded bg-blue-600 text-white">
              {busy ? "Guardando…" : "Guardar"}
            </button>
            <button onClick={()=>remove(false)} disabled={busy} className="px-3 py-1.5 rounded bg-red-600 text-white">Eliminar</button>
            <button onClick={()=>remove(true)} disabled={busy} className="px-3 py-1.5 rounded bg-rose-700 text-white" title="Forzar (borra layout + edges)">Forzar borrado</button>
            <button onClick={onClose} className="px-3 py-1.5 rounded bg-slate-200">Cerrar</button>
          </div>
        </div>
      </Section>
    </div>
  );
}
