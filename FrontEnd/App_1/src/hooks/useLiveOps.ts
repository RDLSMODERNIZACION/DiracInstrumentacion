// src/hooks/useLiveOps.ts
//
// Hook LIVE de Operación: devuelve series sincronizadas para
//  - Bombas: cantidad de bombas ON (perfil continuo, carry-forward en backend)
//  - Tanques: nivel promedio del scope (LOCF opcional)
// Soporta períodos largos con bucket (1min/5min/15min/1h/1d) y polling adaptativo.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchPumpsLive,
  fetchTanksLive,
  type PumpsLiveResp,
  type TanksLiveResp,
  type PumpsLiveArgs,
  type TanksLiveArgs,
} from "@/api/graphs";

export type TankTs = { timestamps?: number[]; level_percent?: Array<number | null> };
export type PumpTs = { timestamps?: number[]; is_on?: Array<number | null> };

type Args = {
  locationId?: number | "all";
  companyId?: number;
  pumpIds?: number[];
  tankIds?: number[];
  periodHours?: number;                             // default 24
  bucket?: "1min" | "5min" | "15min" | "1h" | "1d"; // si no viene: auto (ver abajo)
  pumpAggMode?: "avg" | "max";                      // agregación por bucket de bombas (default "avg")
  pumpRoundCounts?: boolean;                        // redondear promedios de conteo
  tankAgg?: "avg" | "last";                         // agregación dentro del minuto en tanques (default "avg")
  tankCarry?: boolean;                              // LOCF (default true)
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

// =======================
// Debug helpers
// =======================

function hasWindow() {
  return typeof window !== "undefined";
}

const LIVEOPS_DEBUG =
  String(import.meta.env?.VITE_DEBUG_LIVEOPS ?? "").trim() === "1" ||
  (hasWindow() && window.localStorage?.getItem("DEBUG_LIVEOPS") === "1");

function dlog(...args: any[]) {
  if (LIVEOPS_DEBUG) {
    // eslint-disable-next-line no-console
    console.debug("[useLiveOps]", ...args);
  }
}

// ===== utilitarios de tiempo =====
function floorToMinute(ms: number) {
  const d = new Date(ms);
  d.setSeconds(0, 0);
  return d.getTime();
}

/** Elige bucket por defecto según la ventana */
function pickAutoBucket(hours: number): NonNullable<Args["bucket"]> {
  if (hours >= 24 * 30) return "1d";   // 30 días
  if (hours > 48)        return "1h";  // 7 días típico
  return "1min";                        // 24 h o menos
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

  // bucket efectivo: si no lo pasaron, lo decidimos acá
  const effBucket: NonNullable<Args["bucket"]> = bucket ?? pickAutoBucket(periodHours);
  const locId = typeof locationId === "number" ? locationId : undefined;

  // Abort simple entre renders/polls
  const seqRef = useRef(0);

  useEffect(() => {
    if (!hasWindow()) {
      dlog("no window detected (SSR/test), skipping live polling");
      return;
    }

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
          companyId, // 👈 IMPORTANTE: camelCase para que graphs.ts lo mapee a ?company_id=
        };

        const pumpsArgs: PumpsLiveArgs = {
          ...common,
          locationId: locId,
          pumpIds,
          bucket: effBucket,           // ✅ sin fallback: bombas soporta 1d
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
          bucket: effBucket,           // ✅ mismo bucket que bombas
          connectedOnly,
        };

        dlog("poll start", {
          seq,
          window: { start, end },
          bucket: effBucket,
          pumpsArgs,
          tanksArgs,
        });

        const [pRes, tRes] = await Promise.all([
          fetchPumpsLive(pumpsArgs),
          fetchTanksLive(tanksArgs),
        ]);

        if (!alive || seq !== seqRef.current) {
          dlog("discarding response (stale seq)", { seq, currentSeq: seqRef.current });
          return;
        }

        dlog("poll success", {
          seq,
          pumpsPoints: pRes?.timestamps?.length ?? 0,
          tanksPoints: tRes?.timestamps?.length ?? 0,
          pumpsTotal: pRes?.pumps_total,
          tanksTotal: tRes?.tanks_total,
        });

        setP(pRes);
        setT(tRes);
      } catch (err) {
        console.error("[useLiveOps] fetch error:", err);
        dlog("poll error", { error: String(err) });
      }
    };

    load();
    const h = window.setInterval(load, pollMs);

    return () => {
      alive = false;
      window.clearInterval(h);
      dlog("cleanup interval", { seq });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // scope
    locId,
    companyId,
    Array.isArray(pumpIds) ? pumpIds.join(",") : "",
    Array.isArray(tankIds) ? tankIds.join(",") : "",
    // ventana/precisión
    periodHours,
    effBucket,          // <— si cambia, recargamos
    pumpAggMode,
    pumpRoundCounts,
    tankAgg,
    tankCarry,
    connectedOnly,
    pollMs,
  ]);

  // Adaptadores a la forma que consumen los charts (ya vienen bucketizadas)
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
