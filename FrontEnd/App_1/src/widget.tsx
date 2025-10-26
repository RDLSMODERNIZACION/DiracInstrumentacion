// src/widget.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "./components/ui/button";
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

type LocOpt = { id: number; name: string };

export default function KpiWidget() {
  const [live, setLive] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("operacion");

  // filtro de ubicación (id numérico o "all")
  const [loc, setLoc] = useState<number | "all">("all");

  // catálogo global y estable de ubicaciones (para que el select no se achique)
  const [locOptionsAll, setLocOptionsAll] = useState<LocOpt[]>([]);

  // ==== carga de datos según loc ====
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

        // si estamos en "all", inicializamos el catálogo global con TODO lo que venga
        // si NO estamos en "all", unimos lo nuevo con lo que ya teníamos (por si el backend solo devuelve una)
        setLocOptionsAll(prev => mergeLocOptions(prev, optsNow));
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [loc]);

  const byLocation = live?.byLocation || [];
  const pumpAgg = live?.pumpTs || null;
  const tankAgg = live?.tankTs || null;

  // Si cambian las opciones globales y el valor actual no está, reseteamos a "all"
  useEffect(() => {
    if (loc === "all") return;
    const exists = locOptionsAll.some(o => o.id === loc);
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
    let tanks = 0, pumps = 0;
    for (const r of (Array.isArray(byLocationFiltered) ? byLocationFiltered : [])) {
      tanks += Number(r?.tanks_count ?? 0);
      pumps += Number(r?.pumps_count ?? 0);
    }
    return { tanks, pumps };
  }, [byLocationFiltered]);

  // Nombre legible de la ubicación actual
  const currentLocName = useMemo(() => {
    if (loc === "all") return "Todas";
    const found = locOptionsAll.find(o => o.id === loc);
    return found ? found.name : `Loc #${loc}`;
  }, [loc, locOptionsAll]);

  return (
    <div className="p-6 space-y-6">
      

      <div className="flex gap-2 items-center">
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
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <Button className="ml-2" onClick={() => console.log("[LIVE]", live)}>
          Loggear DATA
        </Button>
      </div>

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

      {tab === "operacion" && (
        <>
          {/* Summary: solo Tanques y Bombas */}
          <section className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-3">
            <KPI label="Tanques" value={k(kpis.tanks)} />
            <KPI label="Bombas" value={k(kpis.pumps)} />
          </section>

          {/* Gráficos principales */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TankLevelChart ts={tankAgg} />
            <PumpsOnChart pumpsTs={pumpAgg} />
          </section>
        </>
      )}

      {/* Eficiencia */}
      {tab === "eficiencia" && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <EnergyEfficiencyPage pumpAgg={pumpAgg} debug />
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">Notas</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
                <li>Bandas EPEN por defecto: <b>VALLE</b> 00–07 h, <b>PICO</b> 19–23 h (incluye 23), <b>RESTO</b> el resto.</li>
                <li>Las tarjetas muestran horas-bomba y % por franja (24 h).</li>
                <li>El selector de ubicación arriba recarga los datos y esta vista se actualiza sola.</li>
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Confiabilidad */}
      {tab === "confiabilidad" && (
        <ReliabilityPage locationId={loc === "all" ? "all" : Number(loc)} thresholdLow={90} />
      )}

      {/* Resumen por ubicación (filtrado por loc) */}
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
  // 1) Intento con live.locations (si trae id + name/code)
  const fromLive = (Array.isArray(liveLocations) ? liveLocations : [])
    .map((l: any) => {
      const id = Number.isFinite(Number(l?.id)) ? Number(l.id) : null;
      const name = (l?.name ?? l?.code ?? "").toString().trim();
      return id && name ? { id, name } : null;
    })
    .filter(Boolean) as LocOpt[];

  if (fromLive.length > 0) {
    return sortByName(uniqueById(fromLive));
  }

  // 2) Fallback con byLocation (location_id + location_name)
  const seen = new Map<number, string>();
  for (const r of (Array.isArray(byLocation) ? byLocation : [])) {
    const id = Number.isFinite(Number(r?.location_id)) ? Number(r.location_id) : null;
    const name = (r?.location_name ?? "").toString().trim();
    if (id && name && !seen.has(id)) seen.set(id, name);
  }
  const fromBL = Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  return sortByName(fromBL);
}

function mergeLocOptions(prev: LocOpt[], next: LocOpt[]): LocOpt[] {
  // Une y deja únicos por id; si hay duplicado, prioriza el que tenga `name` más largo (mejor label)
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
  arr.forEach(o => { if (!m.has(o.id)) m.set(o.id, o.name); });
  return Array.from(m, ([id, name]) => ({ id, name }));
}
function sortByName(arr: LocOpt[]): LocOpt[] {
  return [...arr].sort((a, b) => a.name.localeCompare(b.name));
}
