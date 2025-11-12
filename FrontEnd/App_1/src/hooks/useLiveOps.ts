// src/hooks/useLiveOps.ts
//
// Hook LIVE de Operación: devuelve series sincronizadas para
//  - Bombas: cantidad de bombas ON (perfil continuo, carry-forward en backend)
//  - Tanques: nivel promedio del scope (LOCF opcional)
// Soporta ventanas largas (periodHours) y bucket (1min/5min/15min/1h/1d).
//
// Parámetros clave:
//  - locationId | companyId | pumpIds | tankIds | connectedOnly
//  - periodHours (por defecto 24h) y bucket (auto: 1min si <=48h, si no 1h)
//  - pumpAggMode (avg|max), pumpRoundCounts (redondeo en bucket)
//  - tankAgg (avg|last) y tankCarry (LOCF por minuto)

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchPumpsLive,
  fetchTanksLive,
  type PumpsLiveResp,
  type TanksLiveResp,
  type PumpsLiveArgs,
  type TanksLiveArgs,
} from "@/api/graphs";

// ===== Tipos de salida para los charts =====
export type TankTs = { timestamps?: number[]; level_percent?: Array<number | null> };
export type PumpTs = { timestamps?: number[]; is_on?: Array<number | null> };

type Args = {
  locationId?: number | "all";
  companyId?: number;
  pumpIds?: number[];
  tankIds?: number[];
  periodHours?: number;                             // default 24
  bucket?: "1min" | "5min" | "15min" | "1h" | "1d"; // default: auto (ver abajo)
  pumpAggMode?: "avg" | "max";                      // agregación por bucket de bombas
  pumpRoundCounts?: boolean;                        // redondear promedios de conteo
  tankAgg?: "avg" | "last";                         // agregación dentro del minuto en tanques
  tankCarry?: boolean;                              // LOCF por minuto en tanques
  connectedOnly?: boolean;                          // default true (ambos)
  pollMs?: number;                                  // default 15000
};

type LiveOps = {
  tankTs: TankTs | null;
  pumpTs: PumpTs | null;
  pumpsTotal?: number;
  pumpsConnected?: number;
  tanksTotal?: number;
  tanksConnected?: number;
  window?: { start: number; end: number }; // epoch ms (alineado a minuto)
};

// ===== utilitarios de tiempo =====
function floorToMinute(ms: number) {
  const d = new Date(ms);
  d.setSeconds(0, 0);
  return d.getTime();
}

export function useLiveOps({
  locationId,
  companyId,
  pumpIds,
  tankIds,
  periodHours = 24,
  bucket,
  pumpAggMode = "avg",
  pumpRoundCounts = false,
  tankAgg = "avg",
  tankCarry = true,
  connectedOnly = true,
  pollMs = 15_000,
}: Args = {}): LiveOps {
  const [p, setP] = useState<PumpsLiveResp | null>(null);
  const [t, setT] = useState<TanksLiveResp | null>(null);
  const [win, setWin] = useState<{ start: number; end: number }>();

  // Elegimos bucket por defecto según ventana (auto):
  // - <= 48h  -> 1min
  // -  > 48h  -> 1h
  const effBucket: NonNullable<Args["bucket"]> = bucket ?? (periodHours > 48 ? "1h" : "1min");

  // Abort simple entre renders/polls
  const seqRef = useRef(0);

  useEffect(() => {
    let alive = true;
    const seq = ++seqRef.current;

    const load = async () => {
      try {
        const end = floorToMinute(Date.now());
        const start = end - periodHours * 3600_000;
        setWin({ start, end });

        const common = {
          from: new Date(start).toISOString(),
          to: new Date(end).toISOString(),
          company_id: companyId,
        };

        const locId = typeof locationId === "number" ? locationId : undefined;

        // Bombas: el backend no admite 1d; si piden 1d, usamos 1h para histórica
        const pumpsArgs: PumpsLiveArgs = {
          ...common,
          locationId: locId,
          pumpIds,
          bucket: effBucket === "1d" ? "1h" : effBucket,
          aggMode: pumpAggMode,
          roundCounts: pumpRoundCounts,
          connectedOnly,
        };

        const tanksArgs: TanksLiveArgs = {
          ...common,
          locationId: locId,
          tankIds,
          agg: tankAgg,
          carry: tankCarry,
          bucket: effBucket,
          connectedOnly,
        };

        const [pRes, tRes] = await Promise.all([fetchPumpsLive(pumpsArgs), fetchTanksLive(tanksArgs)]);
        if (!alive || seq !== seqRef.current) return;

        setP(pRes);
        setT(tRes);
      } catch (err) {
        console.error("[useLiveOps] fetch error:", err);
      }
    };

    load();
    const h = window.setInterval(load, pollMs);
    return () => {
      alive = false;
      window.clearInterval(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // deps de scope
    locationId === "all" ? "__all__" : locationId,
    companyId,
    Array.isArray(pumpIds) ? pumpIds.join(",") : "",
    Array.isArray(tankIds) ? tankIds.join(",") : "",
    // deps de ventana/precisión
    periodHours,
    effBucket,
    pumpAggMode,
    pumpRoundCounts,
    tankAgg,
    tankCarry,
    connectedOnly,
    pollMs,
  ]);

  // Adaptadores a la forma que consumen los charts
  const pumpTs = useMemo<PumpTs | null>(() => {
    if (!p) return null;
    return { timestamps: p.timestamps, is_on: p.is_on };
  }, [p]);

  const tankTs = useMemo<TankTs | null>(() => {
    if (!t) return null;
    return { timestamps: t.timestamps, level_percent: t.level_percent };
  }, [t]);

  return {
    tankTs,
    pumpTs,
    pumpsTotal: p?.pumps_total,
    pumpsConnected: p?.pumps_connected,
    tanksTotal: t?.tanks_total,
    tanksConnected: t?.tanks_connected,
    window: win,
  };
}
