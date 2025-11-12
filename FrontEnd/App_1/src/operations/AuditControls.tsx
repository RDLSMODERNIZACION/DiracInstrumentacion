import React, { useEffect, useState } from "react";
import { getJSON } from "@/lib/http";

type Named = { id: number; name: string };

export default function AuditControls({
  auditEnabled,
  setAuditEnabled,
  auditLoc,
  setAuditLoc,
  auditPumpOptions,
  auditTankOptions,
  selectedAuditPumpIds,
  setSelectedAuditPumpIds,
  selectedAuditTankIds,
  setSelectedAuditTankIds,
}: {
  auditEnabled: boolean;
  setAuditEnabled: (v: boolean) => void;
  auditLoc: number | "";
  setAuditLoc: (v: number | "") => void;
  auditPumpOptions: Named[];
  auditTankOptions: Named[];
  selectedAuditPumpIds: number[] | "all";
  setSelectedAuditPumpIds: (v: number[] | "all") => void;
  selectedAuditTankIds: number[] | "all";
  setSelectedAuditTankIds: (v: number[] | "all") => void;
}) {
  const [locations, setLocations] = useState<Named[]>([]);
  const [loadingLocs, setLoadingLocs] = useState(false);

  useEffect(() => {
    if (!auditEnabled) {
      setLocations([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        setLoadingLocs(true);
        const rows = await getJSON<Named[]>("/dirac/admin/locations");
        if (!alive) return;
        setLocations(rows || []);
      } catch (e) {
        console.error("[audit] locations error", e);
        setLocations([]);
      } finally {
        setLoadingLocs(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [auditEnabled]);

  function onMultiSelectChange(
    e: React.ChangeEvent<HTMLSelectElement>,
    setter: (v: number[] | "all") => void
  ) {
    const opts = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
    setter(opts.length ? opts : []);
  }

  return (
    <div className="rounded-xl border p-3 space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={auditEnabled}
          onChange={(e) => setAuditEnabled(e.target.checked)}
        />
        <span>Auditar (comparar con otra ubicación)</span>
      </label>

      {auditEnabled && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-xs mb-1">Ubicación (auditoría)</div>
            <select
              className="w-full border rounded-md p-2 text-sm"
              value={auditLoc === "" ? "" : String(auditLoc)}
              onChange={(e) => setAuditLoc(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={loadingLocs}
            >
              <option value="">{loadingLocs ? "Cargando..." : "Elegí una ubicación"}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span>Tanques (auditoría)</span>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => setSelectedAuditTankIds("all")}
              >
                Todos
              </button>
            </div>
            <select
              multiple
              size={Math.min(6, Math.max(3, auditTankOptions.length))}
              className="w-full border rounded-md p-2 text-sm"
              value={
                selectedAuditTankIds === "all"
                  ? auditTankOptions.map((t) => String(t.id))
                  : (selectedAuditTankIds as number[]).map(String)
              }
              onChange={(e) => onMultiSelectChange(e, setSelectedAuditTankIds)}
              disabled={!auditLoc}
            >
              {auditTankOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span>Bombas (auditoría)</span>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => setSelectedAuditPumpIds("all")}
              >
                Todas
              </button>
            </div>
            <select
              multiple
              size={Math.min(6, Math.max(3, auditPumpOptions.length))}
              className="w-full border rounded-md p-2 text-sm"
              value={
                selectedAuditPumpIds === "all"
                  ? auditPumpOptions.map((p) => String(p.id))
                  : (selectedAuditPumpIds as number[]).map(String)
              }
              onChange={(e) => onMultiSelectChange(e, setSelectedAuditPumpIds)}
              disabled={!auditLoc}
            >
              {auditPumpOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
