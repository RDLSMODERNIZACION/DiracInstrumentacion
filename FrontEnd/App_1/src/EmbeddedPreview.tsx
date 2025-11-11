// src/embedded
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Componentes
import KPI from "./components/KPI";
import TankLevelChart from "./components/TankLevelChart";
// ⬇️ Usamos el perfil horario “estilo eficiencia” para Operación
import OpsPumpsProfile from "./components/OpsPumpsProfile";
import EnergyEfficiencyPage from "./components/EnergyEfficiencyPage";
import ByLocationTable from "./components/ByLocationTable";

// Helpers de formato
const k = (n: number) => n.toLocaleString("es-AR");
const pct = (n: number) => `${n.toFixed(1)}%`;

// Tipos de las series agregadas que entrega loadDashboard
type TankAgg =
  | { timestamps?: Array<number | string>; level_percent?: Array<number | string | null> }
  | null
  | undefined;

type PumpAgg =
  | { timestamps?: Array<number | string>; is_on?: Array<number | boolean | string | null> }
  | null
  | undefined;

// Si NO usás shadcn Tabs y tenías un Tabs propio con props { value, onChange, tabs }:
type SimpleTab = { id: string; label: string };
function SimpleTabs({
  value,
  onChange,
  tabs,
}: {
  value: string;
  onChange: (v: string) => void;
  tabs: SimpleTab[];
}) {
  return (
    <div className="flex gap-2 border-b mb-3">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`px-3 py-2 text-sm rounded-t-lg ${
            value === t.id ? "bg-white border border-b-transparent" : "text-gray-500"
          }`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function DashboardView({
  locations,
  filtered,
  tankTs,
  pumpTs,
  defaultPumpId,
  MOCK_DATA,
}: {
  locations: Array<{ location_id: string | number; location_name: string; location_code: string }>;
  filtered: any;
  tankTs: TankAgg;
  pumpTs: PumpAgg;
  defaultPumpId: string | number;
  MOCK_DATA: any;
}) {
  const [tab, setTab] = useState<string>("operacion");
  const [locationId, setLocationId] = useState<string | number>(locations?.[0]?.location_id ?? "");

  return (
    <div className="space-y-6">
      {/* Filtros superiores */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-gray-500">Ubicación:</label>
        <select
          className="border rounded-lg px-3 py-2"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
        >
          {locations?.map((l) => (
            <option key={l.location_id} value={l.location_id}>
              {l.location_name} ({l.location_code})
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <SimpleTabs
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

      {/* Operación */}
      {tab === "operacion" && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPI label="Activos" value={k(MOCK_DATA.kpis.assets_total)} />
            <KPI label="Tanques" value={k(MOCK_DATA.kpis.tanks)} />
            <KPI label="Bombas" value={k(MOCK_DATA.kpis.pumps)} />
            <KPI label="Valv." value={k(MOCK_DATA.kpis.valves)} />
            <KPI label="Alarmas activas" value={k(MOCK_DATA.kpis.alarms_active)} />
            <KPI label="Nivel prom. (30d)" value={pct(MOCK_DATA.kpis.avg_level_pct_30d)} />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Charts sincronizados por valor temporal; eje X en horas */}
            <TankLevelChart ts={tankTs} syncId="op-sync" title="Nivel del tanque (24h)" />
            {/* Reemplazamos barras por perfil horario estilo eficiencia */}
            <OpsPumpsProfile pumpsTs={pumpTs} syncId="op-sync" title="Perfil horario (24h)" />
          </section>
        </>
      )}

      {/* Eficiencia */}
      {tab === "eficiencia" && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Izquierda: perfiles/horas por franja + tarjetas */}
          <EnergyEfficiencyPage pumpAgg={pumpTs} />

          {/* Derecha: notas */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">Notas</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
                <li>
                  Bandas horarias EPEN por defecto: <b>VALLE</b> 00–07 h, <b>PICO</b> 18–23 h, <b>RESTO</b> el resto.
                </li>
                <li>Las tarjetas muestran horas-bomba y porcentaje por franja (24 h).</li>
                <li>El filtro por localidad arriba recarga los datos y esta vista se actualiza sola.</li>
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Resumen por ubicación */}
      <section>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Resumen por ubicación</CardTitle>
          </CardHeader>
          <CardContent>
            <ByLocationTable rows={filtered.byLocation} />
          </CardContent>
        </Card>
      </section>

      {/* Alarmas (mock) */}
      <section>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Alarmas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {MOCK_DATA.alarms.map((a: any) => (
                <div
                  key={a.id}
                  className={`flex items-center justify-between p-3 rounded-xl border ${
                    a.is_active ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <div className="text-sm">
                    <div className="font-medium">{a.message}</div>
                    <div className="text-gray-500">
                      {a.asset_type.toUpperCase()} #{a.asset_id} • {new Date(a.ts_raised).toLocaleString("es-AR")}
                    </div>
                  </div>
                  <div
                    className={`text-xs px-2 py-1 rounded-full ${
                      a.severity === "critical" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {a.severity}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
