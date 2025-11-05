import React, { useEffect, useState } from "react";
import Section from "../components/Section";
import { useApi } from "../lib/api";
import SlideOver from "../components/SlideOver";
import LocationEditor from "../components/LocationEditor";

type Location = { id: number; name: string; company_id?: number|null; address?: string|null; lat?: number|null; lon?: number|null };

export default function Locations() {
  const { getJSON, postJSON } = useApi();
  const [items, setItems] = useState<Location[]>([]);
  const [name, setName] = useState("");
  const [company_id, setCompanyId] = useState<number | "">("");
  const [editing, setEditing] = useState<Location | null>(null);

  async function load() {
    const rows = await getJSON("/dirac/admin/locations");
    setItems(rows);
  }
  useEffect(()=>{ load(); }, []);

  async function create() {
    const payload: any = { name };
    if (company_id !== "") payload.company_id = Number(company_id);
    await postJSON("/dirac/locations", payload);
    setName(""); setCompanyId("");
    await load();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Localizaciones</h1>

      <Section title="Crear localización" right={null}>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <div className="text-xs text-slate-500">Nombre</div>
            <input className="border rounded px-2 py-1" value={name} onChange={e=>setName(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-slate-500">Empresa ID (opcional)</div>
            <input className="border rounded px-2 py-1" value={company_id} onChange={e=>setCompanyId(e.target.value as any)} />
          </div>
          <button onClick={create} className="px-3 py-1.5 rounded bg-blue-600 text-white">Crear</button>
        </div>
      </Section>

      <Section title="Listado (click en una fila para editar)" right={null}>
        <table className="min-w-full text-sm">
          <thead><tr className="text-left">
            <th className="px-2 py-1">ID</th>
            <th className="px-2 py-1">Nombre</th>
            <th className="px-2 py-1">Empresa</th>
          </tr></thead>
          <tbody>
            {items.map(l => (
              <tr key={l.id} className="border-t hover:bg-slate-50 cursor-pointer" onClick={()=>setEditing(l)}>
                <td className="px-2 py-1">{l.id}</td>
                <td className="px-2 py-1">{l.name}</td>
                <td className="px-2 py-1">{l.company_id ?? "—"}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={3} className="px-2 py-6 text-center text-slate-500">Sin localizaciones</td></tr>
            )}
          </tbody>
        </table>
      </Section>

      <SlideOver
        open={!!editing}
        title={editing ? `Editar localización #${editing.id}` : ""}
        onClose={()=>setEditing(null)}
      >
        {editing && (
          <LocationEditor
            location={editing as any}
            onSaved={async ()=>{ setEditing(null); await load(); }}
            onClose={()=>setEditing(null)}
          />
        )}
      </SlideOver>
    </div>
  );
}
