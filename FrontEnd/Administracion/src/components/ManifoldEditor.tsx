// src/components/ManifoldEditor.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useApi } from "../lib/api";
import Section from "./Section";

type Row = { id: number; name: string; location_id?: number | null };
type Location = { id: number; name: string; company_id?: number | null };

export default function ManifoldEditor({
  row,
  onSaved,
  onClose,
}: {
  row: Row;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { getJSON, patchJSON } = useApi();

  const [name, setName] = useState(row.name || "");
  const [locMode, setLocMode] = useState<"keep" | "change">("keep");
  const [locationId, setLocationId] = useState<number | "">(row.location_id ?? "");
  const [locations, setLocations] = useState<Location[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingLocs, setLoadingLocs] = useState(false);

  // Cargar ubicaciones existentes (abierto)
  useEffect(() => {
    (async () => {
      setLoadingLocs(true);
      try {
        const ls: Location[] = await getJSON("/dirac/admin/locations");
        setLocations(ls);
      } catch (e: any) {
        setErr(e?.message || String(e));
      } finally {
        setLoadingLocs(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locationsById = useMemo(() => {
    const m = new Map<number, Location>();
    locations.forEach((l) => m.set(Number(l.id), l));
    return m;
  }, [locations]);

  const currentLoc = row.location_id ? locationsById.get(Number(row.location_id)) : undefined;

  const canSave = useMemo(() => name.trim().length > 0, [name]);

  async function save() {
    setErr(null);
    setSaving(true);
    try {
      const payload: any = { name: name.trim() };
      if (locMode === "change") {
        if (locationId === "") {
          setErr("Elegí una ubicación para cambiar.");
          setSaving(false);
          return;
        }
        payload.location_id = Number(locationId);
      }
      await patchJSON(`/dirac/admin/manifolds/${row.id}`, payload);
      onSaved();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Section title="Datos" right={null}>
        <div className="flex flex-col gap-4">
          {/* Nombre */}
          <label className="text-sm">
            <div className="text-xs text-slate-500">Nombre</div>
            <input
              className="border rounded px-3 py-2 w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Colector principal"
            />
          </label>

          {/* Ubicación (mantener / cambiar) */}
          <div className="text-sm">
            <div className="text-xs text-slate-500 mb-1">Ubicación</div>

            <label className="flex items-center gap-2 mb-2">
              <input
                type="radio"
                name="locmode"
                value="keep"
                checked={locMode === "keep"}
                onChange={() => setLocMode("keep")}
              />
              <span>
                Mantener ubicación actual (
                {row.location_id
                  ? currentLoc
                    ? `${currentLoc.name} #${currentLoc.id}`
                    : `#${row.location_id}`
                  : "—"}
                )
              </span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="locmode"
                value="change"
                checked={locMode === "change"}
                onChange={() => setLocMode("change")}
              />
              <span>Cambiar ubicación</span>
            </label>

            {locMode === "change" && (
              <div className="mt-3">
                <select
                  className="border rounded px-2 py-1 min-w-[16rem]"
                  value={locationId}
                  onChange={(e) =>
                    setLocationId(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  disabled={loadingLocs || locations.length === 0}
                  title={
                    locations.length === 0
                      ? "No hay ubicaciones disponibles"
                      : undefined
                  }
                >
                  <option value="">(elegí una ubicación)</option>
                  {locations
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} #{l.id}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          {err && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {err}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded bg-slate-200">
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={!canSave || saving}
              className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </Section>
    </div>
  );
}
