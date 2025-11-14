// src/components/EnergyEfficiencyPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Tooltip, Legend, Cell } from "recharts";
import { fetchEnergyRuntime, EnergyRuntime } from "@/api/energy";

function ym(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 7); // "YYYY-MM"
}

// Colores para las bandas
const COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#6366f1", "#14b8a6"];

type Props = {
  locationId?: number;
  tz?: string;
  month?: string;
  bandSetId?: number;
  companyId?: number;
};

export default function EnergyEfficiencyPage({
  locationId,
  tz = "America/Argentina/Buenos_Aires",
  month: initialMonth,
  bandSetId,
  companyId,
}: Props) {
  const [month, setMonth] = useState(initialMonth || ym());
  const [runtime, setRuntime] = useState<EnergyRuntime | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar datos cuando cambian filtros
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchEnergyRuntime({
          month,
          locationId,
          tz,
          bandSetId,
          companyId,
        });
        if (cancelled) return;
        setRuntime(data);
      } catch (e: any) {
        console.error("[EnergyEfficiencyPage] load error:", e);
        if (!cancelled) setError("No se pudieron cargar los datos de energía.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [month, locationId, tz, bandSetId, companyId]);

  const totalH = runtime?.total_hours ?? 0;

  const chartData = useMemo(
    () =>
      (runtime?.buckets ?? [])
        .filter((b) => (b.hours ?? 0) > 0)
        .map((b) => ({
          name: b.label || b.key,
          value: b.hours,
        })),
    [runtime]
  );

  const handleMonthChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
    setMonth(ev.target.value);
  };

  return (
    <div className="space-y-3">
      {/* Encabezado + filtros */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-gray-700">
            Distribución horaria de operación (energía)
          </div>
          <div className="text-xs text-gray-500">
            Horas ON de bombas por banda horaria en el mes.
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center text-xs">
          <label className="flex items-center gap-1">
            <span className="text-gray-500">Mes:</span>
            <input
              type="month"
              value={month}
              onChange={handleMonthChange}
              className="border rounded-md px-2 py-1 text-xs"
            />
          </label>
          {locationId && (
            <span className="text-gray-500">
              Ubicación ID: <b>{locationId}</b>
            </span>
          )}
        </div>
      </div>

      {/* Contenido principal */}
      <div className="h-64 flex items-center justify-center border rounded-2xl bg-white">
        {loading ? (
          <div className="text-sm text-gray-500">Cargando datos…</div>
        ) : error ? (
          <div className="text-sm text-red-500">{error}</div>
        ) : chartData.length === 0 ? (
          <div className="text-sm text-gray-500">
            No hay datos para el mes seleccionado.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius="45%"
                outerRadius="70%"
                paddingAngle={2}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                    strokeWidth={1}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any) =>
                  `${Number(value).toFixed(1)} h`
                }
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Pie de página con totales */}
      <div className="text-sm text-gray-600">
        Total {month}: <b>{totalH.toFixed(1)} h</b>
        {locationId ? <> • Ubicación ID: {locationId}</> : null}
      </div>
    </div>
  );
}
