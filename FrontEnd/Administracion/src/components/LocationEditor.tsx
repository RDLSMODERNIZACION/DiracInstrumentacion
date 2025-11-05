import React, { useEffect, useMemo, useState } from "react";
import { useApi } from "../lib/api";
import Section from "./Section";

type LocationRow = { id: number; name: string; company_id: number; address?: string|null; lat?: number|null; lon?: number|null };

export default function LocationEditor({
  location,
  onSaved,
  onClose,
}: {
  location: LocationRow;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { getJSON } = useApi();
  const { patchJSON, del } = useApi();

  const [name, setName] = useState(location.name);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // stats
  const [counts, setCounts] = useState<{tanks:number;pumps:number;valves:number}>({tanks:0,pumps:0,valves:0});
  const total = useMemo(()=> (counts.tanks||0)+(counts.pumps||0)+(counts.valves||0), [counts]);

  // mover a:
  const [allInCompany, setAllInCompany] = useState<Array<{id:number; name:string}>>([]);
  const [moveTo, setMoveTo] = useState<number | "">("");

  async function load() {
    setLoading(true); setErr(null);
    try {
      const st = await getJSON(`/dirac/admin/locations/${location.id}/stats`);
      setCounts(st.counts || {tanks:0,pumps:0,valves:0});
      const ls = await getJSON(`/dirac/admin/locations?company_id=${location.company_id}`);
      setAllInCompany(ls.filter((l:any)=>l.id !== location.id));
      if (!ls.find((x:any)=>x.id===moveTo)) setMoveTo("");
    } catch (e:any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(()=>{ load(); }, [location.id]);

  async function save() {
    setErr(null);
    try {
      // PATCH con query params (como definimos en backend)
      const qs = new URLSearchParams();
      if (name.trim() && name.trim() !== location.name) qs.set("name", name.trim());
      const res = await fetch(`/dirac/admin/locations/${location.id}?${qs.toString()}`, { method:"PATCH", headers: { "Accept":"application/json" }});
      if (!res.ok) throw new Error(`PATCH -> ${res.status}`);
      await res.json().catch(()=>{});
      onSaved();
    } catch (e:any) {
      setErr(e?.message || String(e));
    }
  }

  async function removeDirect() {
    setErr(null);
    try {
      if (total>0) { setErr("No podés eliminar directo: hay activos asignados."); return; }
      await del(`/dirac/admin/locations/${location.id}`);
      onSaved();
    } catch (e:any) {
      setErr(e?.message || String(e));
    }
  }

  async function moveAndRemove() {
    if (!moveTo || typeof moveTo !== "number") return;
    setErr(null);
    try {
      const url = `/dirac/admin/locations/${location.id}?move_to=${moveTo}`;
      const res = await fetch(url, { method:"DELETE", headers: { "Accept":"application/json" }});
      if (!res.ok) {
        const txt = await res.text().catch(()=> "");
        throw new Error(`DELETE -> ${res.status} ${txt}`);
      }
      await res.json().catch(()=>{});
      onSaved();
    } catch (e:any) {
      setErr(e?.message || String(e));
    }
  }

  return (
    <div className="space-y-6">
      <Section title={`Localización #${location.id}`} right={null}>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-slate-500">Nombre</div>
            <input className="border rounded px-3 py-2 w-full"
              value={name} onChange={(e)=>setName(e.target.value)} />
          </div>

          {err && <div className="text-sm text-red-600">{err}</div>}

          <div className="flex justify-end">
            <button onClick={save} className="px-3 py-1.5 rounded bg-blue-600 text-white">Guardar</button>
          </div>
        </div>
      </Section>

      <Section title="Activos asignados" right={null}>
        {loading ? <div className="text-sm text-slate-500">Cargando…</div> : (
          <div className="text-sm">
            <div>Tanques: <b>{counts.tanks}</b></div>
            <div>Bombas: <b>{counts.pumps}</b></div>
            <div>Válvulas: <b>{counts.valves}</b></div>
            <div>Total: <b>{total}</b></div>
          </div>
        )}
      </Section>

      <Section title="Eliminar localización" right={null}>
        <div className="space-y-3 text-sm">
          <div className="text-slate-600">
            {total === 0
              ? "No hay activos, podés eliminar directamente."
              : "Hay activos en esta localización. Debés moverlos a otra antes de eliminar."}
          </div>

        {total === 0 ? (
          <button onClick={removeDirect} className="px-3 py-1.5 rounded bg-red-600 text-white">
            Eliminar
          </button>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <div>
                <div className="text-xs text-slate-500">Mover a</div>
                <select className="border rounded px-2 py-1"
                  value={moveTo}
                  onChange={(e)=>setMoveTo(e.target.value===""?"":Number(e.target.value))}
                >
                  <option value="">(elegir ubicación destino)</option>
                  {allInCompany.map(l => <option key={l.id} value={l.id}>{l.name} #{l.id}</option>)}
                </select>
              </div>
              <button
                onClick={moveAndRemove}
                disabled={!moveTo}
                className="px-3 py-1.5 rounded bg-red-600 text-white disabled:opacity-50"
              >
                Mover activos y eliminar
              </button>
            </div>
          </>
        )}
        </div>
      </Section>

      <div className="flex justify-end">
        <button onClick={onClose} className="px-3 py-1.5 rounded bg-slate-200">Cerrar</button>
      </div>
    </div>
  );
}
