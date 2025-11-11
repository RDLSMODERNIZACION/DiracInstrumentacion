// src/widget.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./components/ui/card";
import { KPI } from "./components/KPI";
import TankLevelChart from "./components/TankLevelChart";
import PumpsOnChart from "./components/PumpsOnChart";
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

  return (
    <div className="p-6 space-y-6">
      {/* Filtro: solo Ubicación (rango y botón de log fueron removidos) */}
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

          {/* Gráficos principales (sincronizados por tiempo real; eje X en horas) */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TankLevelChart
              ts={liveSync.tankTs}
              syncId="op-sync"
              title="Nivel del tanque (24h • en vivo)"
            />
            <PumpsOnChart
              pumpsTs={liveSync.pumpTs}
              max={totalPumpsCap}
              syncId="op-sync"
              title="Bombas encendidas (24h • en vivo)"
              variant="bar"
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
