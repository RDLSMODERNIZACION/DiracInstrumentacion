import React, { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Tooltip, Legend, Cell } from "recharts";
import { fetchEnergyRuntime, EnergyRuntime } from "@/api/energy";

function ym(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 7); // "YYYY-MM"
}

export default function EnergyEfficiencyPage({
  locationId,
  tz = "America/Argentina/Buenos_Aires",
  month: initialMonth,
  bandSetId,
}: {
  locationId?: number;
  tz?: string;
  month?: string;              // "YYYY-MM"
  bandSetId?: number;          // opcional
}) {
  const [month, setMonth] = useState<string>(initialMonth ?? ym());
  const [data, setData] = useState<EnergyRuntime | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const res = await fetchEnergyRuntime({ month, locationId, tz, bandSetId });
      if (!alive) return;
      setData(res);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [month, locationId, tz, bandSetId]);

  const totalH = data?.total_hours ?? 0;
  const chartData = useMemo(
    () => (data?.buckets ?? []).map((b) => ({ name: b.label, value: b.hours, key: b.key })),
    [data]
  );

  const COLORS = ["#7dd3fc", "#86efac", "#fca5a5", "#fde68a", "#c4b5fd", "#93c5fd"];

  return (
    <div className="space-y-3">
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
            <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)} h`, "Horas ON"]} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="text-sm text-gray-600">
        Total {month}: <b>{totalH.toFixed(1)} h</b>
        {locationId ? <> • Ubicación ID: {locationId}</> : null}
      </div>

      {!loading && chartData.length === 0 && (
        <div className="text-sm text-gray-500">No hay datos para el mes seleccionado.</div>
      )}
    </div>
  );
}
