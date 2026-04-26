// src/hooks/useLiveOps.ts
//
// Hook PRO de Operación.
// Consume endpoints nuevos:
// - /kpi/tanques/operation/summary-24h
// - /kpi/tanques/operation/level-1m
// - /kpi/tanques/operation/events
// - /kpi/bombas/operation/summary-24h
// - /kpi/bombas/operation/on-1m
// - /kpi/bombas/operation/timeline-1m
// - /kpi/bombas/operation/events
//
// Mantiene compatibilidad con el front viejo:
// - tankTs.timestamps
// - tankTs.level_percent
// - pumpTs.timestamps
// - pumpTs.is_on

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchOperationPumpSummary24h,
  fetchOperationPumpsOn1m,
  fetchOperationPumpTimeline1m,
  fetchOperationPumpEvents,
  fetchOperationTankSummary24h,
  fetchOperationTankLevel1m,
  fetchOperationTankEvents,

  type PumpOperationSummaryResp,
  type PumpOperationOn1mResp,
  type PumpOperationTimelineResp,
  type PumpOperationEventsResp,

  type TankOperationSummaryResp,
  type TankOperationLevelResp,
  type TankOperationEventsResp,
} from "@/api/graphs";

export type TankTs = {
  timestamps?: number[];
  level_percent?: Array<number | null>;
  level_min?: Array<number | null>;
  level_max?: Array<number | null>;
};

export type PumpTs = {
  timestamps?: number[];
  is_on?: Array<number | null>;
  pumps_off?: Array<number | null>;
  pumps_online?: Array<number | null>;
  pumps_offline?: Array<number | null>;
};

type Args = {
  locationId?: number | "all";
  companyId?: number;

  pumpIds?: number[];
  tankIds?: number[];

  periodHours?: number;
  bucket?: "1min" | "5min" | "15min" | "1h" | "1d";

  pollMs?: number;
  pollMsHidden?: number;

  loadPumpTimeline?: boolean;
  loadPumpEvents?: boolean;
  loadTankEvents?: boolean;

  limitTimeline?: number;
  limitEvents?: number;
};

export type LiveOps = {
  tankTs: TankTs | null;
  pumpTs: PumpTs | null;

  tanksSummary: TankOperationSummaryResp | null;
  pumpsSummary: PumpOperationSummaryResp | null;

  tankLevel: TankOperationLevelResp | null;
  pumpsOn: PumpOperationOn1mResp | null;

  pumpTimeline: PumpOperationTimelineResp | null;
  pumpEvents: PumpOperationEventsResp | null;
  tankEvents: TankOperationEventsResp | null;

  pumpsTotal?: number;
  pumpsConnected?: number;
  tanksTotal?: number;
  tanksConnected?: number;

  window?: {
    start: number;
    end: number;
  };

  meta?: {
    bucket: NonNullable<Args["bucket"]>;
    lastOkAt?: number;
    lastErr?: string;
    isLoading: boolean;
  };
};

function hasWindow() {
  return typeof window !== "undefined";
}

function floorToMinute(ms: number) {
  const d = new Date(ms);
  d.setSeconds(0, 0);
  return d.getTime();
}

function stableCsv(nums?: number[]) {
  if (!nums || !nums.length) return "";

  return [...nums]
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    .join(",");
}

function pickAutoBucket(hours: number): NonNullable<Args["bucket"]> {
  if (hours >= 24 * 30) return "1d";
  if (hours > 48) return "1h";
  if (hours > 24) return "15min";
  return "1min";
}

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;

  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toMs(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;

  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    return v > 2_000_000_000 ? v : v * 1000;
  }

  if (typeof v === "string") {
    const n = Number(v);

    if (Number.isFinite(n)) {
      return n > 2_000_000_000 ? n : n * 1000;
    }

    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }

  return null;
}

const LIVEOPS_DEBUG =
  String(import.meta.env?.VITE_DEBUG_LIVEOPS ?? "").trim() === "1" ||
  (hasWindow() && window.localStorage?.getItem("DEBUG_LIVEOPS") === "1");

function dlog(...args: any[]) {
  if (LIVEOPS_DEBUG) console.debug("[useLiveOps]", ...args);
}

