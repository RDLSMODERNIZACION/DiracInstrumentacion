// src/widget.tsx
//
// 24 h fija + Playback hasta 7 días atrás (fluido):
// - Mientras arrastrás el slider NO hace fetch; solo mueve el dominio (ejes/ticks correctos).
// - Al soltar, o tras 600 ms sin mover, pide los datos de esa ventana 24 h.
// - Muestra “Inicio” y “Fin” (día+hora) de la ventana actual en TZ local.
// - Playback solo con una localidad (no “Todas”).
//
// Perf:
// - Poll 15s en vivo; si activás playback se pausa el poll y se consulta por ventana.
// - rAF-throttle para hover; sin períodos largos.

import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { listPumps, listTanks, fetchPumpsLive, fetchTanksLive } from "@/api/graphs";

type LocOpt = { id: number; name: string };
type PumpInfo = { pump_id: number; name: string; location_id: number; location_name: string };
type TankInfo = { tank_id: number; name: string; location_id: number; location_name: string };

const TZ = "America/Argentina/Buenos_Aires";
const H = 60 * 60 * 1000;

// ===== helpers de tiempo/hover =====
function toMs(x: number | string): number {
  if (typeof x === "number") return x > 10_000 ? x : x * 1000;
  const n = Number(x);
  if (Number.isFinite(n) && n > 10_000) return n;
  return new Date(x).getTime();
}
function startOfMin(ms: number) { const d = new Date(ms); d.setSeconds(0, 0); return d.getTime(); }
function floorToHour(ms: number) { const d = new Date(ms); d.setMinutes(0,0,0); return d.getTime(); }
function ceilToHour(ms: number)  { const d = new Date(ms); d.setMinutes(d.getMinutes() ? 60 : 0,0,0); return d.getTime(); }
function floorToMinuteISO(d: Date) { const dd = new Date(d); dd.setSeconds(0, 0); return dd.toISOString(); }
function fmtDayTime(ms: number, tz = TZ) {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: tz, weekday: "long", day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(ms);
  } catch { return new Date(ms).toLocaleString(); }
}
function buildHourTicks(domain: [number, number]) {
  const [s, e] = domain;
  const start = floorToHour(s);
  const end   = ceilToHour(e);
  const ticks: number[] = [];
  for (let t = start; t <= end; t += H) ticks.push(t);
  return ticks;
}
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

