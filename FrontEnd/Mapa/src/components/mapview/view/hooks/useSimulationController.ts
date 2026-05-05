// src/components/mapview/view/hooks/useSimulationController.ts

import React from "react";
import type { SimRunResponse } from "../../PipesLayer";
import type { SimMode } from "../../mapTypes";
import { runSim } from "../../../../features/mapa/services/simApi";

export default function useSimulationController() {
  const [simMode, setSimMode] = React.useState<SimMode>("topografico");
  const [sim, setSim] = React.useState<SimRunResponse | null>(null);
  const [simBusy, setSimBusy] = React.useState(false);
  const [simErr, setSimErr] = React.useState<string | null>(null);

  async function runSimulation(modeToRun: SimMode = simMode) {
    setSimBusy(true);
    setSimErr(null);

    try {
      const r = await runSim({
        default_diam_mm: 75,
        r_scale: 1,
        head_drop_scale: modeToRun === "topografico" ? 0 : 0.0000001,
        ignore_unconnected: true,
        closed_valve_blocks_node: true,
        closed_valve_blocks_pipe: true,
        min_pressure_m: 0,
      } as any);

      setSim(r as any);
    } catch (e: any) {
      setSimErr(e?.message ?? "No se pudo simular");
    } finally {
      setSimBusy(false);
    }
  }

  function toggleSimMode() {
    const next: SimMode = simMode === "topografico" ? "hidraulico_suave" : "topografico";
    setSimMode(next);

    if (sim) {
      runSimulation(next);
    }
  }

  return {
    simMode,
    sim,
    setSim,
    simBusy,
    simErr,
    runSimulation,
    toggleSimMode,
  };
}
