// src/hooks/useLiveOps.ts
//
// Hook LIVE de Operación: devuelve series sincronizadas para
//  - Bombas: cantidad de bombas ON (perfil continuo, carry-forward en backend)
//  - Tanques: nivel promedio del scope (LOCF opcional)
// Soporta períodos largos con bucket y polling.
//
// ✅ Update (24h fijo):
// - Bucket por defecto = 5min (y backend bombas fuerza 5min).
// - Polling adaptativo: si la pestaña está oculta, baja frecuencia.
// - Abort real por request (evita solaparse y acumular latencia).
// - Dedupe ya lo hace graphs.ts, pero acá además evitamos overlap de cargas.
// - Sanitiza arrays para deps estables.
//

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
  pumpAggMode?: "avg" | "max";                      // default "avg"
  pumpRoundCounts?: boolean;                        // default false
  tankAgg?: "avg" | "last";                         // default "avg"
  tankCarry?: boolean;                              // default true
  connectedOnly?: boolean;                          // default true
  pollMs?: number;                                  // default 15000
  pollMsHidden?: number;                            // default 60000 (cuando la pestaña está oculta)
};

type LiveOps = {
  tankTs: TankTs | null;
  pumpTs: PumpTs | null;
  pumpsTotal?: number;
  pumpsConnected?: number;
  tanksTotal?: number;
  tanksConnected?: number;
  window?: { start: number; end: number }; // epoch ms (alineado a minuto)
  meta?: {
    bucket: NonNullable<Args["bucket"]>;
    lastOkAt?: number;
    lastErr?: string;
    isLoading: boolean;
  };
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
  if (LIVEOPS_DEBUG) console.debug("[useLiveOps]", ...args);
}

// ===== utilitarios de tiempo =====
function floorToMinute(ms: number) {
  const d = new Date(ms);
  d.setSeconds(0, 0);
  return d.getTime();
}

function stableCsv(nums?: number[]) {
  if (!nums || !nums.length) return "";
  const copy = [...nums].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  return copy.join(",");
}

/** ✅ 24h -> 5min por defecto (mejor performance + UX) */
function pickAutoBucket(hours: number): NonNullable<Args["bucket"]> {
  if (hours >= 24 * 30) return "1d";
  if (hours > 48) return "1h";
  if (hours > 24) return "15min";
  return "5min";
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
  pollMsHidden = 60_000,
}: Args = {}): LiveOps {
  const [p, setP] = useState<PumpsLiveResp | null>(null);
  const [t, setT] = useState<TanksLiveResp | null>(null);
  const [win, setWin] = useState<{ start: number; end: number }>();
  const [lastOkAt, setLastOkAt] = useState<number>();
  const [lastErr, setLastErr] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);

  const effBucket: NonNullable<Args["bucket"]> = bucket ?? pickAutoBucket(periodHours);
  const locId = typeof locationId === "number" ? locationId : undefined;

  const pumpIdsKey = useMemo(() => stableCsv(pumpIds), [pumpIds]);
  const tankIdsKey = useMemo(() => stableCsv(tankIds), [tankIds]);

  // control de concurrencia
  const seqRef = useRef(0);
  const inFlightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!hasWindow()) {
      dlog("no window detected (SSR/test), skipping live polling");
      return;
    }

    let alive = true;
    const seq = ++seqRef.current;

    const runLoad = async () => {
      // Evitar overlap: cancelamos request anterior si todavía está en vuelo
      if (inFlightRef.current) {
        inFlightRef.current.abort();
      }
      const ac = new AbortController();
      inFlightRef.current = ac;

      setIsLoading(true);

      try {
        const end = floorToMinute(Date.now());
        const start = end - periodHours * 3600_000;
        setWin({ start, end });

        const common = {
          from: new Date(start).toISOString(),
          to: new Date(end).toISOString(),
          companyId, // camelCase -> graphs.ts lo mapea a company_id
        };

        const pumpsArgs: PumpsLiveArgs = {
          ...common,
          locationId: locId,
          pumpIds: pumpIds && pumpIds.length ? pumpIds : undefined,
          bucket: effBucket, // ✅ 24h -> 5min
          aggMode: pumpAggMode,
          roundCounts: pumpRoundCounts,
          connectedOnly,
        };

        const tanksArgs: TanksLiveArgs = {
          ...common,
          locationId: locId,
          tankIds: tankIds && tankIds.length ? tankIds : undefined,
          agg: tankAgg,
          carry: tankCarry,
          bucket: effBucket,
          connectedOnly,
        };

        dlog("poll start", { seq, window: { start, end }, bucket: effBucket, pumpsArgs, tanksArgs });

        // Importante: graphs.ts dedupea, pero igual pasamos signal para cancelar en cambios rápidos
        const [pRes, tRes] = await Promise.all([
          // @ts-ignore: si fetchPumpsLive soporta signal en tu impl futura, ya queda listo
          fetchPumpsLive({ ...pumpsArgs, signal: ac.signal } as any),
          // @ts-ignore
          fetchTanksLive({ ...tanksArgs, signal: ac.signal } as any),
        ]);

        if (!alive || seq !== seqRef.current) {
          dlog("discarding response (stale seq)", { seq, currentSeq: seqRef.current });
          return;
        }

        setP(pRes);
        setT(tRes);
        setLastOkAt(Date.now());
        setLastErr(undefined);

        dlog("poll success", {
          seq,
          pumpsPoints: pRes?.timestamps?.length ?? 0,
          tanksPoints: tRes?.timestamps?.length ?? 0,
          pumpsTotal: pRes?.pumps_total,
          tanksTotal: tRes?.tanks_total,
          bucketEffective: pRes?.bucket ?? effBucket,
        });
      } catch (err: any) {
        // si fue abort, no lo tratamos como error
        if (err?.name === "AbortError") {
          dlog("poll aborted", { seq });
          return;
        }
        console.error("[useLiveOps] fetch error:", err);
        setLastErr(String(err?.message ?? err));
        dlog("poll error", { error: String(err) });
      } finally {
        if (inFlightRef.current === ac) inFlightRef.current = null;
        if (alive) setIsLoading(false);
      }
    };

    // polling adaptativo: si está hidden, reducimos frecuencia
    const tick = () => {
      runLoad();
      const ms = document.hidden ? pollMsHidden : pollMs;
      return window.setTimeout(tick, ms);
    };

    // primer load inmediato
    runLoad();
    const h = window.setTimeout(tick, document.hidden ? pollMsHidden : pollMs);

    const onVis = () => {
      // al volver a visible, refrescamos rápido
      if (!document.hidden) {
        dlog("visibility -> visible, refreshing");
        runLoad();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
      window.clearTimeout(h);
      inFlightRef.current?.abort();
      inFlightRef.current = null;
      dlog("cleanup", { seq });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // scope
    locId,
    companyId,
    pumpIdsKey,
    tankIdsKey,
    // ventana/precisión
    periodHours,
    effBucket,
    pumpAggMode,
    pumpRoundCounts,
    tankAgg,
    tankCarry,
    connectedOnly,
    pollMs,
    pollMsHidden,
  ]);

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
    meta: {
      bucket: effBucket,
      lastOkAt,
      lastErr,
      isLoading,
    },
  };
}