export default function KpiWidget() {
  const [live, setLive] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("operacion");

  // Filtro de ubicación
  const [loc, setLoc] = useState<number | "all">("all");
  const [locOptionsAll, setLocOptionsAll] = useState<LocOpt[]>([]);

  // Selectores por localidad
  const [pumpOptions, setPumpOptions] = useState<PumpInfo[]>([]);
  const [tankOptions, setTankOptions] = useState<TankInfo[]>([]);
  const [selectedPumpIds, setSelectedPumpIds] = useState<number[] | "all">("all");
  const [selectedTankIds, setSelectedTankIds] = useState<number[] | "all">("all");

  // ==== snapshot KPI/tabla ====
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
      } catch (e) { console.error(e); }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [loc]);

  // Cargar bombas/tanques por localidad
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
        const [p, t] = await Promise.all([listPumps({ locationId: locId }), listTanks({ locationId: locId })]);
        if (!mounted) return;
        setPumpOptions(p);
        setTankOptions(t);
        setSelectedPumpIds("all");
        setSelectedTankIds("all");
      } catch (e) { console.error("[filters] list error:", e); }
    })();
    return () => { mounted = false; };
  }, [loc]);

  const byLocation = live?.byLocation || [];

  // === LIVE 24h ===
  const locId = loc === "all" ? undefined : Number(loc);
  const [playEnabled, setPlayEnabled] = useState(false);
  const pollMs = tab === "operacion" && !playEnabled ? 15_000 : 10 * 60_000;

  const liveSync = useLiveOps({
    locationId: locId,
    periodHours: 24,
    bucket: "1min",
    pollMs,
    pumpIds: selectedPumpIds === "all" ? undefined : selectedPumpIds,
    tankIds: selectedTankIds === "all" ? undefined : selectedTankIds,
  });

  // ===== Playback 7 días (ventana FIJA 24h) =====
  const MAX_OFFSET_MIN = 7 * 24 * 60;       // 7 días hacia atrás
  const [playOffsetMin, setPlayOffsetMin] = useState(0);  // fin de ventana
  const [dragging, setDragging] = useState(false);
  const [offsetDebounced, setOffsetDebounced] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playTankTs, setPlayTankTs] = useState<{timestamps:number[]; level_percent:(number|null)[]} | null>(null);
  const [playPumpTs, setPlayPumpTs] = useState<{timestamps:number[]; is_on:(number|null)[]} | null>(null);
  const [playWindow, setPlayWindow] = useState<{fromMs:number; toMs:number} | null>(null);
  const [loadingPlay, setLoadingPlay] = useState(false);

  // Dominio “en vivo” (24h actual) — fallback si no hay window en liveSync aún
  const { xDomainLive } = useMemo(() => {
    const win = liveSync.window;
    if (win?.start && win?.end) return { xDomainLive: [win.start, win.end] as [number, number] };
    const end = startOfMin(Date.now());
    const start = end - 24 * H;
    return { xDomainLive: [start, end] as [number, number] };
  }, [liveSync.window]);

  // Dominio del slider (se actualiza en tiempo real mientras arrastrás)
  const sliderDomain: [number, number] = useMemo(() => {
    const to = startOfMin(Date.now() - playOffsetMin * 60_000);
    const from = to - 24 * H;
    return [from, to];
  }, [playOffsetMin]);

  // Dominio efectivo que enviamos a los charts (en playback usa sliderDomain, si no, live)
  const useXDomain = playEnabled ? sliderDomain : xDomainLive;

  // Ticks SIEMPRE para el dominio actual (soluciona “eje X vacío”)
  const xTicksDisplay = useMemo(() => buildHourTicks(useXDomain), [useXDomain[0], useXDomain[1]]);

  // Debounce: solo cuando NO estás arrastrando se programa el fetch (600 ms)
  useEffect(() => {
    if (!playEnabled || !locId) return;
    if (dragging) return;
    const id = window.setTimeout(() => setOffsetDebounced(playOffsetMin), 600);
    return () => window.clearTimeout(id);
  }, [playEnabled, dragging, playOffsetMin, locId]);

  // Fetch de la ventana 24h cuando cambia offsetDebounced
  useEffect(() => {
    if (!playEnabled || !locId) { setPlayTankTs(null); setPlayPumpTs(null); setPlayWindow(null); return; }
    let cancelled = false;
    const toDate = new Date(Date.now() - offsetDebounced * 60_000);
    const fromDate = new Date(toDate.getTime() - 24 * H);
    const fromISO = floorToMinuteISO(fromDate);
    const toISO   = floorToMinuteISO(toDate);
    setLoadingPlay(true);
    (async () => {
      try {
        const [pumps, tanks] = await Promise.all([
          fetchPumpsLive({
            from: fromISO, to: toISO, locationId: locId,
            pumpIds: selectedPumpIds === "all" ? undefined : selectedPumpIds,
            bucket: "1min", aggMode: "avg", connectedOnly: true,
          }),
          fetchTanksLive({
            from: fromISO, to: toISO, locationId: locId,
            tankIds: selectedTankIds === "all" ? undefined : selectedTankIds,
            agg: "avg", carry: true, bucket: "1min", connectedOnly: true,
          }),
        ]);
        if (cancelled) return;
        setPlayPumpTs({ timestamps: pumps.timestamps, is_on: pumps.is_on });
        setPlayTankTs({ timestamps: tanks.timestamps, level_percent: tanks.level_percent });
        setPlayWindow({ fromMs: new Date(fromISO).getTime(), toMs: new Date(toISO).getTime() });
      } catch (e) {
        if (!cancelled) { setPlayPumpTs(null); setPlayTankTs(null); setPlayWindow(null); }
        console.error("[playback] fetch error:", e);
      } finally {
        if (!cancelled) setLoadingPlay(false);
      }
    })();
    return () => { cancelled = true; };
  }, [playEnabled, offsetDebounced, locId, selectedPumpIds, selectedTankIds]);

  // Auto-play: avanza 10 min / s
  useEffect(() => {
    if (!playEnabled || !playing) return;
    const id = window.setInterval(() => {
      setPlayOffsetMin(prev => Math.min(MAX_OFFSET_MIN, prev + 10));
    }, 1000);
    return () => window.clearInterval(id);
  }, [playEnabled, playing]);

  // Series y dominio (live vs playback)
  const useTank = playEnabled && playTankTs ? playTankTs : (liveSync.tankTs ?? {timestamps:[], level_percent:[]});
  const usePump = playEnabled && playPumpTs ? playPumpTs : (liveSync.pumpTs ?? {timestamps:[], is_on:[]});

  // Etiquetas “día y hora”
  const startLabel = useMemo(() => fmtDayTime(useXDomain[0], TZ), [useXDomain]);
  const endLabel   = useMemo(() => fmtDayTime(useXDomain[1], TZ), [useXDomain]);

  // Hover rAF (stable)
  const [hoverX, _setHoverX] = useState<number | null>(null);
  const setHoverXRaf = useRafThrottle<number | null>(_setHoverX);

  // ===== Tabla y KPI por ubicación =====
  const byLocationFiltered = useMemo(() => {
    if (loc === "all") return byLocation;
    return (Array.isArray(byLocation) ? byLocation : []).filter((r: any) => Number(r?.location_id) === loc);
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

  return (
    <div className="p-6 space-y-6">
      {/* Fila filtros */}
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

        {/* Playback 24h (hasta 7 días) */}
        <div className="flex-1 min-w-[320px]">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={loc === "all"}
                checked={playEnabled}
                onChange={(e) => { setPlayEnabled(e.target.checked); setPlaying(false); }}
              />
              <span className={`text-sm ${loc === "all" ? "text-gray-400" : "text-gray-700"}`}>
                Playback 24 h (hasta 7 días atrás)
              </span>
            </label>

            <button
              className="px-2 py-1 border rounded-lg text-sm"
              disabled={!playEnabled}
              onClick={()=> setPlaying(p=>!p)}
              title={playing ? "Pausar" : "Reproducir"}
            >
              {playing ? "⏸" : "▶"}
            </button>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={MAX_OFFSET_MIN}
              step={1}
              disabled={!playEnabled}
              value={playOffsetMin}
              onChange={(e)=> setPlayOffsetMin(Number(e.target.value))}
              onMouseDown={()=> setDragging(true)}
              onMouseUp={()=> setDragging(false)}
              onTouchStart={()=> setDragging(true)}
              onTouchEnd={()=> setDragging(false)}
              className="w-full"
              title="Fin de la ventana (minutos hacia atrás)"
            />
          </div>

          {/* Etiquetas de rango actual */}
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-gray-500">Inicio: <b>{startLabel}</b></span>
            <span className="text-gray-500">Fin: <b>{endLabel}</b></span>
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
            <KPI label="Tanques" value={k((live?.byLocation?.[0]?.tanks_count ?? 0) || kpis.tanks)} />
            <KPI label="Bombas" value={k(liveSync?.pumpsTotal ?? kpis.pumps)} />
          </section>

          {/* Gráficos */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TankLevelChart
              ts={playEnabled && playTankTs ? playTankTs : liveSync.tankTs}
              syncId="op-sync"
              title={playEnabled ? "Nivel del tanque (Playback 24 h)" : "Nivel del tanque (24h • en vivo)"}
              tz={TZ}
              xDomain={useXDomain}
              xTicks={xTicksDisplay}
              hoverX={hoverX}
              onHoverX={setHoverXRaf}
              showBrushIf={120}
            />
            <OpsPumpsProfile
              pumpsTs={playEnabled && playPumpTs ? playPumpTs : liveSync.pumpTs}
              max={totalPumpsCap}
              syncId="op-sync"
              title={playEnabled ? "Bombas ON (Playback 24 h)" : "Bombas ON (24h)"}
              tz={TZ}
              xDomain={useXDomain}
              xTicks={xTicksDisplay}
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
