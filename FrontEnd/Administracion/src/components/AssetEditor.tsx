import React, { useEffect, useMemo, useState } from "react";
import { useApi } from "../lib/api";
import LocationPicker from "./LocationPicker";

type Kind = "tank" | "pump" | "valve";

type LocValue =
  | { mode: "existing"; company_id: number; location_id: number }
  | { mode: "new"; company_id: number; location_name: string };

type BaseItem = { id: number; name: string; location_id?: number | null };
type PumpItem = BaseItem & { require_pin?: boolean | null; pin_code?: string | null };
type ValveItem = BaseItem & { kind?: string | null };

function plural(k: Kind) {
  return k === "tank" ? "tanks" : k === "pump" ? "pumps" : "valves";
}

export default function AssetEditor({
  kind,
  item,
  onSaved,
  onCancel,
}: {
  kind: Kind;
  item: BaseItem | PumpItem | ValveItem;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { patchJSON } = useApi();
  const [name, setName] = useState(item.name || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Ubicación: mantener o cambiar
  const [locMode, setLocMode] = useState<"keep" | "change">("keep");
  const [loc, setLoc] = useState<LocValue | undefined>(undefined);

  // Campos extra por tipo
  const [pin, setPin] = useState<string>((item as PumpItem).pin_code ?? "");
  const [reqPin, setReqPin] = useState<boolean>((item as PumpItem).require_pin ?? true);

  const [valveKind, setValveKind] = useState<string>((item as ValveItem).kind ?? "branch");

  const showPin = kind === "pump";
  const showValveKind = kind === "valve";

  const canSave = useMemo(() => {
    if (!name.trim()) return false;
    if (locMode === "change" && !loc) return false;
    if (showPin && pin && !/^\d{4}$/.test(pin)) return false;
    if (showValveKind && !["branch","outlet","isolation","high","gravity"].includes(valveKind)) return false;
    return true;
  }, [name, locMode, loc, pin, showPin, showValveKind, valveKind]);

  async function save() {
    if (!canSave) return;
    setSaving(true); setErr(null);
    try {
      const payload: any = { name: name.trim() };

      if (locMode === "change" && loc) {
        if (loc.mode === "existing") {
          payload.location_id = loc.location_id;
        } else {
          payload.company_id = loc.company_id;
          payload.location_name = loc.location_name;
        }
      }
      if (kind === "pump") {
        if (pin) payload.pin_code = pin;
        payload.require_pin = reqPin;
      }
      if (kind === "valve") {
        payload.kind = valveKind;
      }

      await patchJSON(`/dirac/admin/${plural(kind)}/${item.id}`, payload);
      onSaved();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-slate-500">Nombre</div>
        <input
          className="border rounded px-3 py-2 w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del activo"
        />
      </div>

      {showValveKind && (
        <div>
          <div className="text-xs text-slate-500">Tipo</div>
          <select className="border rounded px-3 py-2"
            value={valveKind}
            onChange={(e) => setValveKind(e.target.value)}
          >
            <option value="branch">branch</option>
            <option value="outlet">outlet</option>
            <option value="isolation">isolation</option>
            <option value="high">high</option>
            <option value="gravity">gravity</option>
          </select>
        </div>
      )}

      {showPin && (
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <div className="text-xs text-slate-500">PIN (4 dígitos)</div>
            <input
              className="border rounded px-3 py-2"
              value={pin}
              onChange={(e)=>setPin(e.target.value.replace(/\D+/g,"").slice(0,4))}
              placeholder="0000"
              maxLength={4}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reqPin} onChange={(e)=>setReqPin(e.target.checked)} />
            <span>require_pin</span>
          </label>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs text-slate-500">Ubicación</div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1 text-sm">
            <input type="radio" checked={locMode==="keep"} onChange={()=>setLocMode("keep")} />
            <span>Mantener ubicación actual (#{item.location_id ?? "—"})</span>
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="radio" checked={locMode==="change"} onChange={()=>setLocMode("change")} />
            <span>Cambiar ubicación</span>
          </label>
        </div>
        {locMode==="change" && <LocationPicker value={loc} onChange={setLoc} />}
      </div>

      {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}

      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 rounded bg-slate-200">Cancelar</button>
        <button onClick={save} disabled={!canSave || saving} className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-60">
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
