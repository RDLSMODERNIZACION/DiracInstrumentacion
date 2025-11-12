import React, { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Tooltip, Legend, Cell } from "recharts";
import { fetchEnergyDistribution, EnergyDistribution } from "@/api/energy";

function ym(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 7); // "YYYY-MM"
}

export default function EnergyEfficiencyPage({
  locationId,
  tz = "America/Argentina/Buenos_Aires",
  month: initialMonth,
}: {
  locationId?: number;
  tz?: string;
  month?: string; // "YYYY-MM"; default: actual
}) {
  const [month, setMonth] = useState<string>(initialMonth ?? ym());
  const [data, setData] = useState<EnergyDistribution | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const res = await fetchEnergyDistribution({ month, locationId, tz });
      if (!alive) return;
      setData(res);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [month, locationId, tz]);

  const total = data?.total_kwh ?? 0;
  const chartData = useMemo(
    () =>
      (data?.buckets ?? []).map((b) => ({
        name: b.label,
        value: b.kwh,
        key: b.key,
      })),
    [data]
  );

  // Colores suaves; podés cambiarlos o dejarlos por defecto.
  const COLORS = ["#7dd3fc", "#86efac", "#fca5a5", "#fde68a", "#c4b5fd", "#93c5fd"];

  return (
    <div className="space-y-3">
      {/* Selector de mes (simple y sin más UI) */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600">Mes:</label>
        <input
          type="month"
          className="border rounded-lg px-2 py-1 text-sm"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        {loading && <span className="text-xs text-gray-500">cargando…</span>}
      </div>

      {/* Gráfico de torta */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="45%"
              outerRadius="75%"
              isAnimationActive={false}
              label={({ name, percent }) => `${name} ${Math.round((percent || 0) * 100)}%`}
            >
              {chartData.map((entry, idx) => (
                <Cell key={entry.key} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)} kWh`, "Energía"]} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Total simple */}
      <div className="text-sm text-gray-600">
        Total {month}: <b>{total.toFixed(1)} kWh</b>
        {locationId ? <> • Ubicación ID: {locationId}</> : null}
      </div>

      {/* Mensaje cuando no hay datos */}
      {!loading && chartData.length === 0 && (
        <div className="text-sm text-gray-500">No hay datos para el mes seleccionado.</div>
      )}
    </div>
  );
}
