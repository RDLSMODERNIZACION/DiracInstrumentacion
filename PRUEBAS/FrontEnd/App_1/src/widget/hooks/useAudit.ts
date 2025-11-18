import { useEffect, useMemo, useState } from "react";
import { listPumps, listTanks, fetchPumpsLive, fetchTanksLive } from "@/api/graphs";
import { floorToMinuteISO, startOfMin } from "../helpers/time";
import type { PumpInfo, TankInfo } from "../types";

type TsTank = { timestamps: number[]; level_percent: (number | null)[] } | null;
type TsPump = { timestamps: number[]; is_on: (number | null)[] } | null;

export function useAudit({
  enabled,
  auditLoc,
  domain,
}: {
  enabled: boolean;
  auditLoc: number | "" ;
  domain: [number, number];
}) {
  const [pumpOptions, setPumpOptions] = useState<PumpInfo[]>([]);
  const [tankOptions, setTankOptions] = useState<TankInfo[]>([]);

  const [selectedPumpIds, setSelectedPumpIds] = useState<number[] | "all">("all");
  const [selectedTankIds, setSelectedTankIds] = useState<number[] | "all">("all");

  const [pumpTs, setPumpTs] = useState<TsPump>(null);
  const [tankTs, setTankTs] = useState<TsTank>(null);
  const [loading, setLoading] = useState(false);

  // Reset
  useEffect(() => {
    if (!enabled) {
      setPumpOptions([]);
      setTankOptions([]);
      setSelectedPumpIds("all");
      setSelectedTankIds("all");
      setPumpTs(null);
      setTankTs(null);
    }
  }, [enabled]);

  // Cargar assets
  useEffect(() => {
    if (!enabled) return;
    const locId = auditLoc === "" ? undefined : Number(auditLoc);
    if (!locId) {
      setPumpOptions([]);
      setTankOptions([]);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const [p, t] = await Promise.all([listPumps({ locationId: locId }), listTanks({ locationId: locId })]);
        if (!mounted) return;
        setPumpOptions(p || []);
        setTankOptions(t || []);
        setSelectedPumpIds("all");
        setSelectedTankIds("all");
      } catch (e) {
        if (mounted) {
          setPumpOptions([]);
          setTankOptions([]);
        }
        console.error("[audit] options error:", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [enabled, auditLoc]);

  // Series con la MISMA ventana
  useEffect(() => {
    if (!enabled) return;
    const locId = auditLoc === "" ? undefined : Number(auditLoc);
    if (!locId) {
      setPumpTs(null);
      setTankTs(null);
      return;
    }

    const fromMs = startOfMin(domain[0]);
    const toMs = startOfMin(domain[1]);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) return;

    const pumpIds =
      selectedPumpIds === "all" ? pumpOptions.map((p) => p.pump_id) : (selectedPumpIds as number[]);
    const tankIds =
      selectedTankIds === "all" ? tankOptions.map((t) => t.tank_id) : (selectedTankIds as number[]);

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [pumps, tanks] = await Promise.all([
          fetchPumpsLive({
            from: floorToMinuteISO(new Date(fromMs)),
            to: floorToMinuteISO(new Date(toMs)),
            locationId: locId,
            pumpIds: pumpIds.length ? pumpIds : undefined,
            bucket: "1min",
            aggMode: "avg",
            connectedOnly: true,
          }),
          fetchTanksLive({
            from: floorToMinuteISO(new Date(fromMs)),
            to: floorToMinuteISO(new Date(toMs)),
            locationId: locId,
            tankIds: tankIds.length ? tankIds : undefined,
            agg: "avg",
            carry: true,
            bucket: "1min",
            connectedOnly: true,
          }),
        ]);
        if (cancelled) return;
        setPumpTs({ timestamps: pumps.timestamps, is_on: pumps.is_on });
        setTankTs({ timestamps: tanks.timestamps, level_percent: tanks.level_percent });
      } catch (e) {
        if (!cancelled) {
          setPumpTs(null);
          setTankTs(null);
        }
        console.error("[audit] series error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, auditLoc, selectedPumpIds, selectedTankIds, pumpOptions, tankOptions, domain[0], domain[1]]);

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
