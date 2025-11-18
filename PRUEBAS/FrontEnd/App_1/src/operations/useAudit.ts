import { useEffect, useMemo, useState } from "react";
import { TankTs } from "@/components/TankLevelChart";
import { PumpsTs } from "@/components/OpsPumpsProfile";
import { getJSON } from "@/lib/http"; // Ajustá si tu helper tiene otro nombre

export type Id = number;
export type Named = { id: number; name: string };

export type AggTs = {
  timestamps?: Array<number | string>;
  // Para tanques:
  level_percent?: Array<number | string | null>;
  // Para bombas:
  is_on?: Array<number | boolean | string | null>;
} | null;

export function useAudit({
  startMs,
  endMs,
  bucketSeconds = 300,
}: {
  startMs: number;
  endMs: number;
  bucketSeconds?: number;
}) {
  // UI state
  const [auditEnabled, setAuditEnabled] = useState(false);
  const [auditLoc, setAuditLoc] = useState<number | "">("");
  const [auditPumpOptions, setAuditPumpOptions] = useState<Named[]>([]);
  const [auditTankOptions, setAuditTankOptions] = useState<Named[]>([]);
  const [selectedAuditPumpIds, setSelectedAuditPumpIds] = useState<number[] | "all">("all");
  const [selectedAuditTankIds, setSelectedAuditTankIds] = useState<number[] | "all">("all");

  // Data
  const [auditPumpsTs, setAuditPumpsTs] = useState<PumpsTs>(null);
  const [auditTankTs, setAuditTankTs] = useState<TankTs>(null);

  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);

  // Reset when disabling
  useEffect(() => {
    if (!auditEnabled) {
      setAuditLoc("");
      setAuditPumpOptions([]);
      setAuditTankOptions([]);
      setSelectedAuditPumpIds("all");
      setSelectedAuditTankIds("all");
      setAuditPumpsTs(null);
      setAuditTankTs(null);
    }
  }, [auditEnabled]);

  // Load pumps & tanks for chosen location
  useEffect(() => {
    if (!auditEnabled) return;
    const locId = auditLoc === "" ? null : Number(auditLoc);
    if (!locId) {
      setAuditPumpOptions([]);
      setAuditTankOptions([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        setLoadingOptions(true);
        const [pumps, tanks] = await Promise.all([
          getJSON<Named[]>(`/dirac/admin/pumps?location_id=${locId}`),
          getJSON<Named[]>(`/dirac/admin/tanks?location_id=${locId}`),
        ]);
        if (!alive) return;
        setAuditPumpOptions(pumps || []);
        setAuditTankOptions(tanks || []);
      } catch (e) {
        console.error("[audit] options error", e);
        setAuditPumpOptions([]);
        setAuditTankOptions([]);
      } finally {
        setLoadingOptions(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [auditEnabled, auditLoc]);

  // Load series for overlay
  useEffect(() => {
    if (!auditEnabled) return;
    const locId = auditLoc === "" ? null : Number(auditLoc);
    if (!locId) return;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) return;

    // Build ids
    const pumpIds =
      selectedAuditPumpIds === "all"
        ? auditPumpOptions.map((p) => p.id)
        : (selectedAuditPumpIds as number[]);
    const tankIds =
      selectedAuditTankIds === "all"
        ? auditTankOptions.map((t) => t.id)
        : (selectedAuditTankIds as number[]);

    let alive = true;
    (async () => {
      try {
        setLoadingSeries(true);

        // Bombas: cuenta/estado agregado
        const pumpsUrl = new URL(`/kpi/agg/pumps`, window.location.origin);
        pumpsUrl.searchParams.set("location_id", String(locId));
        pumpsUrl.searchParams.set("from", String(startMs));
        pumpsUrl.searchParams.set("to", String(endMs));
        pumpsUrl.searchParams.set("bucket_s", String(bucketSeconds));
        if (pumpIds.length > 0) pumpsUrl.searchParams.set("pump_ids", pumpIds.join(","));
        const p = await getJSON<PumpsTs>(pumpsUrl.toString());

        // Tanques: nivel; si hay varios, que el backend promedie (si soporta). Si no, usá el primero.
        const tanksUrl = new URL(`/kpi/agg/tanks`, window.location.origin);
        tanksUrl.searchParams.set("location_id", String(locId));
        tanksUrl.searchParams.set("from", String(startMs));
        tanksUrl.searchParams.set("to", String(endMs));
        tanksUrl.searchParams.set("bucket_s", String(bucketSeconds));
        if (tankIds.length > 0) tanksUrl.searchParams.set("tank_ids", tankIds.join(","));
        const t = await getJSON<TankTs>(tanksUrl.toString());

        if (!alive) return;
        setAuditPumpsTs(p ?? null);
        setAuditTankTs(t ?? null);
      } catch (e) {
        console.error("[audit] series error", e);
        if (!alive) return;
        setAuditPumpsTs(null);
        setAuditTankTs(null);
      } finally {
        setLoadingSeries(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [
    auditEnabled,
    auditLoc,
    selectedAuditPumpIds,
    selectedAuditTankIds,
    auditPumpOptions,
    auditTankOptions,
    startMs,
    endMs,
    bucketSeconds,
  ]);

  const anyLoading = useMemo(() => loadingOptions || loadingSeries, [loadingOptions, loadingSeries]);

  return {
    // UI
    auditEnabled,
    setAuditEnabled,
    auditLoc,
    setAuditLoc,
    auditPumpOptions,
    auditTankOptions,
    selectedAuditPumpIds,
    setSelectedAuditPumpIds,
    selectedAuditTankIds,
    setSelectedAuditTankIds,
    // Data
    auditPumpsTs,
    auditTankTs,
    // Flags
    loading: anyLoading,
  };
}
