import React, { useEffect, useState } from "react";
import Section from "../components/Section";
import { useApi } from "../lib/api";
import LocationPicker from "../components/LocationPicker";

type Pump = { id: number; name: string; location_id?: number|null; require_pin?: boolean };
type LocValue =
  | { mode: "existing"; company_id: number; location_id: number }
  | { mode: "new"; company_id: number; location_name: string };

export default function Pumps() {
  const { getJSON, postJSON, patchJSON, del } = useApi();
  const [items, setItems] = useState<Pump[]>([]);
  const [name, setName] = useState("");
  const [pin_code, setPin] = useState("0000");
  const [require_pin, setRequirePin] = useState(true);
  const [loc, setLoc] = useState<LocValue | undefined>(undefined);

  async function load() {
    const rows = await getJSON("/dirac/admin/pumps");
    setItems(rows);
  }
  useEffect(()=>{ load(); }, []);

  async function create() {
    if (!loc) return alert("Seleccioná ubicación");
    const payload: any = { name, pin_code, require_pin };
    if (loc.mode === "existing") payload.location_id = loc.location_id;
    else { payload.company_id = loc.company_id; payload.location_name = loc.location_name; }
    await postJSON("/dirac/admin/pumps", payload);
    setName(""); setPin("0000"); setRequirePin(true); setLoc(undefined);
    await load();
  }

  async function update(p: Pump) {
    const newName = prompt("Nuevo nombre", p.name); if (!newName) return;
    await patchJSON(`/dirac/admin/pumps/${p.id}`, { name: newName });
    await load();
  }

  async function remove(id: number) {
    if (!confirm("¿Eliminar bomba?")) return;
    await del(`/dirac/admin/pumps/${id}`); await load();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Bombas</h1>

      <Section title="Crear bomba" right={null}>
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div><div className="text-xs text-slate-500">Nombre</div>
              <input className="border rounded px-2 py-1" value={name} onChange={e=>setName(e.target.value)} /></div>
            <div><div className="text-xs text-slate-500">PIN</div>
              <input className="border rounded px-2 py-1" value={pin_code} onChange={e=>setPin(e.target.value)} maxLength={4} /></div>
            <div className="flex items-center gap-1">
              <input id="reqpin" type="checkbox" checked={require_pin} onChange={e=>setRequirePin(e.target.checked)} />
              <label htmlFor="reqpin" className="text-xs text-slate-500">require_pin</label>
            </div>
          </div>

          <LocationPicker value={loc} onChange={setLoc} />

          <div><button onClick={create} className="px-3 py-1.5 rounded bg-blue-600 text-white">Crear</button></div>
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
