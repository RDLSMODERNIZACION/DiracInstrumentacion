import { useEffect, useMemo, useRef, useState } from "react";
import { listPumps, listTanks, fetchPumpsLive, fetchTanksLive } from "@/api/graphs";
import { floorToMinuteISO, startOfMin } from "../helpers/time";
import type { PumpInfo, TankInfo } from "../types";

type TsTank = { timestamps: number[]; level_percent: (number | null)[] } | null;
type TsPump = { timestamps: number[]; is_on: (number | null)[] } | null;

function stableCsv(nums: number[]) {
  const copy = [...nums].filter(Number.isFinite).sort((a, b) => a - b);
  return copy.join(",");
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

  // Abort controllers (options + series)
  const optAbortRef = useRef<AbortController | null>(null);
  const seriesAbortRef = useRef<AbortController | null>(null);

  // Reset
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

  // locId estable
  const locId = useMemo(() => {
    const id = auditLoc === "" ? undefined : Number(auditLoc);
    return id && Number.isFinite(id) ? id : undefined;
  }, [auditLoc]);

  // Cargar assets (options)
  useEffect(() => {
    if (!enabled) return;

    if (!locId) {
      setPumpOptions([]);
      setTankOptions([]);
      return;
    }

    optAbortRef.current?.abort();
    const ac = new AbortController();
    optAbortRef.current = ac;

    let mounted = true;
    (async () => {
      try {
        const [p, t] = await Promise.all([
          // @ts-ignore (si luego querés pasar signal en graphs.ts, ya queda listo)
          listPumps({ locationId: locId, signal: ac.signal } as any),
          // @ts-ignore
          listTanks({ locationId: locId, signal: ac.signal } as any),
        ]);

        if (!mounted) return;
        setPumpOptions(p || []);
        setTankOptions(t || []);
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

  // IDs efectivos (para series) + keys estables para deps
  const effectivePumpIds = useMemo(() => {
    if (!locId) return [];
    if (selectedPumpIds !== "all") return selectedPumpIds;
    return pumpOptions.map((p) => p.pump_id);
  }, [locId, selectedPumpIds, pumpOptions]);

  const effectiveTankIds = useMemo(() => {
    if (!locId) return [];
    if (selectedTankIds !== "all") return selectedTankIds;
    return tankOptions.map((t) => t.tank_id);
  }, [locId, selectedTankIds, tankOptions]);

  const pumpIdsKey = useMemo(() => stableCsv(effectivePumpIds), [effectivePumpIds]);
  const tankIdsKey = useMemo(() => stableCsv(effectiveTankIds), [effectiveTankIds]);

  // Series con la MISMA ventana
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

    // cancelamos request anterior
    seriesAbortRef.current?.abort();
    const ac = new AbortController();
    seriesAbortRef.current = ac;

    setLoading(true);

    (async () => {
      try {
        const [pumps, tanks] = await Promise.all([
          fetchPumpsLive({
            from: floorToMinuteISO(new Date(fromMs)),
            to: floorToMinuteISO(new Date(toMs)),
            locationId: locId,
            pumpIds: effectivePumpIds.length ? effectivePumpIds : undefined,
            // ✅ KPI fijo a 5min
            bucket: "5min",
            aggMode: "avg",
            connectedOnly: true,
            // @ts-ignore: si luego soportás signal, queda listo
            signal: ac.signal,
          } as any),
          fetchTanksLive({
            from: floorToMinuteISO(new Date(fromMs)),
            to: floorToMinuteISO(new Date(toMs)),
            locationId: locId,
            tankIds: effectiveTankIds.length ? effectiveTankIds : undefined,
            agg: "avg",
            carry: true,
            // ✅ KPI fijo a 5min
            bucket: "5min",
            connectedOnly: true,
            // @ts-ignore
            signal: ac.signal,
          } as any),
        ]);

        if (ac.signal.aborted) return;
        setPumpTs({ timestamps: pumps.timestamps, is_on: pumps.is_on });
        setTankTs({ timestamps: tanks.timestamps, level_percent: tanks.level_percent });
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
    // options
    pumpOptions,
    tankOptions,
    // selections
    selectedPumpIds,
    setSelectedPumpIds,
    selectedTankIds,
    setSelectedTankIds,
    // series
    pumpTs,
    tankTs,
    loading,
  };
}
