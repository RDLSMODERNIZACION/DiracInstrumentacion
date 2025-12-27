import { useEffect, useMemo, useState } from "react";
import { clamp, round, seededNoise } from "../lib/sim";
import { assets as baseAssets, type Asset } from "../data/demo/index";

export function useSimulatedAssets(valveEnabled: Record<string, boolean>) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setTick((v) => v + 1), 1200);
    return () => window.clearInterval(t);
  }, []);

  const assets = useMemo(() => {
    const rand = seededNoise(1337 + tick);
    const enabledCount = Object.values(valveEnabled).filter(Boolean).length;
    const totalValves = Object.keys(valveEnabled).length || 1;
    const valveFactor = enabledCount / totalValves;

    return baseAssets.map((a) => {
      const meta = { ...a.meta };

      if (a.type === "MANIFOLD") {
        const psi = clamp(38 + 10 * valveFactor + (rand() - 0.5) * 2.0, 20, 55);
        const q = clamp(160 + 120 * valveFactor + (rand() - 0.5) * 20, 0, 320);
        meta.presion_psi = round(psi, 1);
        meta.caudal_m3h = round(q, 0);
      }

      if (a.type === "TANK") {
        const baseNivel = Number(a.meta.nivel_pct ?? 60);
        const delta = (0.55 - valveFactor) * 1.8 + (rand() - 0.5) * 0.8;
        meta.nivel_pct = round(clamp(baseNivel + delta, 10, 98), 0);
        meta.autonomia_h = round(clamp(Number(meta.nivel_pct) / 10 + 1.5, 1, 12), 1);
      }

      if (a.type === "VALVE") {
        const on = valveEnabled[a.id] !== false;
        meta.activa = on;
        meta.posicion_pct = on
          ? round(clamp(Number(a.meta.posicion_pct ?? 50) + (rand() - 0.5) * 6, 5, 100), 0)
          : 0;

        const s: Asset["status"] =
          !on
            ? "OFF"
            : a.status === "WARN"
            ? rand() > 0.65
              ? "OK"
              : "WARN"
            : a.status === "OK"
            ? rand() > 0.9
              ? "WARN"
              : "OK"
            : a.status;

        return { ...a, status: s, meta };
      }

      return { ...a, meta };
    });
  }, [tick, valveEnabled]);

  const assetsById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  return { assets, assetsById };
}
