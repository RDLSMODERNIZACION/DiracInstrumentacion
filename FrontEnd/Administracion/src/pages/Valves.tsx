import React, { useEffect, useState } from "react";
import Section from "../components/Section";
import { useApi } from "../lib/api";
import LocationPicker from "../components/LocationPicker";
import SlideOver from "../components/SlideOver";
import AssetEditor from "../components/AssetEditor";

type Valve = { id: number; name: string; location_id?: number|null; kind?: string|null };
type LocValue =
  | { mode: "existing"; company_id: number; location_id: number }
  | { mode: "new"; company_id: number; location_name: string };

export default function Valves() {
  const { getJSON, postJSON, del } = useApi();
  const [items, setItems] = useState<Valve[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("branch");
  const [loc, setLoc] = useState<LocValue | undefined>(undefined);

  const [editing, setEditing] = useState<Valve | null>(null);

  async function load() {
    const rows = await getJSON("/dirac/admin/valves");
    setItems(rows);
  }
  useEffect(()=>{ load(); }, []);

  async function create() {
    if (!loc) return alert("Seleccioná ubicación");
    const payload: any = { name, kind };
    if (loc.mode === "existing") payload.location_id = loc.location_id;
    else { payload.company_id = loc.company_id; payload.location_name = loc.location_name; }
    await postJSON("/dirac/admin/valves", payload);
    setName(""); setKind("branch"); setLoc(undefined);
    await load();
  }

  async function remove(id: number) {
    if (!confirm("¿Eliminar válvula?")) return;
    await del(`/dirac/admin/valves/${id}`); await load();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Válvulas</h1>

      <Section title="Crear válvula" right={null}>
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <div className="text-xs text-slate-500">Nombre</div>
              <input className="border rounded px-2 py-1" value={name} onChange={e=>setName(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-slate-500">Tipo</div>
              <select className="border rounded px-2 py-1" value={kind} onChange={e=>setKind(e.target.value)}>
                <option value="branch">branch</option>
                <option value="outlet">outlet</option>
                <option value="isolation">isolation</option>
                <option value="high">high</option>
                <option value="gravity">gravity</option>
              </select>
            </div>
          </div>

          <LocationPicker value={loc} onChange={setLoc} />

          <div>
            <button onClick={create} className="px-3 py-1.5 rounded bg-blue-600 text-white">Crear</button>
          </div>
        </div>
      </Section>

      <Section title="Listado (click en la fila para editar)" right={null}>
        <table className="min-w-full text-sm">
          <thead><tr className="text-left"><th className="px-2 py-1">ID</th><th className="px-2 py-1">Nombre</th><th className="px-2 py-1">Location</th><th className="px-2 py-1">Acciones</th></tr></thead>
          <tbody>
            {items.map(v => (
              <tr key={v.id} className="border-t hover:bg-slate-50 cursor-pointer" onClick={()=>setEditing(v)}>
                <td className="px-2 py-1">{v.id}</td>
                <td className="px-2 py-1">{v.name}</td>
                <td className="px-2 py-1">{v.location_id ?? "—"}</td>
                <td className="px-2 py-1 space-x-2" onClick={(e)=>e.stopPropagation()}>
                  <button onClick={()=>remove(v.id)} className="text-red-600 underline">Borrar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <SlideOver open={!!editing} title={editing ? `Editar válvula #${editing.id}` : ""} onClose={()=>setEditing(null)}>
        {editing && (
          <AssetEditor
            kind="valve"
            item={editing}
            onSaved={async ()=>{ setEditing(null); await load(); }}
            onCancel={()=>setEditing(null)}
          />
        )}
      </SlideOver>
    </div>
  );
}
