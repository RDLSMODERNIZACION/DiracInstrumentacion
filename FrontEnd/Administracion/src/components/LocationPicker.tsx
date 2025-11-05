import React, { useEffect, useState } from "react";
import { useApi } from "../lib/api";

type Company = { id: number; name: string };
type Location = { id: number; name: string; company_id?: number|null };

type Value =
  | { mode: "existing"; company_id: number; location_id: number }
  | { mode: "new"; company_id: number; location_name: string };

export default function LocationPicker({
  value, onChange
}: {
  value?: Value;
  onChange: (v: Value) => void;
}) {
  const { getJSON } = useApi();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [mode, setMode] = useState<Value["mode"]>(value?.mode || "existing");
  const [companyId, setCompanyId] = useState<number>(() => {
    if (value?.company_id) return value.company_id;
    return 1; // default visible
  });
  const [locationId, setLocationId] = useState<number>( (value as any)?.location_id ?? 0 );
  const [locationName, setLocationName] = useState<string>( (value as any)?.location_name ?? "" );

  useEffect(() => {
    (async () => {
      const cs = await getJSON("/dirac/admin/companies");
      setCompanies(cs);
    })();
  }, []);

  useEffect(() => {
    if (mode === "existing" && companyId) {
      (async () => {
        const ls = await getJSON(`/dirac/admin/locations?company_id=${companyId}`);
        setLocations(ls);
        if (ls.length && !ls.find(l => l.id === locationId)) {
          setLocationId(ls[0].id);
        }
      })();
    }
  }, [mode, companyId]);

  useEffect(() => {
    if (mode === "existing" && companyId && locationId) {
      onChange({ mode, company_id: companyId, location_id: locationId });
    } else if (mode === "new" && companyId && locationName.trim()) {
      onChange({ mode, company_id: companyId, location_name: locationName.trim() });
    }
  }, [mode, companyId, locationId, locationName]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1 text-sm">
          <input type="radio" checked={mode==="existing"} onChange={()=>setMode("existing")} />
          <span>Ubicación existente</span>
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input type="radio" checked={mode==="new"} onChange={()=>setMode("new")} />
          <span>Crear nueva</span>
        </label>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <div className="text-xs text-slate-500">Empresa</div>
          <select className="border rounded px-2 py-1"
            value={companyId}
            onChange={(e)=>setCompanyId(Number(e.target.value))}
          >
            {companies.map(c => <option key={c.id} value={c.id}>{c.name} (#{c.id})</option>)}
          </select>
        </div>

        {mode === "existing" ? (
          <div>
            <div className="text-xs text-slate-500">Ubicación</div>
            <select className="border rounded px-2 py-1"
              value={locationId}
              onChange={(e)=>setLocationId(Number(e.target.value))}
            >
              {locations.map(l => <option key={l.id} value={l.id}>{l.name} (#{l.id})</option>)}
            </select>
          </div>
        ) : (
          <div>
            <div className="text-xs text-slate-500">Nombre nueva ubicación</div>
            <input className="border rounded px-2 py-1"
              value={locationName}
              onChange={(e)=>setLocationName(e.target.value)}
              placeholder="Ej: Palacio Municipal"
            />
          </div>
        )}
      </div>
    </div>
  );
}
