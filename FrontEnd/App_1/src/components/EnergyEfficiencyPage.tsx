import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";

/** Serie agregada que arma loadDashboard: conteo de bombas con lectura por hora */
type AggTimeseries = { timestamps?: string[]; is_on?: number[] };

/** Horarios EPEN por defecto: Valle 00–07, Pico 19–23 (incluye 23), Resto el resto */
type TouSchedule = {
  valle: { start: number; end: number }; // [start, end) local
  pico:  { start: number; end: number }; // [start, end)
};

// Por defecto incluyo 23h en Pico usando end=24
const EPEN_DEFAULT: TouSchedule = {
  valle: { start: 0, end: 7 },   // 00:00 inclusive — 07:00 exclusive
  pico:  { start: 19, end: 24 }, // 19:00 inclusive — 24:00 exclusive
};

function hourFromLocalIso(s?: string): number | null {
  if (!s) return null;
  const hh = s.slice(11, 13);
  const n = Number(hh);
  return Number.isFinite(n) ? n : null;
}

function classifyHour(hh: number, sch: TouSchedule): "valle" | "pico" | "resto" {
  const inRange = (h: number, start: number, end: number) => h >= start && h < end;
  if (inRange(hh, sch.valle.start, sch.valle.end)) return "valle";
  if (inRange(hh, sch.pico.start, sch.pico.end)) return "pico";
  return "resto";
}

function StatCard({ title, hours, pct, color }: { title: string; hours: number; pct: number; color: string }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2 flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
        <CardTitle className="text-sm text-gray-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{hours.toFixed(1)} h</div>
        <div className="text-sm text-gray-500 mt-1">{pct.toFixed(0)}%</div>
      </CardContent>
    </Card>
  );
}

const COLORS: Record<"valle" | "resto" | "pico", string> = {
  valle: "#10B981", // verde
  resto: "#60A5FA", // celeste
  pico:  "#F59E0B", // ámbar
};

export default function EnergyEfficiencyPage({
  pumpAgg,
  schedule = EPEN_DEFAULT,
  debug = false,
}: {
  pumpAgg: AggTimeseries | null | undefined;
  schedule?: TouSchedule;
  debug?: boolean;
}) {
  const ts = pumpAgg?.timestamps ?? [];
  const vals = pumpAgg?.is_on ?? [];
  const valid =
    Array.isArray(ts) &&
    Array.isArray(vals) &&
    ts.length > 0 &&
    vals.length > 0 &&
    ts.length === vals.length;

  const stats = useMemo(() => {
    let valle = 0, pico = 0, resto = 0;
    if (valid) {
      for (let i = 0; i < ts.length; i++) {
        const hh = hourFromLocalIso(ts[i]);
        const count = Number(vals[i] ?? 0);
        if (!Number.isFinite(count) || hh == null) continue;
        const b = classifyHour(hh, schedule);
        if (b === "valle") valle += count;
        else if (b === "pico") pico += count;
        else resto += count;
      }
    }
    const total = valle + pico + resto;
    const pct = (x: number) => (total > 0 ? (x * 100) / total : 0);
    return {
      valle: { hours: valle, pct: pct(valle) },
      resto: { hours: resto, pct: pct(resto) },
      pico:  { hours: pico,  pct: pct(pico)  },
      total,
    };
  }, [valid, ts, vals, schedule]);

  const pieData = useMemo(
    () => [
      { name: "Valle", key: "valle" as const, value: Number(stats.valle.hours.toFixed(3)) },
      { name: "Resto", key: "resto" as const, value: Number(stats.resto.hours.toFixed(3)) },
      { name: "Pico",  key: "pico"  as const, value: Number(stats.pico.hours.toFixed(3))  },
    ],
    [stats]
  );

  if (debug) {
    console.log("[EE-Pie] valid:", valid, "len", ts.length, vals.length, "stats", stats);
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Torta con distribución de horas-bomba (24h) */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-500">Distribución de horas-bomba (24h)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {valid && stats.total > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  isAnimationActive={true}
                  labelLine={false}
                  label={(d: any) => `${d.name} ${((d.value / stats.total) * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.key} fill={COLORS[entry.key]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: any, _n: any, p: any) => {
                    const pct = stats.total > 0 ? ((v as number) * 100) / stats.total : 0;
                    return [`${Number(v).toFixed(1)} h (${pct.toFixed(0)}%)`, p?.payload?.name];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full grid place-items-center text-sm text-gray-500">
              {valid ? "Sin actividad en las últimas 24 h." : "No hay datos suficientes para graficar."}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tarjetas Valle / Resto / Pico */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Valle" hours={stats.valle.hours} pct={stats.valle.pct} color={COLORS.valle} />
        <StatCard title="Resto" hours={stats.resto.hours} pct={stats.resto.pct} color={COLORS.resto} />
        <StatCard title="Pico"  hours={stats.pico.hours}  pct={stats.pico.pct}  color={COLORS.pico} />
      </div>

      {/* Esquema aplicado */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-500">Esquema horario aplicado (EPEN)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-600">
          <div>Valle: {String(schedule.valle.start).padStart(2,"0")}:00–{String(schedule.valle.end).padStart(2,"0")}:00</div>
          <div>Pico: {String(schedule.pico.start).padStart(2,"0")}:00–{String(schedule.pico.end).padStart(2,"0")}:00</div>
          <div>Resto: restantes del día</div>
        </CardContent>
      </Card>
    </div>
  );
}
