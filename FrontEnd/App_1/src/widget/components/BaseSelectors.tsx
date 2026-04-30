import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { PumpInfo, TankInfo } from "../types";

export default function BaseSelectors({
  pumpOptions,
  tankOptions,
  selectedPumpIds,
  setSelectedPumpIds,
  selectedTankIds,
  setSelectedTankIds,
}: {
  pumpOptions: PumpInfo[];
  tankOptions: TankInfo[];
  selectedPumpIds: number[] | "all";
  setSelectedPumpIds: (v: number[] | "all") => void;
  selectedTankIds: number[] | "all";
  setSelectedTankIds: (v: number[] | "all") => void;
}) {
  const showTankOptions = selectedTankIds !== "all";
  const showPumpOptions = selectedPumpIds !== "all";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-500">
            Tanques
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedTankIds === "all"}
              onChange={(e) => setSelectedTankIds(e.target.checked ? "all" : [])}
            />
            <span className="text-sm font-medium">Todos los tanques</span>
            <span className="text-xs text-gray-500">(promedio)</span>
          </label>

          {showTankOptions && (
            <>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-auto">
                {tankOptions.map((t) => {
                  const checked = (selectedTankIds as number[]).includes(t.tank_id);

                  return (
                    <label
                      key={t.tank_id}
                      className={`cursor-pointer rounded-lg border px-2 py-1 text-sm ${
                        checked ? "bg-black text-white" : "bg-white hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={checked}
                        onChange={(e) => {
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
                Seleccioná uno o más tanques para verlos filtrados.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-500">
            Bombas
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedPumpIds === "all"}
              onChange={(e) => setSelectedPumpIds(e.target.checked ? "all" : [])}
            />
            <span className="text-sm font-medium">Todas las bombas</span>
          </label>

          {showPumpOptions && (
            <>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-auto">
                {pumpOptions.map((p) => {
                  const checked = (selectedPumpIds as number[]).includes(p.pump_id);

                  return (
                    <label
                      key={p.pump_id}
                      className={`cursor-pointer rounded-lg border px-2 py-1 text-sm ${
                        checked ? "bg-black text-white" : "bg-white hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={checked}
                        onChange={(e) => {
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
                Seleccioná una o más bombas para verlas filtradas.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}