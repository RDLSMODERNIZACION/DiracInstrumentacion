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
import ProcesoCalidad from "./components/ProcesoCalidad";

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
    <div className="mb-3 flex gap-2 border-b">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`rounded-t-lg px-3 py-2 text-sm ${
            value === t.id ? "border border-b-transparent bg-white" : "text-gray-500"
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
          className="rounded-lg border px-3 py-2"
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
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <KPI label="Activos" value={k(MOCK_DATA.kpis.assets_total)} />
            <KPI label="Tanques" value={k(MOCK_DATA.kpis.tanks)} />
            <KPI label="Bombas" value={k(MOCK_DATA.kpis.pumps)} />
            <KPI label="Valv." value={k(MOCK_DATA.kpis.valves)} />
            <KPI label="Alarmas activas" value={k(MOCK_DATA.kpis.alarms_active)} />
            <KPI label="Nivel prom. (30d)" value={pct(MOCK_DATA.kpis.avg_level_pct_30d)} />
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TankLevelChart ts={tankTs} syncId="op-sync" title="Nivel del tanque (24h)" />
            <OpsPumpsProfile pumpsTs={pumpTs} syncId="op-sync" title="Perfil horario (24h)" />
          </section>
        </>
      )}

      {/* Eficiencia */}
      {tab === "eficiencia" && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <EnergyEfficiencyPage pumpAgg={pumpTs} />

          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">Notas</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
                <li>
                  Bandas horarias EPEN por defecto: <b>VALLE</b> 00–07 h, <b>PICO</b> 18–23 h,{" "}
                  <b>RESTO</b> el resto.
                </li>
                <li>Las tarjetas muestran horas-bomba y porcentaje por franja (24 h).</li>
                <li>El filtro por localidad arriba recarga los datos y esta vista se actualiza sola.</li>
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Operación y confiabilidad */}
      {tab === "confiabilidad" && (
        <section>
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Operación y confiabilidad</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-gray-600">
                Acá podés conectar después el mockup o módulo real de operación y confiabilidad.
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Proceso y calidad del agua */}
      {tab === "calidad" && (
        <section>
          <ProcesoCalidad />
        </section>
      )}

      {/* Gestión global */}
      {tab === "gestion" && (
        <section>
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Gestión global</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-gray-600">
                Espacio reservado para indicadores globales, seguimiento y administración.
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Resumen por ubicación */}
      <section>
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
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
                  className={`flex items-center justify-between rounded-xl border p-3 ${
                    a.is_active ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="text-sm">
                    <div className="font-medium">{a.message}</div>
                    <div className="text-gray-500">
                      {a.asset_type.toUpperCase()} #{a.asset_id} •{" "}
                      {new Date(a.ts_raised).toLocaleString("es-AR")}
                    </div>
                  </div>
                  <div
                    className={`rounded-full px-2 py-1 text-xs ${
                      a.severity === "critical"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
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