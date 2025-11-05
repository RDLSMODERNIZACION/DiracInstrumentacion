import React, { useEffect, useState } from "react";
import Section from "../components/Section";
import { useApi } from "../lib/api";
import LocationPicker from "../components/LocationPicker";

type Tank = { id: number; name: string; location_id?: number|null };
type LocValue =
  | { mode: "existing"; company_id: number; location_id: number }
  | { mode: "new"; company_id: number; location_name: string };

export default function Tanks() {
  const { getJSON, postJSON, patchJSON, del } = useApi();
  const [items, setItems] = useState<Tank[]>([]);
  const [name, setName] = useState("");
  const [loc, setLoc] = useState<LocValue | undefined>(undefined);

  async function load() {
    const rows = await getJSON("/dirac/admin/tanks");
    setItems(rows);
  }
  useEffect(()=>{ load(); }, []);

  async function create() {
    if (!loc) return alert("Seleccioná ubicación");
    const payload: any = { name };
    if (loc.mode === "existing") payload.location_id = loc.location_id;
    else { payload.company_id = loc.company_id; payload.location_name = loc.location_name; }
    await postJSON("/dirac/admin/tanks", payload);
    setName(""); setLoc(undefined); await load();
  }

  async function update(t: Tank) {
    const newName = prompt("Nuevo nombre", t.name); if (!newName) return;
    await patchJSON(`/dirac/admin/tanks/${t.id}`, { name: newName }); await load();
  }

  async function remove(id: number) {
    if (!confirm("¿Eliminar tanque?")) return;
    await del(`/dirac/admin/tanks/${id}`); await load();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Tanques</h1>

      <Section title="Crear tanque" right={null}>
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div><div className="text-xs text-slate-500">Nombre</div>
              <input className="border rounded px-2 py-1" value={name} onChange={e=>setName(e.target.value)} /></div>
          </div>

          <LocationPicker value={loc} onChange={setLoc} />

          <div><button onClick={create} className="px-3 py-1.5 rounded bg-blue-600 text-white">Crear</button></div>
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
