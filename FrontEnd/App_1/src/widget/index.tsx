import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { KPI } from "@/components/KPI";
import TankLevelChart from "@/components/TankLevelChart";
import OpsPumpsProfile from "@/components/OpsPumpsProfile";
import ByLocationTable from "@/components/ByLocationTable";
import { Tabs } from "@/components/Tabs";

import EnergyEfficiencyPage from "@/components/EnergyEfficiencyPage";
import ReliabilityPage from "@/components/ReliabilityPage";

import { loadDashboard } from "@/data/loadFromApi";
import { k } from "@/utils/format";
import { useLiveOps } from "@/hooks/useLiveOps";
import { listPumps, listTanks } from "@/api/graphs";

import { deriveLocOptions, mergeLocOptions } from "./helpers/locations";
import { usePlayback } from "./hooks/usePlayback";
import { useAudit } from "./hooks/useAudit";
import PlaybackControls from "./components/PlaybackControls";
import BaseSelectors from "./components/BaseSelectors";
import AuditPanel from "./components/AuditPanel";

import type { LocOpt, PumpInfo, TankInfo } from "./types";

export default function Widget() {
  const [live, setLive] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("operacion");

  // Ubicación BASE
  const [loc, setLoc] = useState<number | "all">("all");
  const [locOptionsAll, setLocOptionsAll] = useState<LocOpt[]>([]);
  const locId = loc === "all" ? undefined : Number(loc);

  // Selectores BASE
  const [pumpOptions, setPumpOptions] = useState<PumpInfo[]>([]);
  const [tankOptions, setTankOptions] = useState<TankInfo[]>([]);
  const [selectedPumpIds, setSelectedPumpIds] = useState<number[] | "all">("all");
  const [selectedTankIds, setSelectedTankIds] = useState<number[] | "all">("all");

  // Snapshot KPI/tabla
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const data = await loadDashboard(loc);
        if (!mounted) return;
        setLive(data);

        const optsNow = deriveLocOptions(data?.locations, data?.byLocation);
        setLocOptionsAll((prev) => mergeLocOptions(prev, optsNow));
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loc]);

  // Cargar bombas/tanques BASE
  useEffect(() => {
    let mounted = true;

    if (!locId) {
      setPumpOptions([]);
      setTankOptions([]);
      setSelectedPumpIds("all");
      setSelectedTankIds("all");
      return;
    }

    (async () => {
      try {
        const [p, t] = await Promise.all([
          listPumps({ locationId: locId }),
          listTanks({ locationId: locId }),
        ]);
        if (!mounted) return;
        setPumpOptions(p);
        setTankOptions(t);
        setSelectedPumpIds("all");
        setSelectedTankIds("all");
      } catch (e) {
        console.error("[filters] list error:", e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [locId]);

  // Live 24h BASE
  const pollMs = tab === "operacion" ? 15_000 : 10 * 60_000;
  const liveSync = useLiveOps({
    locationId: locId,
    periodHours: 24,
    bucket: "1min",
    pollMs,
    pumpIds: selectedPumpIds === "all" ? undefined : selectedPumpIds,
    tankIds: selectedTankIds === "all" ? undefined : selectedTankIds,
  });

  // Playback + dominio + series (lo usamos pero SOLO lo mostramos dentro de Auditoría)
  const playback = usePlayback({
    locId,
    tab,
    liveWindow: liveSync.window,
    livePumpTs: liveSync.pumpTs,
    liveTankTs: liveSync.tankTs,
    selectedPumpIds,
    selectedTankIds,
  });

  // Auditoría (segunda ubicación; usa el MISMO dominio del playback)
  const [auditEnabled, setAuditEnabled] = useState(false);
  const [auditLoc, setAuditLoc] = useState<number | "">("");
  const audit = useAudit({
    enabled: auditEnabled,
    auditLoc,
    domain: playback.domain,
  });

  // Si se cierra Auditoría, apagamos playback y volvemos a "Live"
  useEffect(() => {
    if (!auditEnabled) playback.setPlayEnabled(false);
  }, [auditEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // =========================
  // KPIs / tabla
  // =========================

  const byLocation = useMemo(
    () => (Array.isArray(live?.byLocation) ? live.byLocation : []),
    [live?.byLocation]
  );

  const byLocationFiltered = useMemo(() => {
    // "all" => sin filtro, mostramos todas
    if (locId == null) return byLocation;
    return byLocation.filter(
      (r: any) => Number(r?.location_id) === locId
    );
  }, [byLocation, locId]);

  const kpis = useMemo(() => {
    let tanks = 0,
      pumps = 0;
    for (const r of Array.isArray(byLocationFiltered)
      ? byLocationFiltered
      : []) {
      tanks += Number(r?.tanks_count ?? 0);
      pumps += Number(r?.pumps_count ?? 0);
    }
    return { tanks, pumps };
  }, [byLocationFiltered]);

  const totalPumpsCap = useMemo(
    () => liveSync.pumpsTotal ?? (kpis.pumps || undefined),
    [liveSync.pumpsTotal, kpis]
  );
  const auditPumpsCap = useMemo(
    () => (audit.pumpOptions?.length || 0) || undefined,
    [audit.pumpOptions]
  );

  return (
    <div className="p-6 space-y-6">
      {/* Filtros superiores */}
      <div className="flex flex-wrap gap-4 items-center">
        {/* Ubicación BASE */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Ubicación:</span>
          <select
            className="border rounded-xl p-2 text-sm"
            value={loc === "all" ? "all" : String(loc)}
            onChange={(e) =>
              setLoc(
                e.target.value === "all" ? "all" : Number(e.target.value)
              )
            }
          >
            <option value="all">Todas</option>
            {locOptionsAll.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        {/* ⛔ Playback exterior eliminado */}
      </div>

      {/* Selectores BASE */}
      {loc !== "all" && (
        <BaseSelectors
          pumpOptions={pumpOptions}
          tankOptions={tankOptions}
          selectedPumpIds={selectedPumpIds}
          setSelectedPumpIds={setSelectedPumpIds}
          selectedTankIds={selectedTankIds}
          setSelectedTankIds={setSelectedTankIds}
        />
      )}

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "operacion", label: "Operación" },
          { id: "eficiencia", label: "Eficiencia energética" },
          { id: "confiabilidad", label: "Operación y confiabilidad" },
          { id: "calidad", label: "Proceso y calidad del agua" },
          { id: "gestion", label: "Gestión global" },
        ]}
      />

      {/* ===== Operación ===== */}
      {tab === "operacion" && (
        <>
          {/* KPIs */}
          <section className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-3">
            <KPI label="Tanques" value={k(kpis.tanks)} />
            <KPI
              label="Bombas"
              value={k(liveSync?.pumpsTotal ?? kpis.pumps)}
            />
          </section>

          {/* Panel de Auditoría (incluye Playback adentro y selectores propios) */}
          <AuditPanel
            auditEnabled={auditEnabled}
            setAuditEnabled={setAuditEnabled}
            locOptions={locOptionsAll}
            auditLoc={auditLoc}
            setAuditLoc={setAuditLoc}
            tankOptions={audit.tankOptions}
            pumpOptions={audit.pumpOptions}
            selectedTankIds={audit.selectedTankIds}
            setSelectedTankIds={audit.setSelectedTankIds}
            selectedPumpIds={audit.selectedPumpIds}
            setSelectedPumpIds={audit.setSelectedPumpIds}
            playbackControls={
              <PlaybackControls
                disabled={!locId}
                playEnabled={playback.playEnabled}
                setPlayEnabled={playback.setPlayEnabled}
                playing={playback.playing}
                setPlaying={playback.setPlaying}
                playFinMin={playback.playFinMin}
                setPlayFinMin={playback.setPlayFinMin}
                MIN_OFFSET_MIN={playback.MIN_OFFSET_MIN}
                MAX_OFFSET_MIN={playback.MAX_OFFSET_MIN}
                setDragging={playback.setDragging}
                startLabel={playback.startLabel}
                endLabel={playback.endLabel}
              />
            }
          />

          {/* Gráficos BASE */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TankLevelChart
              ts={playback.tankTs}
              syncId="op-sync"
              title={
                playback.playEnabled
                  ? "Nivel del tanque (Playback 24 h)"
                  : "Nivel del tanque (24h • en vivo)"
              }
              tz="America/Argentina/Buenos_Aires"
              xDomain={playback.domain}
              xTicks={playback.ticks}
              hoverX={null}
              onHoverX={() => {}}
              showBrushIf={120}
            />
            <OpsPumpsProfile
              pumpsTs={playback.pumpTs}
              max={totalPumpsCap}
              syncId="op-sync"
              title={
                playback.playEnabled
                  ? "Bombas ON (Playback 24 h)"
                  : "Bombas ON (24h)"
              }
              tz="America/Argentina/Buenos_Aires"
              xDomain={playback.domain}
              xTicks={playback.ticks}
              hoverX={null}
              onHoverX={() => {}}
            />
          </section>

          {/* Gráficos AUDITORÍA (dos adicionales) */}
          {auditEnabled && auditLoc !== "" && (
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TankLevelChart
                ts={audit.tankTs ?? { timestamps: [], level_percent: [] }}
                syncId="op-sync"
                title="Nivel del tanque – Auditoría"
                tz="America/Argentina/Buenos_Aires"
                xDomain={playback.domain}
                xTicks={playback.ticks}
                hoverX={null}
                onHoverX={() => {}}
              />
              <OpsPumpsProfile
                pumpsTs={audit.pumpTs ?? { timestamps: [], is_on: [] }}
                max={auditPumpsCap}
                syncId="op-sync"
                title="Bombas ON – Auditoría"
                tz="America/Argentina/Buenos_Aires"
                xDomain={playback.domain}
                xTicks={playback.ticks}
                hoverX={null}
                onHoverX={() => {}}
              />
            </section>
          )}
        </>
      )}

      {/* ===== Eficiencia energética ===== */}
      {tab === "eficiencia" && (
        <section>
          <EnergyEfficiencyPage
            locationId={locId}
            tz="America/Argentina/Buenos_Aires"
          />
        </section>
      )}

      {/* ===== Confiabilidad ===== */}
      {tab === "confiabilidad" && (
        <ReliabilityPage
          locationId={loc === "all" ? "all" : locId ?? "all"}
          thresholdLow={90}
        />
      )}

      {/* Resumen por ubicación */}
      <section>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Resumen por ubicación</CardTitle>
          </CardHeader>
          <CardContent>
            <ByLocationTable rows={byLocationFiltered} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
