// src/widget.tsx
import React, { useEffect, useMemo, useState } from "react";
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

type LocOpt = { id: number; name: string };

export default function KpiWidget() {
  const [live, setLive] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("operacion");

  // Filtro de ubicación (id numérico o "all")
  const [loc, setLoc] = useState<number | "all">("all");

  // Catálogo global y estable de ubicaciones (para que el select no se achique)
  const [locOptionsAll, setLocOptionsAll] = useState<LocOpt[]>([]);

  // ==== carga de datos según loc (para KPIs y tabla) ====
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const data = await loadDashboard(loc);
        if (!mounted) return;
        setLive(data);

        // construir opciones de la respuesta actual
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

  // Series agregadas (histórico/placeholder) que vienen de loadDashboard (para otras pestañas)
  const byLocation = live?.byLocation || [];

  // === LIVE 24h (fijo) ===
  const locId = loc === "all" ? undefined : Number(loc);
  const liveSync = useLiveOps({ locationId: locId });

  // Si cambian las opciones globales y el valor actual no está, reseteamos a "all"
  useEffect(() => {
    if (loc === "all") return;
    const exists = locOptionsAll.some((o) => o.id === loc);
    if (!exists) setLoc("all");
  }, [locOptionsAll]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtrado de filas para la tabla por location_id
  const byLocationFiltered = useMemo(() => {
    if (loc === "all") return byLocation;
    return (Array.isArray(byLocation) ? byLocation : []).filter(
      (r: any) => Number(r?.location_id) === loc
    );
  }, [byLocation, loc]);

  // KPIs (tanks/pumps) en base al filtro actual
  const kpis = useMemo(() => {
    let tanks = 0,
      pumps = 0;
    for (const r of Array.isArray(byLocationFiltered) ? byLocationFiltered : []) {
      tanks += Number(r?.tanks_count ?? 0);
      pumps += Number(r?.pumps_count ?? 0);
    }
    return { tanks, pumps };
  }, [byLocationFiltered]);

  // Capacidad total de bombas (para eje Y del gráfico y para eficiencia)
  const totalPumpsCap = useMemo(
    () => liveSync.pumpsTotal || kpis.pumps || undefined,
    [liveSync.pumpsTotal, kpis]
  );

  // ===== Sincronización de ejes y crosshair =====
  const tz = "America/Argentina/Buenos_Aires";
  const [hoverX, setHoverX] = useState<number | null>(null);

  const { xDomain, xTicks } = useMemo(() => {
    // Elegimos el "end" como el último timestamp presente (tanques o bombas).
    const tankArr = (liveSync.tankTs?.timestamps ?? []) as Array<number | string>;
    const pumpArr = (liveSync.pumpTs?.timestamps ?? []) as Array<number | string>;

    const maxMs = (arr: Array<number | string>) => {
      let m = -Infinity;
      for (const t of arr) {
        const ms = toMs(t as any);
        if (Number.isFinite(ms) && ms > m) m = ms;
      }
      return Number.isFinite(m) ? (m as number) : undefined;
    };

    const lastTank = maxMs(tankArr);
    const lastPump = maxMs(pumpArr);
    const endRaw = lastTank ?? lastPump ?? Date.now();

    const end = startOfMin(endRaw);
    const start = end - 24 * 60 * 60 * 1000;

    // Ticks cada hora, alineados a HH:00
    const H = 60 * 60 * 1000;
    const firstHour = ceilToHour(start);
    const ticks: number[] = [];
    for (let t = firstHour; t <= end; t += H) ticks.push(t);

    return { xDomain: [start, end] as [number, number], xTicks: ticks };
  }, [liveSync.tankTs?.timestamps, liveSync.pumpTs?.timestamps]);

  return (
    <div className="p-6 space-y-6">
      {/* Filtro: solo Ubicación */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Ubicación:</span>
          <select
            className="border rounded-xl p-2 text-sm"
            value={loc === "all" ? "all" : String(loc)}
            onChange={(e) => {
              const v = e.target.value;
              setLoc(v === "all" ? "all" : Number(v));
            }}
          >
            <option value="all">Todas</option>
            {locOptionsAll.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs principales */}
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
          {/* Summary: solo Tanques y Bombas */}
          <section className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-3">
            <KPI label="Tanques" value={k(kpis.tanks)} />
            <KPI label="Bombas" value={k(kpis.pumps)} />
          </section>

          {/* Gráficos principales (sincronizados por tiempo; eje X compartido y crosshair compartido) */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TankLevelChart
              ts={liveSync.tankTs}
              syncId="op-sync"
              title="Nivel del tanque (24h • en vivo)"
              tz={tz}
              xDomain={xDomain}
              xTicks={xTicks}
              hoverX={hoverX}
              onHoverX={setHoverX}
            />
            <OpsPumpsProfile
              pumpsTs={liveSync.pumpTs}
              max={totalPumpsCap}
              syncId="op-sync"
              title="Perfil horario (24h)"
              tz={tz}
              xDomain={xDomain}
              xTicks={xTicks}
              hoverX={hoverX}
              onHoverX={setHoverX}
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
        <ReliabilityPage
          locationId={loc === "all" ? "all" : Number(loc)}
          thresholdLow={90}
        />
      )}

      {/* ====== Resumen por ubicación (filtrado por loc) ====== */}
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
  arr.forEach((o) => {
    if (!m.has(o.id)) m.set(o.id, o.name);
  });
  return Array.from(m, ([id, name]) => ({ id, name }));
}
function sortByName(arr: LocOpt[]): LocOpt[] {
  return [...arr].sort((a, b) => a.name.localeCompare(b.name));
}

/** ===== helpers de tiempo para sincronización ===== */
function toMs(x: number | string): number {
  if (typeof x === "number") return x > 10_000 ? x : x * 1000; // si vino en seg, lo paso a ms
  const n = Number(x);
  if (Number.isFinite(n) && n > 10_000) return n;
  return new Date(x).getTime();
}
function startOfMin(ms: number) {
  const d = new Date(ms);
  d.setSeconds(0, 0);
  return d.getTime();
}
function ceilToHour(ms: number) {
  const H = 60 * 60 * 1000;
  return Math.ceil(ms / H) * H;
}