export function useLiveOps({
  locationId,
  companyId,

  pumpIds,
  tankIds,

  periodHours = 24,
  bucket,

  pollMs = 15_000,
  pollMsHidden = 60_000,

  // Para el gráfico de bombas con nombres por minuto.
  loadPumpTimeline = true,

  loadPumpEvents = true,
  loadTankEvents = true,

  limitTimeline = 200000,
  limitEvents = 500,
}: Args = {}): LiveOps {
  const [tankLevel, setTankLevel] =
    useState<TankOperationLevelResp | null>(null);

  const [tanksSummary, setTanksSummary] =
    useState<TankOperationSummaryResp | null>(null);

  const [tankEvents, setTankEvents] =
    useState<TankOperationEventsResp | null>(null);

  const [pumpsOn, setPumpsOn] =
    useState<PumpOperationOn1mResp | null>(null);

  const [pumpsSummary, setPumpsSummary] =
    useState<PumpOperationSummaryResp | null>(null);

  const [pumpTimeline, setPumpTimeline] =
    useState<PumpOperationTimelineResp | null>(null);

  const [pumpEvents, setPumpEvents] =
    useState<PumpOperationEventsResp | null>(null);

  const [win, setWin] = useState<{ start: number; end: number }>();
  const [lastOkAt, setLastOkAt] = useState<number>();
  const [lastErr, setLastErr] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);

  const effBucket: NonNullable<Args["bucket"]> =
    bucket ?? pickAutoBucket(periodHours);

  const locId = typeof locationId === "number" ? locationId : undefined;

  const pumpIdsKey = useMemo(() => stableCsv(pumpIds), [pumpIds]);
  const tankIdsKey = useMemo(() => stableCsv(tankIds), [tankIds]);

  const seqRef = useRef(0);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!hasWindow()) return;

    let alive = true;
    let timer: number | undefined;

    const seq = ++seqRef.current;

    const runLoad = async () => {
      if (loadingRef.current) return;

      loadingRef.current = true;
      setIsLoading(true);

      try {
        const end = floorToMinute(Date.now());
        const start = end - periodHours * 3600_000;

        setWin({ start, end });

        const common = {
          from: new Date(start).toISOString(),
          to: new Date(end).toISOString(),
          companyId,
          locationId: locId,
        };

        const pumpScope = {
          ...common,
          pumpIds: pumpIds && pumpIds.length ? pumpIds : undefined,
        };

        const tankScope = {
          ...common,
          tankIds: tankIds && tankIds.length ? tankIds : undefined,
        };

        dlog("poll start", {
          seq,
          locationId: locId,
          companyId,
          pumpIds,
          tankIds,
          periodHours,
          effBucket,
          loadPumpTimeline,
          loadPumpEvents,
          loadTankEvents,
        });

        const [
          tankSummaryRes,
          tankLevelRes,
          pumpSummaryRes,
          pumpsOnRes,
          tankEventsRes,
          pumpTimelineRes,
          pumpEventsRes,
        ] = await Promise.all([
          fetchOperationTankSummary24h({
            companyId,
            locationId: locId,
            tankIds: tankIds && tankIds.length ? tankIds : undefined,
            limit: 500,
          }),

          fetchOperationTankLevel1m({
            ...tankScope,
            bucket: effBucket,
            aggregate: true,
            limit: 300000,
          }),

          fetchOperationPumpSummary24h({
            companyId,
            locationId: locId,
            pumpIds: pumpIds && pumpIds.length ? pumpIds : undefined,
            limit: 500,
          }),

          fetchOperationPumpsOn1m({
            ...pumpScope,
          }),

          loadTankEvents
            ? fetchOperationTankEvents({
                ...tankScope,
                limit: limitEvents,
              })
            : Promise.resolve(null),

          loadPumpTimeline
            ? fetchOperationPumpTimeline1m({
                ...pumpScope,
                limit: limitTimeline,
              })
            : Promise.resolve(null),

          loadPumpEvents
            ? fetchOperationPumpEvents({
                ...pumpScope,
                limit: limitEvents,
              })
            : Promise.resolve(null),
        ]);

        if (!alive || seq !== seqRef.current) return;

        setTanksSummary(tankSummaryRes);
        setTankLevel(tankLevelRes);

        setPumpsSummary(pumpSummaryRes);
        setPumpsOn(pumpsOnRes);

        setTankEvents(tankEventsRes);
        setPumpTimeline(pumpTimelineRes);
        setPumpEvents(pumpEventsRes);

        setLastOkAt(Date.now());
        setLastErr(undefined);

        dlog("poll success", {
          tankLevelPoints:
            tankLevelRes?.items?.length ??
            tankLevelRes?.timestamps?.length ??
            0,
          pumpOnPoints:
            pumpsOnRes?.items?.length ??
            pumpsOnRes?.timestamps?.length ??
            0,
          pumpTimelineRows: pumpTimelineRes?.items?.length ?? 0,
          pumpEvents: pumpEventsRes?.items?.length ?? 0,
          tankEvents: tankEventsRes?.items?.length ?? 0,
        });
      } catch (err: any) {
        console.error("[useLiveOps] fetch error:", err);

        if (!alive || seq !== seqRef.current) return;

        setLastErr(String(err?.message ?? err));
      } finally {
        loadingRef.current = false;

        if (alive && seq === seqRef.current) {
          setIsLoading(false);
        }
      }
    };

    const schedule = () => {
      const ms = document.hidden ? pollMsHidden : pollMs;

      timer = window.setTimeout(async () => {
        await runLoad();

        if (alive) {
          schedule();
        }
      }, ms);
    };

    runLoad();
    schedule();

    const onVis = () => {
      if (!document.hidden) {
        runLoad();
      }
    };

    document.addEventListener("visibilitychange", onVis);

    return () => {
      alive = false;

      document.removeEventListener("visibilitychange", onVis);

      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [
    locId,
    companyId,
    pumpIdsKey,
    tankIdsKey,
    periodHours,
    effBucket,
    pollMs,
    pollMsHidden,
    loadPumpTimeline,
    loadPumpEvents,
    loadTankEvents,
    limitTimeline,
    limitEvents,
  ]);

  const tankTs = useMemo<TankTs | null>(() => {
    if (!tankLevel) return null;

    if (Array.isArray(tankLevel.timestamps)) {
      return {
        timestamps: tankLevel.timestamps.map(toMs).filter(
          (v): v is number => v !== null
        ),
        level_percent: tankLevel.level_avg ?? [],
        level_min: tankLevel.level_min ?? [],
        level_max: tankLevel.level_max ?? [],
      };
    }

    const items = tankLevel.items ?? [];

    return {
      timestamps: items
        .map((r: any) => toMs(r.ts_ms ?? r.minute_ts ?? r.ts))
        .filter((v): v is number => v !== null),
      level_percent: items.map((r: any) => toNumOrNull(r.level_avg)),
      level_min: items.map((r: any) => toNumOrNull(r.level_min)),
      level_max: items.map((r: any) => toNumOrNull(r.level_max)),
    };
  }, [tankLevel]);

  const pumpTs = useMemo<PumpTs | null>(() => {
    if (!pumpsOn) return null;

    if (Array.isArray(pumpsOn.timestamps)) {
      return {
        timestamps: pumpsOn.timestamps
          .map(toMs)
          .filter((v): v is number => v !== null),
        is_on: pumpsOn.pumps_on ?? [],
        pumps_off: pumpsOn.pumps_off ?? [],
        pumps_online: pumpsOn.pumps_online ?? [],
        pumps_offline: pumpsOn.pumps_offline ?? [],
      };
    }

    const items = pumpsOn.items ?? [];

    return {
      timestamps: items
        .map((r: any) => toMs(r.ts_ms ?? r.minute_ts ?? r.ts))
        .filter((v): v is number => v !== null),
      is_on: items.map((r: any) => toNumOrNull(r.pumps_on)),
      pumps_off: items.map((r: any) => toNumOrNull(r.pumps_off)),
      pumps_online: items.map((r: any) => toNumOrNull(r.pumps_online)),
      pumps_offline: items.map((r: any) => toNumOrNull(r.pumps_offline)),
    };
  }, [pumpsOn]);

  return {
    tankTs,
    pumpTs,

    tanksSummary,
    pumpsSummary,

    tankLevel,
    pumpsOn,

    pumpTimeline,
    pumpEvents,
    tankEvents,

    pumpsTotal: pumpsSummary?.summary?.pumps_total,
    pumpsConnected: pumpsSummary?.summary?.pumps_online,
    tanksTotal: tanksSummary?.summary?.tanks_total,
    tanksConnected: tanksSummary?.summary?.tanks_online,

    window: win,

    meta: {
      bucket: effBucket,
      lastOkAt,
      lastErr,
      isLoading,
    },
  };
}