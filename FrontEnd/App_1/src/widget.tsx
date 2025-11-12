// src/widget.tsx
//
// PERF ✅: downsampling uniforme por período, bucket/poll adaptativo,
//          crosshair con rAF-throttle, ticks controlados y sin brush en 7d/30d.

import React, { useEffect, useMemo, useState, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./components/ui/card";
import { KPI } from "./components/KPI";
import TankLevelChart from "./components/TankLevelChart";
import OpsPumpsProfile from "./components/OpsPumpsProfile";
import ByLocationTable from "./components/ByLocationTable";
import { Tabs } from "./components/Tabs";
import { loadDashboard } from "@/data/loadFromApi";
import { k } from "./utils/format";
import EnergyEfficiencyPage from "./components/EnergyEfficiencyPage";
import ReliabilityPage from "./components/ReliabilityPage";
import { useLiveOps } from "@/hooks/useLiveOps";
import { listPumps, listTanks } from "@/api/graphs";

type LocOpt = { id: number; name: string };
type PumpInfo = { pump_id: number; name: string; location_id: number; location_name: string };
type TankInfo = { tank_id: number; name: string; location_id: number; location_name: string };

// ===== helpers de tiempo =====
const H = 60 * 60 * 1000;
function toMs(x: number | string): number {
  if (typeof x === "number") return x > 10_000 ? x : x * 1000;
  const n = Number(x);
  if (Number.isFinite(n) && n > 10_000) return n;
  return new Date(x).getTime();
}
function startOfMin(ms: number) { const d = new Date(ms); d.setSeconds(0, 0); return d.getTime(); }
function ceilToHour(ms: number) { return Math.ceil(ms / H) * H; }

// ===== períodos => hours/bucket/poll y límites de puntos =====
const PERIODS = {
  "24h": { hours: 24,      bucket: "1min" as const, pollMs: 15_000, maxPts: 1_200 },
  "7d":  { hours: 24 * 7,  bucket: "1h"   as const, pollMs: 60_000, maxPts:   700 },
  "30d": { hours: 24 * 30, bucket: "1d"   as const, pollMs: 300_000, maxPts:   900 },
};

// ===== throttle RAF para hover =====
function useRafThrottle<T>(setter: (v: T) => void) {
  const frame = useRef<number | null>(null);
  const last = useRef<T | null>(null);
  return (v: T) => {
    last.current = v;
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      setter(last.current as T);
      frame.current = null;
    });
  };
}

// ===== downsampling uniforme (rápido y suficiente para SVG) =====
function decimateUniform(
  xs: number[] = [],
  ys: Array<number | null> = [],
  maxPts: number
): { x: number[]; y: Array<number | null> } {
  const n = Math.min(xs.length, ys.length);
  if (n <= maxPts || maxPts <= 0) return { x: xs.slice(), y: ys.slice() };
  const step = Math.ceil(n / maxPts);
  const dx: number[] = [];
  const dy: Array<number | null> = [];
  for (let i = 0; i < n; i += step) {
    dx.push(xs[i]);
    dy.push(ys[i]);
  }
  // asegurar último punto
  if (dx[dx.length - 1] !== xs[n - 1]) {
    dx.push(xs[n - 1]);
    dy.push(ys[n - 1]);
  }
  return { x: dx, y: dy };
}

