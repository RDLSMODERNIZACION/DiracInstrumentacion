//
// 24 h fija + Playback hasta 7 días atrás (orientación “natural”):
// - La barra va de IZQUIERDA (hace 7 días) a DERECHA (ahora).
// - La ventana visible SIEMPRE es de 24 h.
// - Al presionar Play avanza hacia ADELANTE (de 7d → ahora).
// - Mientras arrastrás NO hace fetch (solo mueve el dominio y recalcula ticks).
// - Al soltar, o tras 600 ms sin mover, pide los datos de esa ventana 24 h.

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

// ===== helpers de tiempo / UI =====
function startOfMin(ms: number) { const d = new Date(ms); d.setSeconds(0, 0); return d.getTime(); }
function floorToHour(ms: number) { const d = new Date(ms); d.setMinutes(0,0,0); return d.getTime(); }
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
  const end   = floorToHour(e);
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

  // Filtro de ubicación (BASE)
  const [loc, setLoc] = useState<number | "all">("all");
  const [locOptionsAll, setLocOptionsAll] = useState<LocOpt[]>([]);

  // Selectores por localidad (BASE)
  const [pumpOptions, setPumpOptions] = useState<PumpInfo[]>([]);
  const [tankOptions, setTankOptions] = useState<TankInfo[]>([]);
  const [selectedPumpIds, setSelectedPumpIds] = useState<number[] | "all">("all");
  const [selectedTankIds, setSelectedTankIds] = useState<number[] | "all">("all");

  // ==== AUDITORÍA (segunda ubicación, controles y gráficos propios) ====
  const [auditEnabled, setAuditEnabled] = useState(false);
  const [auditLoc, setAuditLoc] = useState<number | "">("");
  const [auditPumpOptions, setAuditPumpOptions] = useState<PumpInfo[]>([]);
  const [auditTankOptions, setAuditTankOptions] = useState<TankInfo[]>([]);
  const [selectedAuditPumpIds, setSelectedAuditPumpIds] = useState<number[] | "all">("all");
  const [selectedAuditTankIds, setSelectedAuditTankIds] = useState<number[] | "all">("all");
  const [auditPumpTs, setAuditPumpTs] = useState<{timestamps:number[]; is_on:(number|null)[]} | null>(null);
  const [auditTankTs, setAuditTankTs] = useState<{timestamps:number[]; level_percent:(number|null)[]} | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // ==== snapshot KPI/tabla (BASE) ====
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

  // Cargar bombas/tanques por localidad (BASE)
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

  // === LIVE 24h (BASE) ===
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

  // ===== Playback 7 días (24h fija, de izquierda=7d atrás a derecha=ahora) =====
  const MAX_OFFSET_MIN = 7 * 24 * 60;       // 10080 min = 7 días
  const MIN_OFFSET_MIN = 24 * 60;           // el fin debe ser al menos +24h desde el inicio base
  const [playFinMin, setPlayFinMin] = useState(MAX_OFFSET_MIN);   // fin = “ahora”
  const [dragging, setDragging] = useState(false);
  const [finDebounced, setFinDebounced] = useState(MAX_OFFSET_MIN);
  const [playing, setPlaying] = useState(false);

  const [playTankTs, setPlayTankTs] = useState<{timestamps:number[]; level_percent:(number|null)[]} | null>(null);
  const [playPumpTs, setPlayPumpTs] = useState<{timestamps:number[]; is_on:(number|null)[]} | null>(null);
  const [playWindow, setPlayWindow] = useState<{fromMs:number; toMs:number} | null>(null);
  const [loadingPlay, setLoadingPlay] = useState(false);

  // Inicio base de la escala: hace 7 días (alineado a minuto)
  const baseStartMs = useMemo(() => startOfMin(Date.now() - 7 * 24 * H), []);

  // Dominio “en vivo” como fallback
  const { xDomainLive } = useMemo(() => {
    const win = liveSync.window;
    if (win?.start && win?.end) return { xDomainLive: [win.start, win.end] as [number, number] };
    const end = startOfMin(Date.now());
    const start = end - 24 * H;
    return { xDomainLive: [start, end] as [number, number] };
  }, [liveSync.window]);

  // Dominio del slider (en tiempo real mientras arrastrás)
  const sliderDomain: [number, number] = useMemo(() => {
    const to = baseStartMs + playFinMin * 60_000;
    const from = to - 24 * H;
    return [from, to];
  }, [baseStartMs, playFinMin]);

  // Dominio efectivo enviado a los charts
  const useXDomain = playEnabled ? sliderDomain : xDomainLive;

  // Ticks SIEMPRE para el dominio actual (corrige ejes vacíos)
  const xTicksDisplay = useMemo(() => buildHourTicks(useXDomain), [useXDomain[0], useXDomain[1]]);

  // Debounce: cuando NO estás arrastrando, programa fetch (600 ms)
  useEffect(() => {
    if (!playEnabled || !locId) return;
    if (dragging) return;
    const id = window.setTimeout(() => setFinDebounced(playFinMin), 600);
    return () => window.clearTimeout(id);
  }, [playEnabled, dragging, playFinMin, locId]);

  // Fetch de la ventana 24h cuando cambia finDebounced (BASE)
  useEffect(() => {
    if (!playEnabled || !locId) { setPlayTankTs(null); setPlayPumpTs(null); setPlayWindow(null); return; }
    let cancelled = false;
    const toMs = startOfMin(baseStartMs + finDebounced * 60_000);
    const fromMs = toMs - 24 * H;
    const fromISO = floorToMinuteISO(new Date(fromMs));
    const toISO   = floorToMinuteISO(new Date(toMs));
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
        setPlayWindow({ fromMs, toMs });
      } catch (e) {
        if (!cancelled) { setPlayPumpTs(null); setPlayTankTs(null); setPlayWindow(null); }
        console.error("[playback] fetch error:", e);
      } finally {
        if (!cancelled) setLoadingPlay(false);
      }
    })();
    return () => { cancelled = true; };
  }, [playEnabled, finDebounced, locId, selectedPumpIds, selectedTankIds, baseStartMs]);

  // Auto-play: avanza 10 min / s hacia ADELANTE hasta “ahora”
  useEffect(() => {
    if (!playEnabled || !playing) return;
    const id = window.setInterval(() => {
      setPlayFinMin(prev => Math.min(MAX_OFFSET_MIN, prev + 10));
    }, 1000);
    return () => window.clearInterval(id);
  }, [playEnabled, playing]);

  // Series y dominio (live vs playback)
  const useTank = playEnabled && playTankTs ? playTankTs : (liveSync.tankTs ?? {timestamps:[], level_percent:[]});
  const usePump = playEnabled && playPumpTs ? playPumpTs : (liveSync.pumpTs ?? {timestamps:[], is_on:[]});

  // Etiquetas “día y hora”
  const startLabel = useMemo(() => fmtDayTime(useXDomain[0], TZ), [useXDomain]);
  const endLabel   = useMemo(() => fmtDayTime(useXDomain[1], TZ), [useXDomain]);

  // Hover rAF (estable)
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
  const auditPumpsCap = useMemo(
    () => (auditPumpOptions?.length || 0) || undefined,
    [auditPumpOptions]
  );

  // =================== AUDITORÍA: cargar assets (bombas/tanques) ===================
  useEffect(() => {
    if (!auditEnabled) {
      setAuditPumpOptions([]); setAuditTankOptions([]);
      setSelectedAuditPumpIds("all"); setSelectedAuditTankIds("all");
      setAuditPumpTs(null); setAuditTankTs(null);
      return;
    }
    const locId = auditLoc === "" ? undefined : Number(auditLoc);
    if (!locId) {
      setAuditPumpOptions([]); setAuditTankOptions([]);
      setSelectedAuditPumpIds("all"); setSelectedAuditTankIds("all");
      setAuditPumpTs(null); setAuditTankTs(null);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const [p, t] = await Promise.all([listPumps({ locationId: locId }), listTanks({ locationId: locId })]);
        if (!mounted) return;
        setAuditPumpOptions(p || []);
        setAuditTankOptions(t || []);
        setSelectedAuditPumpIds("all");
        setSelectedAuditTankIds("all");
      } catch (e) {
        if (mounted) { setAuditPumpOptions([]); setAuditTankOptions([]); }
        console.error("[audit] options error:", e);
      }
    })();
    return () => { mounted = false; };
  }, [auditEnabled, auditLoc]);

  // =================== AUDITORÍA: fetch de series con la MISMA ventana ===================
  useEffect(() => {
    if (!auditEnabled) { setAuditPumpTs(null); setAuditTankTs(null); return; }
    const locId = auditLoc === "" ? undefined : Number(auditLoc);
    if (!locId) { setAuditPumpTs(null); setAuditTankTs(null); return; }

    const fromMs = startOfMin(useXDomain[0]);
    const toMs   = startOfMin(useXDomain[1]);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) return;

    const pumpIds =
      selectedAuditPumpIds === "all"
        ? auditPumpOptions.map(p => p.pump_id)
        : (selectedAuditPumpIds as number[]);
    const tankIds =
      selectedAuditTankIds === "all"
        ? auditTankOptions.map(t => t.tank_id)
        : (selectedAuditTankIds as number[]);

    let cancelled = false;
    setLoadingAudit(true);
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
        setAuditPumpTs({ timestamps: pumps.timestamps, is_on: pumps.is_on });
        setAuditTankTs({ timestamps: tanks.timestamps, level_percent: tanks.level_percent });
      } catch (e) {
        if (!cancelled) { setAuditPumpTs(null); setAuditTankTs(null); }
        console.error("[audit] series error:", e);
      } finally {
        if (!cancelled) setLoadingAudit(false);
      }
    })();

    return () => { cancelled = true; };
  }, [
    auditEnabled,
    auditLoc,
    selectedAuditPumpIds,
    selectedAuditTankIds,
    auditPumpOptions,
    auditTankOptions,
    useXDomain[0],
    useXDomain[1],
  ]);

  return (
    <div className="p-6 space-y-6">
      {/* Fila filtros */}
      <div className="flex flex-wrap gap-4 items-center">
        {/* Ubicación BASE */}
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

        {/* Playback 24h (hasta 7 días) → visible SOLO si NO está abierta la Auditoría */}
        {!auditEnabled && (
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
                  Playback 24 h (7 días → ahora)
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
                min={MIN_OFFSET_MIN}
                max={MAX_OFFSET_MIN}
                step={1}
                disabled={!playEnabled}
                value={playFinMin}
                onChange={(e)=> setPlayFinMin(Number(e.target.value))}
                onMouseDown={()=> setDragging(true)}
                onMouseUp={()=> setDragging(false)}
                onTouchStart={()=> setDragging(true)}
                onTouchEnd={()=> setDragging(false)}
                className="w-full"
                title="Fin de la ventana (minutos desde el inicio base de 7 días)"
              />
            </div>

            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-gray-500">Inicio: <b>{startLabel}</b></span>
              <span className="text-gray-500">Fin: <b>{endLabel}</b></span>
            </div>
          </div>
        )}
      </div>

      {/* Selectores por localidad (BASE) */}
      {loc !== "all" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Bombas BASE */}
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

          {/* Tanques BASE */}
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

          {/* ===== Controles de AUDITORÍA ===== */}
          <section className="rounded-xl border p-3 space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={auditEnabled}
                onChange={(e) => setAuditEnabled(e.target.checked)}
              />
              <span className="text-sm">Auditar (comparar con otra ubicación)</span>
              {loadingAudit && <span className="text-xs text-gray-500 ml-2">cargando…</span>}
            </label>

            {auditEnabled && (
              <>
                {/* Playback dentro de Auditoría (mismo estado global) */}
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
                        Playback 24 h (7 días → ahora)
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
                      min={MIN_OFFSET_MIN}
                      max={MAX_OFFSET_MIN}
                      step={1}
                      disabled={!playEnabled}
                      value={playFinMin}
                      onChange={(e)=> setPlayFinMin(Number(e.target.value))}
                      onMouseDown={()=> setDragging(true)}
                      onMouseUp={()=> setDragging(false)}
                      onTouchStart={()=> setDragging(true)}
                      onTouchEnd={()=> setDragging(false)}
                      className="w-full"
                      title="Fin de la ventana (minutos desde el inicio base de 7 días)"
                    />
                  </div>

                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-gray-500">Inicio: <b>{startLabel}</b></span>
                    <span className="text-gray-500">Fin: <b>{endLabel}</b></span>
                  </div>
                </div>

                {/* Ubicación y selectores de Auditoría (formato igual al BASE) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Tanques AUDITORÍA */}
                  <Card className="rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-500">Auditoría – Localidad y Tanques</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div>
                        <div className="text-xs mb-1">Ubicación (auditoría)</div>
                        <select
                          className="w-full border rounded-md p-2 text-sm"
                          value={auditLoc === "" ? "" : String(auditLoc)}
                          onChange={(e) => setAuditLoc(e.target.value === "" ? "" : Number(e.target.value))}
                        >
                          <option value="">Elegí</option>
                          {locOptionsAll.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedAuditTankIds === "all"}
                            onChange={(e) => setSelectedAuditTankIds(e.target.checked ? "all" : [])}
                            disabled={!auditLoc}
                          />
                          <span className="text-sm">Todos (promedio)</span>
                        </label>
                      </div>

                      <div className="flex flex-wrap gap-2 max-h-40 overflow-auto">
                        {auditTankOptions.map((t) => {
                          const checked = selectedAuditTankIds === "all" ? false : (selectedAuditTankIds as number[]).includes(t.tank_id);
                          return (
                            <label key={t.tank_id}
                              className={`px-2 py-1 border rounded-lg text-sm cursor-pointer ${checked ? "bg-black text-white" : "bg-white hover:bg-gray-50"}`}>
                              <input
                                type="checkbox"
                                className="mr-2"
                                checked={checked}
                                disabled={selectedAuditTankIds === "all"}
                                onChange={(e) => {
                                  if (selectedAuditTankIds === "all") return;
                                  const arr = new Set(selectedAuditTankIds as number[]);
                                  if (e.target.checked) arr.add(t.tank_id); else arr.delete(t.tank_id);
                                  setSelectedAuditTankIds(Array.from(arr));
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

                  {/* Bombas AUDITORÍA */}
                  <Card className="rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-500">Auditoría – Bombas (selección)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedAuditPumpIds === "all"}
                            onChange={(e) => setSelectedAuditPumpIds(e.target.checked ? "all" : [])}
                            disabled={!auditLoc}
                          />
                          <span className="text-sm">Todas</span>
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2 max-h-40 overflow-auto">
                        {auditPumpOptions.map((p) => {
                          const checked = selectedAuditPumpIds === "all" ? false : (selectedAuditPumpIds as number[]).includes(p.pump_id);
                          return (
                            <label key={p.pump_id}
                              className={`px-2 py-1 border rounded-lg text-sm cursor-pointer ${checked ? "bg-black text-white" : "bg-white hover:bg-gray-50"}`}>
                              <input
                                type="checkbox"
                                className="mr-2"
                                checked={checked}
                                disabled={selectedAuditPumpIds === "all"}
                                onChange={(e) => {
                                  if (selectedAuditPumpIds === "all") return;
                                  const arr = new Set(selectedAuditPumpIds as number[]);
                                  if (e.target.checked) arr.add(p.pump_id); else arr.delete(p.pump_id);
                                  setSelectedAuditPumpIds(Array.from(arr));
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
                </div>
              </>
            )}
          </section>

          {/* Gráficos BASE */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TankLevelChart
              ts={useTank}
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
              pumpsTs={usePump}
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

          {/* Gráficos AUDITORÍA (dos charts adicionales) */}
          {auditEnabled && auditLoc !== "" && (
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TankLevelChart
                ts={auditTankTs ?? { timestamps: [], level_percent: [] }}
                syncId="op-sync"
                title="Nivel del tanque – Auditoría"
                tz={TZ}
                xDomain={useXDomain}
                xTicks={xTicksDisplay}
                hoverX={hoverX}
                onHoverX={setHoverXRaf}
              />
              <OpsPumpsProfile
                pumpsTs={auditPumpTs ?? { timestamps: [], is_on: [] }}
                max={auditPumpsCap}
                syncId="op-sync"
                title="Bombas ON – Auditoría"
                tz={TZ}
                xDomain={useXDomain}
                xTicks={xTicksDisplay}
                hoverX={hoverX}
                onHoverX={setHoverXRaf}
              />
            </section>
          )}
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
