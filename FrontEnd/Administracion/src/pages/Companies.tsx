// src/pages/Companies.tsx
import React, { useEffect, useState } from "react";
import Section from "../components/Section";
import { useApi } from "../lib/api";
import SlideOver from "../components/SlideOver";
import CompanyEditor from "../components/CompanyEditor";

type Company = { id: number; name: string; status: string };

export default function Companies() {
  const { getJSON, postJSON } = useApi();
  const [items, setItems] = useState<Company[]>([]);
  const [name, setName] = useState("Nueva Empresa");
  const [legal_name, setLegalName] = useState("");
  const [cuit, setCuit] = useState("");
  const [editing, setEditing] = useState<Company | null>(null);

  async function load() {
    const rows = await getJSON("/dirac/admin/companies");
    setItems(rows);
  }
  useEffect(()=>{ load(); }, []);

  async function create() {
    // usa endpoint público /dirac/companies (crea y te agrega como owner)
    await postJSON("/dirac/companies", { name, legal_name, cuit });
    setName("Nueva Empresa"); setLegalName(""); setCuit("");
    await load();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Empresas</h1>

      <Section title="Crear empresa" right={null}>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <div className="text-xs text-slate-500">Nombre</div>
            <input value={name} onChange={e=>setName(e.target.value)} className="border rounded px-2 py-1" />
          </div>
          <div>
            <div className="text-xs text-slate-500">Razón social</div>
            <input value={legal_name} onChange={e=>setLegalName(e.target.value)} className="border rounded px-2 py-1" />
          </div>
          <div>
            <div className="text-xs text-slate-500">CUIT</div>
            <input value={cuit} onChange={e=>setCuit(e.target.value)} className="border rounded px-2 py-1" />
          </div>
          <button onClick={create} className="px-3 py-1.5 rounded bg-blue-600 text-white">Crear</button>
        </div>
      </Section>

      <Section title="Listado (click en la fila para editar)" right={null}>
        <table className="min-w-full text-sm">
          <thead><tr className="text-left">
            <th className="px-2 py-1">ID</th>
            <th className="px-2 py-1">Nombre</th>
            <th className="px-2 py-1">Estado</th>
          </tr></thead>
          <tbody>
            {items.map(c => (
              <tr key={c.id} className="border-t hover:bg-slate-50 cursor-pointer" onClick={()=>setEditing(c)}>
                <td className="px-2 py-1">{c.id}</td>
                <td className="px-2 py-1">{c.name}</td>
                <td className="px-2 py-1">{c.status}</td>
              </tr>
            ))}
            {items.length===0 && (
              <tr><td colSpan={3} className="px-2 py-6 text-center text-slate-500">Sin empresas</td></tr>
            )}
          </tbody>
        </table>
      </Section>

      <SlideOver open={!!editing} title={editing ? `Editar empresa #${editing.id}` : ""} onClose={()=>setEditing(null)}>
        {editing && (
          <CompanyEditor
            company={editing}
            onSaved={async ()=>{ setEditing(null); await load(); }}
            onClose={()=>setEditing(null)}
          />
        )}
      </SlideOver>
    </div>
  );
}
