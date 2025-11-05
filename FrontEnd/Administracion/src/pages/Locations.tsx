import React, { useEffect, useState } from "react";
import Section from "../components/Section";
import { useApi } from "../lib/api";

type Location = { id: number; name: string; company_id?: number|null; address?: string|null };

export default function Locations() {
  const { getJSON, postJSON } = useApi();
  const [items, setItems] = useState<Location[]>([]);
  const [name, setName] = useState("");
  const [company_id, setCompanyId] = useState<number | "">("");

  async function load() {
    const rows = await getJSON("/dirac/admin/locations");
    setItems(rows);
  }
  useEffect(()=>{ load(); }, []);

  async function create() {
    await postJSON("/dirac/locations", { name, company_id: company_id===""?null:Number(company_id) });
    setName(""); setCompanyId("");
    await load();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Localizaciones</h1>

      <Section title="Crear localización" right={null}>
        <div className="flex items-end gap-2 flex-wrap">
          <div><div className="text-xs text-slate-500">Nombre</div>
            <input className="border rounded px-2 py-1" value={name} onChange={e=>setName(e.target.value)} /></div>
          <div><div className="text-xs text-slate-500">Empresa ID (opcional)</div>
            <input className="border rounded px-2 py-1" value={company_id} onChange={e=>setCompanyId(e.target.value as any)} /></div>
          <button onClick={create} className="px-3 py-1.5 rounded bg-blue-600 text-white">Crear</button>
        </div>
      </Section>

      <Section title="Listado" right={null}>
        <table className="min-w-full text-sm">
          <thead><tr className="text-left"><th className="px-2 py-1">ID</th><th className="px-2 py-1">Nombre</th><th className="px-2 py-1">Empresa</th></tr></thead>
          <tbody>
            {items.map(l => (
              <tr key={l.id} className="border-t">
                <td className="px-2 py-1">{l.id}</td>
                <td className="px-2 py-1">{l.name}</td>
                <td className="px-2 py-1">{l.company_id ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
