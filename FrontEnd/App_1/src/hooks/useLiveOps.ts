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
// ✅ Debug mejorado:
// - Logs de parámetros efectivos (scope, filtros, bucket, agg).
// - Logs de conteos: max/avg/unique de is_on.
// - Detecta valores imposibles (ej. > cap).
// - Clamp opcional (siempre activo) para asegurar conteo consistente.
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
  periodHours?: number; // default 24
  bucket?: "1min" | "5min" | "15min" | "1h" | "1d"; // si no viene: auto (ver abajo)
  pumpAggMode?: "avg" | "max"; // default "max" (conteo ON por bucket)
  pumpRoundCounts?: boolean; // default true
  tankAgg?: "avg" | "last"; // default "avg"
  tankCarry?: boolean; // default true
  connectedOnly?: boolean; // default true
  pollMs?: number; // default 15000
  pollMsHidden?: number; // default 60000 (cuando la pestaña está oculta)

  /** ✅ safety: limita is_on al máximo posible (selección o total) */
  clampCounts?: boolean; // default true
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

function dwarn(...args: any[]) {
  if (LIVEOPS_DEBUG) console.warn("[useLiveOps]", ...args);
}

function perfNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
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

function toNumOrNull(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? Number(n) : null;
}

function clamp01ToCap(v: number | null, cap?: number) {
  if (v == null) return null;
  if (cap == null) return Math.max(0, v);
  return Math.max(0, Math.min(v, cap));
}

function stats(values: Array<number | null>) {
  const xs = values.map((v) => (v == null ? NaN : Number(v))).filter((n) => Number.isFinite(n)) as number[];
  const max = xs.length ? Math.max(...xs) : 0;
  const min = xs.length ? Math.min(...xs) : 0;
  const avg = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const uniq = Array.from(new Set(xs)).slice(0, 20);
  return { count: xs.length, min, max, avg, uniq };
}

export function useLiveOps({
  locationId,
  companyId,
  pumpIds,
  tankIds,
  periodHours = 24,
  bucket,
  pumpAggMode = "max", // ✅ mejor default para “conteo ON”
  pumpRoundCounts = true, // ✅ mejor default para conteos
  tankAgg = "avg",
  tankCarry = true,
  connectedOnly = true,
  pollMs = 15_000,
  pollMsHidden = 60_000,
  clampCounts = true,
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
      if (inFlightRef.current) inFlightRef.current.abort();

      const ac = new AbortController();
      inFlightRef.current = ac;

      setIsLoading(true);

      const t0 = perfNow();
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
          bucket: effBucket,
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

        dlog("poll start", {
          seq,
          scope: { locId, companyId },
          filters: { pumpIds: pumpIds?.length ? pumpIds : "all", tankIds: tankIds?.length ? tankIds : "all" },
          window: { start, end },
          effBucket,
          pumpAggMode,
          pumpRoundCounts,
          tankAgg,
          tankCarry,
          connectedOnly,
        });

        const [pRes, tRes] = await Promise.all([
          // @ts-ignore
          fetchPumpsLive({ ...pumpsArgs, signal: ac.signal } as any),
          // @ts-ignore
          fetchTanksLive({ ...tanksArgs, signal: ac.signal } as any),
        ]);

        if (!alive || seq !== seqRef.current) {
          dlog("discarding response (stale seq)", { seq, currentSeq: seqRef.current });
          return;
        }

        // ===== LOGS IMPORTANTES (bombas) =====
        const rawIsOn = Array.isArray((pRes as any)?.is_on) ? ((pRes as any).is_on as any[]) : [];
        const rawNums = rawIsOn.map(toNumOrNull);

        const cap =
          (pumpIds && pumpIds.length ? pumpIds.length : undefined) ??
          (typeof (pRes as any)?.pumps_total === "number" ? (pRes as any).pumps_total : undefined);

        const rawStats = stats(rawNums);

        dlog("pumps raw", {
          seq,
          pumps_total: (pRes as any)?.pumps_total,
          pumps_connected: (pRes as any)?.pumps_connected,
          cap,
          points: (pRes as any)?.timestamps?.length ?? rawNums.length,
          rawStats,
          sampleLast12: rawNums.slice(-12),
        });

        if (cap != null && rawStats.max > cap) {
          dwarn("pumps raw EXCEDE cap (posible bug de backend/filtros)", {
            seq,
            cap,
            maxRaw: rawStats.max,
            uniq: rawStats.uniq,
            pumpIds: pumpIds?.length ? pumpIds : "all",
            locId,
          });
        }

        // set states
        setP(pRes);
        setT(tRes);
        setLastOkAt(Date.now());
        setLastErr(undefined);

        const dt = perfNow() - t0;
        dlog("poll success", {
          seq,
          ms: Math.round(dt),
          pumpsPoints: (pRes as any)?.timestamps?.length ?? 0,
          tanksPoints: (tRes as any)?.timestamps?.length ?? 0,
          pumpsTotal: (pRes as any)?.pumps_total,
          tanksTotal: (tRes as any)?.tanks_total,
          bucketEffective: (pRes as any)?.bucket ?? effBucket,
        });
      } catch (err: any) {
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

    runLoad();
    const h = window.setTimeout(tick, document.hidden ? pollMsHidden : pollMs);

    const onVis = () => {
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

    const raw = Array.isArray(p.is_on) ? p.is_on : [];
    const rawNums = raw.map(toNumOrNull);

    const cap =
      (pumpIds && pumpIds.length ? pumpIds.length : undefined) ??
      (typeof p.pumps_total === "number" ? p.pumps_total : undefined);

    const outNums =
      clampCounts && cap != null
        ? rawNums.map((v) => clamp01ToCap(v, cap))
        : rawNums.map((v) => (v == null ? null : Math.max(0, v)));

    if (LIVEOPS_DEBUG) {
      const st = stats(outNums);
      console.debug("[useLiveOps] pumpTs out", {
        cap,
        points: outNums.length,
        st,
        sampleLast12: outNums.slice(-12),
      });
    }

    // ⚠️ mantenemos timestamps tal cual para no desalinear charts
    return { timestamps: p.timestamps, is_on: outNums };
  }, [p, pumpIdsKey, clampCounts]);

  const tankTs = useMemo<TankTs | null>(() => {
    if (!t) return null;

    // (logs opcionales tanques)
    if (LIVEOPS_DEBUG) {
      const raw = Array.isArray(t.level_percent) ? t.level_percent : [];
      const nums = raw.map(toNumOrNull);
      const st = stats(nums);
      console.debug("[useLiveOps] tankTs", {
        points: nums.length,
        tanks_total: t.tanks_total,
        tanks_connected: t.tanks_connected,
        st,
        sampleLast12: nums.slice(-12),
      });
    }

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