export default function KpiWidget() {
  const [live, setLive] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("operacion");

  // Filtro de ubicación
  const [loc, setLoc] = useState<number | "all">("all");
  const [locOptionsAll, setLocOptionsAll] = useState<LocOpt[]>([]);

  // Período
  const [period, setPeriod] = useState<keyof typeof PERIODS>("24h");

  // Selectores de Bombas/Tanques por localidad
  const [pumpOptions, setPumpOptions] = useState<PumpInfo[]>([]);
  const [tankOptions, setTankOptions] = useState<TankInfo[]>([]);
  const [selectedPumpIds, setSelectedPumpIds] = useState<number[] | "all">("all");
  const [selectedTankIds, setSelectedTankIds] = useState<number[] | "all">("all");

  // ==== snapshot (tabla/KPI) ====
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
    return () => { mounted = false; };
  }, [loc]);

  // Opciones por localidad
  useEffect(() => {
    let mounted = true;
    const locId = loc === "all" ? undefined : Number(loc);
    if (!locId) {
      setPumpOptions([]); setTankOptions([]);
      setSelectedPumpIds("all"); setSelectedTankIds("all");
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
    return () => { mounted = false; };
  }, [loc]);

  const byLocation = live?.byLocation || [];

  // === LIVE (period/bucket/poll) ===
  const locId = loc === "all" ? undefined : Number(loc);
  const cfg = PERIODS[period];

  const pumpIdsForHook = useMemo(
    () => (selectedPumpIds === "all" ? undefined : selectedPumpIds),
    [selectedPumpIds]
  );
  const tankIdsForHook = useMemo(
    () => (selectedTankIds === "all" ? undefined : selectedTankIds),
    [selectedTankIds]
  );

  // Pausar fetch si no estamos en la pestaña de Operación
  const pollMs = tab === "operacion" ? cfg.pollMs : 10 * 60_000;

  const liveSync = useLiveOps({
    locationId: locId,
    periodHours: cfg.hours,
    bucket: cfg.bucket,
    pollMs,
    pumpIds: pumpIdsForHook,
    tankIds: tankIdsForHook,
  });

  useEffect(() => {
    if (loc === "all") return;
    const exists = locOptionsAll.some((o) => o.id === loc);
    if (!exists) setLoc("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locOptionsAll]);

  const byLocationFiltered = useMemo(() => {
    if (loc === "all") return byLocation;
    return (Array.isArray(byLocation) ? byLocation : []).filter(
      (r: any) => Number(r?.location_id) === loc
    );
  }, [byLocation, loc]);

  const kpis = useMemo(() => {
    let tanks = 0, pumps = 0;
    for (const r of Array.isArray(byLocationFiltered) ? byLocationFiltered : []) {
      tanks += Number(r?.tanks_count ?? 0);
      pumps += Number(r?.pumps_count ?? 0);
    }
    return { tanks, pumps };
  }, [byLocationFiltered]);

  const totalPumpsCap = useMemo(
    () => liveSync.pumpsTotal ?? (kpis.pumps || undefined),
    [liveSync.pumpsTotal, kpis]
  );

  // ===== Sincronización eje X =====
  const [hoverX, _setHoverX] = useState<number | null>(null);
  const setHoverXRaf = useRafThrottle<number | null>(_setHoverX);

  const { xDomain, xTicks } = useMemo(() => {
    const win = liveSync.window;
    if (win?.start && win?.end) {
      const ticks: number[] = [];
      const firstHour = ceilToHour(win.start);
      for (let t = firstHour; t <= win.end; t += H) ticks.push(t);
      return { xDomain: [win.start, win.end] as [number, number], xTicks: ticks };
    }

    const tankArr = (liveSync.tankTs?.timestamps ?? []) as Array<number | string>;
    const pumpArr = (liveSync.pumpTs?.timestamps ?? []) as Array<number | string>;
    const maxMs = (arr: Array<number | string>) => {
      let m = -Infinity;
      for (const t of arr) { const ms = toMs(t as any); if (Number.isFinite(ms) && ms > m) m = ms; }
      return Number.isFinite(m) ? (m as number) : undefined;
    };

    const lastTank = maxMs(tankArr);
    const lastPump = maxMs(pumpArr);
    const endRaw = lastTank ?? lastPump ?? Date.now();
    const end = startOfMin(endRaw);
    const start = end - cfg.hours * H;

    const firstHour = ceilToHour(start);
    const ticks: number[] = [];
    for (let t = firstHour; t <= end; t += H) ticks.push(t);

    return { xDomain: [start, end] as [number, number], xTicks: ticks };
  }, [liveSync.window, liveSync.tankTs?.timestamps, liveSync.pumpTs?.timestamps, cfg.hours]);

  // En 7d/30d dejamos que Recharts calcule ticks (menos carga)
  const xTicksProp = period === "24h" ? xTicks : undefined;

  // ===== Downsample de series antes de pintar =====
  const decimated = useMemo(() => {
    const limit = cfg.maxPts;

    const tx = (liveSync.tankTs?.timestamps as number[]) ?? [];
    const ty = (liveSync.tankTs?.level_percent as Array<number | null>) ?? [];
    const px = (liveSync.pumpTs?.timestamps as number[]) ?? [];
    const py = (liveSync.pumpTs?.is_on as Array<number | null>) ?? [];

    const tds = decimateUniform(tx, ty, limit);
    const pds = decimateUniform(px, py, limit);

    return {
      tankTs: { timestamps: tds.x, level_percent: tds.y },
      pumpTs: { timestamps: pds.x, is_on: pds.y },
    };
  }, [liveSync.tankTs?.timestamps, liveSync.tankTs?.level_percent, liveSync.pumpTs?.timestamps, liveSync.pumpTs?.is_on, cfg.maxPts]);

  return (
    <div className="p-6 space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap gap-4 items-center">
        {/* Ubicación */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Ubicación:</span>
          <select
            className="border rounded-xl p-2 text-sm"
            value={loc === "all" ? "all" : String(loc)}
            onChange={(e) => setLoc(e.target.value === "all" ? "all" : Number(e.target.value))}
          >
            <option value="all">Todas</option>
            {locOptionsAll.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        {/* Período */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Período:</span>
          <div className="inline-flex overflow-hidden rounded-xl border">
            {(["24h", "7d", "30d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-sm ${period === p ? "bg-black text-white" : "bg-white hover:bg-gray-100"}`}
              >
                {p === "24h" ? "24 h" : p === "7d" ? "7 d" : "30 d"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Selectores por localidad */}
      {loc !== "all" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Bombas */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">Bombas (selección)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedPumpIds === "all"}
                    onChange={(e) => setSelectedPumpIds(e.target.checked ? "all" : [])}
                  />
                  <span className="text-sm">Todas</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-auto">
                {pumpOptions.map((p) => {
                  const checked = selectedPumpIds === "all" ? false : (selectedPumpIds as number[]).includes(p.pump_id);
                  return (
                    <label key={p.pump_id}
                      className={`px-2 py-1 border rounded-lg text-sm cursor-pointer ${checked ? "bg-black text-white" : "bg-white hover:bg-gray-50"}`}>
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={checked}
                        disabled={selectedPumpIds === "all"}
                        onChange={(e) => {
                          if (selectedPumpIds === "all") return;
                          const arr = new Set(selectedPumpIds as number[]);
                          if (e.target.checked) arr.add(p.pump_id); else arr.delete(p.pump_id);
                          setSelectedPumpIds(Array.from(arr));
                        }}
                      />
                      {p.name}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500">* “Todas” muestra la cantidad ON de todas las bombas de la localidad.</p>
            </CardContent>
          </Card>

          {/* Tanques */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">Tanques (selección)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedTankIds === "all"}
                    onChange={(e) => setSelectedTankIds(e.target.checked ? "all" : [])}
                  />
                  <span className="text-sm">Todos (promedio)</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-auto">
                {tankOptions.map((t) => {
                  const checked = selectedTankIds === "all" ? false : (selectedTankIds as number[]).includes(t.tank_id);
                  return (
                    <label key={t.tank_id}
                      className={`px-2 py-1 border rounded-lg text-sm cursor-pointer ${checked ? "bg-black text-white" : "bg-white hover:bg-gray-50"}`}>
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={checked}
                        disabled={selectedTankIds === "all"}
                        onChange={(e) => {
                          if (selectedTankIds === "all") return;
                          const arr = new Set(selectedTankIds as number[]);
                          if (e.target.checked) arr.add(t.tank_id); else arr.delete(t.tank_id);
                          setSelectedTankIds(Array.from(arr));
                        }}
                      />
                      {t.name}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500">* “Todos” muestra el <b>promedio</b> de niveles.</p>
            </CardContent>
          </Card>
        </div>
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

      {/* ====== OPERACIÓN ====== */}
      {tab === "operacion" && (
        <>
          {/* Summary */}
          <section className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-3">
            <KPI label="Tanques" value={k((live?.byLocation?.[0]?.tanks_count ?? 0) ||  kpis.tanks)} />
            <KPI label="Bombas" value={k(liveSync?.pumpsTotal ?? kpis.pumps)} />
          </section>

          {/* Gráficos principales */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TankLevelChart
              ts={decimated.tankTs}
              syncId="op-sync"
              title={`Nivel del tanque (${period === "24h" ? "24h" : period === "7d" ? "7 días" : "30 días"} • en vivo)`}
              tz={"America/Argentina/Buenos_Aires"}
              xDomain={xDomain}
              xTicks={xTicksProp}
              hoverX={hoverX}
              onHoverX={setHoverXRaf}
              showBrushIf={period === "24h" ? 120 : 999999}
            />
            <OpsPumpsProfile
              pumpsTs={decimated.pumpTs}
              max={totalPumpsCap}
              syncId="op-sync"
              title={`Bombas ON (${period === "24h" ? "24h" : period === "7d" ? "7 días" : "30 días"})`}
              tz={"America/Argentina/Buenos_Aires"}
              xDomain={xDomain}
              xTicks={xTicksProp}
              hoverX={hoverX}
              onHoverX={setHoverXRaf}
            />
          </section>
        </>
      )}

      {/* ====== EFICIENCIA ====== */}
      {tab === "eficiencia" && (
        <section>
          <EnergyEfficiencyPage pumpAgg={live?.pumpTs || null} capacity={totalPumpsCap} />
        </section>
      )}

      {/* ====== CONFIABILIDAD ====== */}
      {tab === "confiabilidad" && (
        <ReliabilityPage locationId={loc === "all" ? "all" : Number(loc)} thresholdLow={90} />
      )}

      {/* ====== Resumen por ubicación ====== */}
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

/* ================= helpers ================= */

function deriveLocOptions(liveLocations: any, byLocation: any): LocOpt[] {
  const fromLive = (Array.isArray(liveLocations) ? liveLocations : [])
    .map((l: any) => {
      const id = Number.isFinite(Number(l?.id)) ? Number(l.id) : null;
      const name = (l?.name ?? l?.code ?? "").toString().trim();
      return id && name ? { id, name } : null;
    })
    .filter(Boolean) as LocOpt[];

  if (fromLive.length > 0) return sortByName(uniqueById(fromLive));

  const seen = new Map<number, string>();
  for (const r of Array.isArray(byLocation) ? byLocation : []) {
    const id = Number.isFinite(Number(r?.location_id)) ? Number(r.location_id) : null;
    const name = (r?.location_name ?? "").toString().trim();
    if (id && name && !seen.has(id)) seen.set(id, name);
  }
  const fromBL = Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  return sortByName(fromBL);
}

function mergeLocOptions(prev: LocOpt[], next: LocOpt[]): LocOpt[] {
  const m = new Map<number, string>();
  for (const o of prev) m.set(o.id, o.name);
  for (const o of next) {
    const cur = m.get(o.id);
    if (!cur || (o.name && o.name.length > cur.length)) m.set(o.id, o.name);
  }
  return sortByName(Array.from(m, ([id, name]) => ({ id, name })));
}
function uniqueById(arr: LocOpt[]): LocOpt[] {
  const m = new Map<number, string>();
  arr.forEach((o) => { if (!m.has(o.id)) m.set(o.id, o.name); });
  return Array.from(m, ([id, name]) => ({ id, name }));
}
function sortByName(arr: LocOpt[]): LocOpt[] {
  return [...arr].sort((a, b) => a.name.localeCompare(b.name));
}
