import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { LocOpt, PumpInfo, TankInfo } from "../types";

export default function AuditPanel({
  auditEnabled,
  setAuditEnabled,
  locOptions,
  auditLoc,
  setAuditLoc,
  pumpOptions,
  tankOptions,
  selectedPumpIds,
  setSelectedPumpIds,
  selectedTankIds,
  setSelectedTankIds,
  playbackControls,
}: {
  auditEnabled: boolean;
  setAuditEnabled: (v: boolean) => void;
  locOptions: LocOpt[];
  auditLoc: number | "";
  setAuditLoc: (v: number | "") => void;
  pumpOptions: PumpInfo[];
  tankOptions: TankInfo[];
  selectedPumpIds: number[] | "all";
  setSelectedPumpIds: (v: number[] | "all") => void;
  selectedTankIds: number[] | "all";
  setSelectedTankIds: (v: number[] | "all") => void;
  playbackControls: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border p-3 space-y-3">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={auditEnabled} onChange={(e) => setAuditEnabled(e.target.checked)} />
        <span className="text-sm">Auditar (comparar con otra ubicación)</span>
      </label>

      {auditEnabled && (
        <>
          {/* Playback dentro del panel */}
          {playbackControls}

          {/* Ubicación y selectores de Auditoría */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Localidad + Tanques */}
            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-500">Auditoría – Localidad y Tanques</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <div className="text-xs mb-1">Ubicación (auditoría)</div>
                  <select
                    className="w-full border rounded-md p-2 text-sm"
                    value={auditLoc === "" ? "" : String(auditLoc)}
                    onChange={(e) => setAuditLoc(e.target.value === "" ? "" : Number(e.target.value))}
                  >
                    <option value="">Elegí</option>
                    {locOptions.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedTankIds === "all"}
                      onChange={(e) => setSelectedTankIds(e.target.checked ? "all" : [])}
                      disabled={!auditLoc}
                    />
                    <span className="text-sm">Todos (promedio)</span>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2 max-h-40 overflow-auto">
                  {tankOptions.map((t) => {
                    const checked =
                      selectedTankIds === "all" ? false : (selectedTankIds as number[]).includes(t.tank_id);
                    return (
                      <label
                        key={t.tank_id}
                        className={`px-2 py-1 border rounded-lg text-sm cursor-pointer ${
                          checked ? "bg-black text-white" : "bg-white hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mr-2"
                          checked={checked}
                          disabled={selectedTankIds === "all"}
                          onChange={(e) => {
                            if (selectedTankIds === "all") return;
                            const arr = new Set(selectedTankIds as number[]);
                            if (e.target.checked) arr.add(t.tank_id);
                            else arr.delete(t.tank_id);
                            setSelectedTankIds(Array.from(arr));
                          }}
                        />
                        {t.name}
                      </label>
                    );
                  })}
                </div>

                <p className="text-xs text-gray-500">
                  * “Todos” muestra el <b>promedio</b> de niveles.
                </p>
              </CardContent>
            </Card>

            {/* Bombas */}
            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-500">Auditoría – Bombas (selección)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedPumpIds === "all"}
                      onChange={(e) => setSelectedPumpIds(e.target.checked ? "all" : [])}
                      disabled={!auditLoc}
                    />
                    <span className="text-sm">Todas</span>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-auto">
                  {pumpOptions.map((p) => {
                    const checked =
                      selectedPumpIds === "all" ? false : (selectedPumpIds as number[]).includes(p.pump_id);
                    return (
                      <label
                        key={p.pump_id}
                        className={`px-2 py-1 border rounded-lg text-sm cursor-pointer ${
                          checked ? "bg-black text-white" : "bg-white hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mr-2"
                          checked={checked}
                          disabled={selectedPumpIds === "all"}
                          onChange={(e) => {
                            if (selectedPumpIds === "all") return;
                            const arr = new Set(selectedPumpIds as number[]);
                            if (e.target.checked) arr.add(p.pump_id);
                            else arr.delete(p.pump_id);
                            setSelectedPumpIds(Array.from(arr));
                          }}
                        />
                        {p.name}
                      </label>
                    );
                  })}
                </div>

                <p className="text-xs text-gray-500">
                  * “Todas” muestra la cantidad ON de todas las bombas de la localidad.
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
