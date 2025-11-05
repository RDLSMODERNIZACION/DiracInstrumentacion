import React, { useEffect, useState } from "react";
import Section from "../components/Section";
import { useApi } from "../lib/api";

type Pump = { id: number; name: string; location_id?: number|null; require_pin?: boolean };

export default function Pumps() {
  const { getJSON, postJSON, patchJSON, del } = useApi();
  const [items, setItems] = useState<Pump[]>([]);
  const [name, setName] = useState("");
  const [location_id, setLocationId] = useState<number | "">("");
  const [pin_code, setPin] = useState("0000");
  const [require_pin, setRequirePin] = useState(true);

  async function load() {
    const rows = await getJSON("/dirac/admin/pumps");
    setItems(rows);
  }
  useEffect(()=>{ load(); }, []);

  async function create() {
    await postJSON("/dirac/admin/pumps", { name, location_id: location_id===""?null:Number(location_id), pin_code, require_pin });
    setName(""); setLocationId(""); setPin("0000"); setRequirePin(true);
    await load();
  }
  async function update(p: Pump) {
    const newName = prompt("Nuevo nombre", p.name); if (!newName) return;
    await patchJSON(`/dirac/admin/pumps/${p.id}`, { name: newName });
    await load();
  }
  async function remove(id: number) {
    if (!confirm("¿Eliminar bomba?")) return;
    await del(`/dirac/admin/pumps/${id}`);
    await load();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Bombas</h1>

      <Section title="Crear bomba" right={null}>
        <div className="flex items-end gap-2 flex-wrap">
          <div><div className="text-xs text-slate-500">Nombre</div><input className="border rounded px-2 py-1" value={name} onChange={e=>setName(e.target.value)} /></div>
          <div><div className="text-xs text-slate-500">Location ID</div><input className="border rounded px-2 py-1" value={location_id} onChange={e=>setLocationId(e.target.value as any)} /></div>
          <div><div className="text-xs text-slate-500">PIN</div><input className="border rounded px-2 py-1" value={pin_code} onChange={e=>setPin(e.target.value)} maxLength={4} /></div>
          <div className="flex items-center gap-1">
            <input id="reqpin" type="checkbox" checked={require_pin} onChange={e=>setRequirePin(e.target.checked)} />
            <label htmlFor="reqpin" className="text-xs text-slate-500">require_pin</label>
          </div>
          <button onClick={create} className="px-3 py-1.5 rounded bg-blue-600 text-white">Crear</button>
        </div>
      </Section>

      <Section title="Listado" right={null}>
        <table className="min-w-full text-sm">
          <thead><tr className="text-left"><th className="px-2 py-1">ID</th><th className="px-2 py-1">Nombre</th><th className="px-2 py-1">Location</th><th className="px-2 py-1">Acciones</th></tr></thead>
          <tbody>
            {items.map(p => (
              <tr key={p.id} className="border-t">
                <td className="px-2 py-1">{p.id}</td>
                <td className="px-2 py-1">{p.name}</td>
                <td className="px-2 py-1">{p.location_id ?? "—"}</td>
                <td className="px-2 py-1 space-x-2">
                  <button onClick={()=>update(p)} className="text-blue-600 underline">Editar</button>
                  <button onClick={()=>remove(p.id)} className="text-red-600 underline">Borrar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
