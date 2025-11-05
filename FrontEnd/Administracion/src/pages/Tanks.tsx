import React, { useEffect, useState } from "react";
import Section from "../components/Section";
import { useApi } from "../lib/api";

type Tank = { id: number; name: string; location_id?: number|null };

export default function Tanks() {
  const { getJSON, postJSON, patchJSON, del } = useApi();
  const [items, setItems] = useState<Tank[]>([]);
  const [name, setName] = useState("");
  const [location_id, setLocationId] = useState<number | "">("");

  async function load() {
    const rows = await getJSON("/dirac/admin/tanks");
    setItems(rows);
  }
  useEffect(()=>{ load(); }, []);

  async function create() {
    await postJSON("/dirac/admin/tanks", { name, location_id: location_id===""?null:Number(location_id) });
    setName(""); setLocationId(""); await load();
  }
  async function update(t: Tank) {
    const newName = prompt("Nuevo nombre", t.name); if (!newName) return;
    await patchJSON(`/dirac/admin/tanks/${t.id}`, { name: newName });
    await load();
  }
  async function remove(id: number) {
    if (!confirm("¿Eliminar tanque?")) return;
    await del(`/dirac/admin/tanks/${id}`);
    await load();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Tanques</h1>

      <Section title="Crear tanque" right={null}>
        <div className="flex items-end gap-2 flex-wrap">
          <div><div className="text-xs text-slate-500">Nombre</div><input className="border rounded px-2 py-1" value={name} onChange={e=>setName(e.target.value)} /></div>
          <div><div className="text-xs text-slate-500">Location ID</div><input className="border rounded px-2 py-1" value={location_id} onChange={e=>setLocationId(e.target.value as any)} /></div>
          <button onClick={create} className="px-3 py-1.5 rounded bg-blue-600 text-white">Crear</button>
        </div>
      </Section>

      <Section title="Listado" right={null}>
        <table className="min-w-full text-sm">
          <thead><tr className="text-left"><th className="px-2 py-1">ID</th><th className="px-2 py-1">Nombre</th><th className="px-2 py-1">Location</th><th className="px-2 py-1">Acciones</th></tr></thead>
          <tbody>
            {items.map(t => (
              <tr key={t.id} className="border-t">
                <td className="px-2 py-1">{t.id}</td>
                <td className="px-2 py-1">{t.name}</td>
                <td className="px-2 py-1">{t.location_id ?? "—"}</td>
                <td className="px-2 py-1 space-x-2">
                  <button onClick={()=>update(t)} className="text-blue-600 underline">Editar</button>
                  <button onClick={()=>remove(t.id)} className="text-red-600 underline">Borrar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
