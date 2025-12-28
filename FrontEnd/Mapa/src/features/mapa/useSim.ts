// src/features/mapa/useSim.ts
import React from "react";
import { runSim, type SimRunResponse, type SimOptions } from "./services/simApi";

export function useSim() {
  const [sim, setSim] = React.useState<SimRunResponse | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function run(options: SimOptions = {}) {
    setBusy(true);
    setErr(null);
    try {
      const r = await runSim(options);
      setSim(r);
      return r;
    } catch (e: any) {
      setErr(e?.message || "Error simulando");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  return { sim, busy, err, run, clear: () => setSim(null) };
}
