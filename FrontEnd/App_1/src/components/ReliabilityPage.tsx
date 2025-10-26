// src/components/ReliabilityPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  fetchUptime30dByLocation,
  fetchUptime30dByPump,
  fetchActiveAlarms,
} from "@/api/kpi";

type UptimeLocRow = {
  location_id: number;
  location_name?: string | null;
  uptime_pct_30d?: number | null;
  uptime_pct?: number | null;
};

type PumpUptimeRow = {
  location_id?: number | null;
  location_name?: string | null;
  pump_id?: number | null;
  pump_name?: string | null;
  uptime_pct_30d?: number | null;
  uptime_pct?: number | null;
};

type AlarmsBySevRow = {
  location_id?: number | null;
  location_name?: string | null;
  severity: string;
  count: number;
};

function safeUptime(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export default function ReliabilityPage({
  locationId = "all",
  thresholdLow = 90, // umbral de uptime "bajo" para KPI
}: {
  locationId?: number | "all";
  thresholdLow?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [locRows, setLocRows] = useState<UptimeLocRow[]>([]);
  const [pumpRows, setPumpRows] = useState<PumpUptimeRow[]>([]);
  const [alarmRows, setAlarmRows] = useState<AlarmsBySevRow[]>([]);

  async function load() {
    try {
      setLoading(true);
      setErr(null);
      const [loc, pump, alarms] = await Promise.all([
        fetchUptime30dByLocation({ location_id: locationId }),
        fetchUptime30dByPump({ location_id: locationId } as any), // la firma en api puede no tener tipo, lo toleramos
        fetchActiveAlarms({ location_id: locationId }),
      ]);
      setLocRows(Array.isArray(loc) ? loc : []);
      setPumpRows(Array.isArray(pump) ? pump : []);
      setAlarmRows(Array.isArray(alarms) ? alarms : []);
    } catch (e: any) {
      setErr(e?.message || "Error al cargar datos de confiabilidad");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  const { kpis, worstPumps, locTable } = useMemo(() => {
    const locTable = (locRows || []).map((r) => ({
      location_id: r.location_id,
      location_name: r.location_name || `Loc ${r.location_id}`,
      uptime: safeUptime(r.uptime_pct_30d ?? r.uptime_pct),
    }));

    const avgUptime =
      locTable.length > 0
        ? locTable.reduce((a, r) => a + r.uptime, 0) / locTable.length
        : 0;

    const worstPumps = (pumpRows || [])
      .map((r) => ({
        name: (r.pump_name || "—") + (r.location_name ? ` (${r.location_name})` : ""),
        uptime: safeUptime(r.uptime_pct_30d ?? r.uptime_pct),
      }))
      .sort((a, b) => a.uptime - b.uptime)
      .slice(0, 10);

    const lowCount = (pumpRows || []).reduce((acc, r) => {
      const u = safeUptime(r.uptime_pct_30d ?? r.uptime_pct);
      return acc + (u > 0 && u < thresholdLow ? 1 : 0);
    }, 0);

    const alarmsTotal = (alarmRows || []).reduce((acc, r) => acc + Number(r?.count ?? 0), 0);

    return {
      kpis: {
        avgUptime,
        lowCount,
        alarmsTotal,
      },
      worstPumps,
      locTable,
    };
  }, [locRows, pumpRows, alarmRows, thresholdLow]);

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Estado */}
      {loading && <div className="text-sm text-gray-500">Cargando…</div>}
      {err && <div className="text-sm text-red-600">{err}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Disponibilidad prom. (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{kpis.avgUptime.toFixed(1)}%</div>
            <div className="text-sm text-gray-500 mt-1">
              Promedio ponderado por localidad.
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Bombas bajo umbral</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{kpis.lowCount}</div>
            <div className="text-sm text-gray-500 mt-1">
              Uptime &lt; {thresholdLow}% (30d).
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Alarmas activas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{kpis.alarmsTotal}</div>
            <div className="text-sm text-gray-500 mt-1">
              Suma por severidad.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Uptime por localidad */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Disponibilidad por localidad (30 días)</CardTitle>
        </CardHeader>
        <CardContent>
          {locTable.length === 0 ? (
            <div className="text-sm text-gray-500">Sin datos.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-left">Localidad</th>
                    <th className="p-3 text-right">Uptime 30d (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {locTable.map((r) => (
                    <tr key={r.location_id} className="border-t">
                      <td className="p-3">{r.location_name}</td>
                      <td className="p-3 text-right">{r.uptime.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top bombas con menor uptime */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top bombas con menor uptime (30 días)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {worstPumps.length === 0 ? (
            <div className="h-full grid place-items-center text-sm text-gray-500">Sin datos.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={worstPumps}
                layout="vertical"
                margin={{ top: 10, right: 20, bottom: 10, left: 80 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis type="category" dataKey="name" width={180} />
                <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "Uptime"]} />
                <Bar dataKey="uptime" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
