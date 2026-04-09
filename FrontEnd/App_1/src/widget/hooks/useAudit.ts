import { useEffect, useMemo, useRef, useState } from "react";
import { listPumps, listTanks, fetchPumpsLive, fetchTanksLive } from "@/api/graphs";
import { floorToMinuteISO, startOfMin } from "../helpers/time";
import type { PumpInfo, TankInfo } from "../types";

type TsTank = { timestamps: number[]; level_percent: (number | null)[] } | null;
type TsPump = { timestamps: number[]; is_on: (number | null)[] } | null;

function stableKey(ids: number[] | "all") {
  if (ids === "all") return "all";
  const copy = [...ids].filter(Number.isFinite).sort((a, b) => a - b);
  return copy.join(",");
}

function toNumOrNull(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? Number(n) : null;
}

function clampCount(v: number | null, cap?: number) {
  if (v == null) return null;
  if (cap == null) return Math.max(0, v);
  return Math.max(0, Math.min(v, cap));
}

export function useAudit({
  enabled,
  auditLoc,
  domain,
}: {
  enabled: boolean;
  auditLoc: number | "";
  domain: [number, number];
}) {
  const [pumpOptions, setPumpOptions] = useState<PumpInfo[]>([]);
  const [tankOptions, setTankOptions] = useState<TankInfo[]>([]);

  const [selectedPumpIds, setSelectedPumpIds] = useState<number[] | "all">("all");
  const [selectedTankIds, setSelectedTankIds] = useState<number[] | "all">("all");

  const [pumpTs, setPumpTs] = useState<TsPump>(null);
  const [tankTs, setTankTs] = useState<TsTank>(null);
  const [loading, setLoading] = useState(false);

  const optAbortRef = useRef<AbortController | null>(null);
  const seriesAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      optAbortRef.current?.abort();
      seriesAbortRef.current?.abort();
      optAbortRef.current = null;
      seriesAbortRef.current = null;

      setPumpOptions([]);
      setTankOptions([]);
      setSelectedPumpIds("all");
      setSelectedTankIds("all");
      setPumpTs(null);
      setTankTs(null);
      setLoading(false);
    }
  }, [enabled]);

  const locId = useMemo(() => {
    const id = auditLoc === "" ? undefined : Number(auditLoc);
    return id && Number.isFinite(id) ? id : undefined;
  }, [auditLoc]);

  useEffect(() => {
    if (!enabled) return;

    if (!locId) {
      setPumpOptions([]);
      setTankOptions([]);
      setSelectedPumpIds("all");
      setSelectedTankIds("all");
      return;
    }

    optAbortRef.current?.abort();
    const ac = new AbortController();
    optAbortRef.current = ac;

    let mounted = true;
    (async () => {
      try {
        const [p, t] = await Promise.all([
          // @ts-ignore
          listPumps({ locationId: locId, signal: ac.signal } as any),
          // @ts-ignore
          listTanks({ locationId: locId, signal: ac.signal } as any),
        ]);

        if (!mounted) return;
        setPumpOptions(Array.isArray(p) ? p : []);
        setTankOptions(Array.isArray(t) ? t : []);
        setSelectedPumpIds("all");
        setSelectedTankIds("all");
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        if (mounted) {
          setPumpOptions([]);
          setTankOptions([]);
        }
        console.error("[audit] options error:", e);
      }
    })();

    return () => {
      mounted = false;
      ac.abort();
    };
  }, [enabled, locId]);

  const pumpIdsKey = useMemo(() => stableKey(selectedPumpIds), [selectedPumpIds]);
  const tankIdsKey = useMemo(() => stableKey(selectedTankIds), [selectedTankIds]);

  useEffect(() => {
    if (!enabled) return;

    if (!locId) {
      setPumpTs(null);
      setTankTs(null);
      return;
    }

    const fromMs = startOfMin(domain[0]);
    const toMs = startOfMin(domain[1]);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) return;

    const fromISO = floorToMinuteISO(new Date(fromMs));
    const toISO = floorToMinuteISO(new Date(toMs));

    const pumpIdsParam =
      selectedPumpIds === "all" ? undefined : selectedPumpIds;

    const tankIdsParam =
      selectedTankIds === "all" ? undefined : selectedTankIds;

    seriesAbortRef.current?.abort();
    const ac = new AbortController();
    seriesAbortRef.current = ac;

    setLoading(true);

    (async () => {
      try {
        const [pumps, tanks] = await Promise.all([
          fetchPumpsLive({
            from: fromISO,
            to: toISO,
            locationId: locId,
            pumpIds: pumpIdsParam,
            bucket: "5min",
            aggMode: "max",
            roundCounts: true,
            connectedOnly: true,
            // @ts-ignore
            signal: ac.signal,
          } as any),
          fetchTanksLive({
            from: fromISO,
            to: toISO,
            locationId: locId,
            tankIds: tankIdsParam,
            agg: "avg",
            carry: true,
            bucket: "5min",
            connectedOnly: true,
            // @ts-ignore
            signal: ac.signal,
          } as any),
        ]);

        if (ac.signal.aborted) return;

        const rawPumpVals = Array.isArray(pumps?.is_on) ? pumps.is_on : [];
        const pumpCap =
          (Array.isArray(pumpIdsParam) && pumpIdsParam.length
            ? pumpIdsParam.length
            : typeof pumps?.pumps_total === "number"
              ? pumps.pumps_total
              : undefined);

        const normalizedPumpVals = rawPumpVals
          .map(toNumOrNull)
          .map((v) => clampCount(v, pumpCap));

        setPumpTs({
          timestamps: pumps.timestamps,
          is_on: normalizedPumpVals,
        });

        setTankTs({
          timestamps: tanks.timestamps,
          level_percent: tanks.level_percent,
        });
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setPumpTs(null);
        setTankTs(null);
        console.error("[audit] series error:", e);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => {
      ac.abort();
    };
  }, [enabled, locId, domain[0], domain[1], pumpIdsKey, tankIdsKey]);

  return {
    pumpOptions,
    tankOptions,
    selectedPumpIds,
    setSelectedPumpIds,
    selectedTankIds,
    setSelectedTankIds,
    pumpTs,
    tankTs,
    loading,
  };
}