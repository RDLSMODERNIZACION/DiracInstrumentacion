// src/components/EnergyEfficiencyPage.tsx
import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Brush,
  BarChart,
  Bar,
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

const COLORS: Record<"valle" | "resto" | "pico", string> = {
  valle: "#10B981", // verde
  resto: "#60A5FA", // celeste
  pico:  "#F59E0B", // ámbar
};

// ------------------------------------------------------
// Helpers
// ------------------------------------------------------
function classifyHour(hh: number, sch: TouSchedule): "valle" | "pico" | "resto" {
  const inRange = (h: number, start: number, end: number) => h >= start && h < end;
  if (inRange(hh, sch.valle.start, sch.valle.end)) return "valle";
  if (inRange(hh, sch.pico.start, sch.pico.end)) return "pico";
  return "resto";
}

function parseHourAny(s?: string): number | null {
  if (!s) return null;
  // Soporta "HH:MM"
  const hhmm = /^(\d{2}):\d{2}$/;
  const m = s.match(hhmm);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }
  // Intento Date parseable
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.getHours();
  // Fallback ISO-like
  const hh = s.slice(11, 13);
  const n = Number(hh);
  return Number.isFinite(n) ? n : null;
}

// ------------------------------------------------------
// Componente principal
// ------------------------------------------------------
export default function EnergyEfficiencyPage({
  pumpAgg,
  schedule = EPEN_DEFAULT,
  capacity,
}: {
  pumpAgg: AggTimeseries | null | undefined;
  schedule?: TouSchedule;
  capacity?: number; // para escalar el perfil horario
}) {
  const ts = pumpAgg?.timestamps ?? [];
  const vals = pumpAgg?.is_on ?? [];
  const valid =
    Array.isArray(ts) &&
    Array.isArray(vals) &&
    ts.length > 0 &&
    vals.length > 0 &&
    ts.length === vals.length;

  // Series y estadísticos
  const { series, stats, pieData, stackedData, yMax } = useMemo(() => {
    const out: Array<{ tLabel: string; t: number | string; on: number; band: "valle" | "resto" | "pico" }> = [];
    let valle = 0, pico = 0, resto = 0;

    if (valid) {
      for (let i = 0; i < ts.length; i++) {
        const tLabel = String(ts[i] ?? "");
        const hh = parseHourAny(tLabel);
        const on = Number(vals[i] ?? 0);
        if (!Number.isFinite(on) || hh == null) continue;
        const b = classifyHour(hh, schedule);
        out.push({
          tLabel,
          t: /^\d{2}:\d{2}$/.test(tLabel) ? i : new Date(tLabel).getTime(),
          on,
          band: b === "pico" ? "pico" : b === "valle" ? "valle" : "resto",
        });
        if (b === "valle") valle += on;
        else if (b === "pico") pico += on;
        else resto += on;
      }
    }

    const ordered =
      out.length && typeof out[0].t === "number"
        ? [...out].sort((a, b) => Number(a.t) - Number(b.t))
        : [...out];

    const total = valle + pico + resto;
    const stats = {
      total,
      valle: { hours: valle, pct: total > 0 ? (valle * 100) / total : 0 },
      pico:  { hours: pico,  pct: total > 0 ? (pico  * 100) / total : 0 },
      resto: { hours: resto, pct: total > 0 ? (resto * 100) / total : 0 },
      avgOn: ordered.length ? total / ordered.length : 0,
      peak: Math.max(0, ...ordered.map(d => d.on)),
    };

    const pieData = [
      { name: "Valle", key: "valle" as const, value: Number(stats.valle.hours.toFixed(3)) },
      { name: "Resto", key: "resto" as const, value: Number(stats.resto.hours.toFixed(3)) },
      { name: "Pico",  key: "pico"  as const, value: Number(stats.pico.hours.toFixed(3))  },
    ];

    const stackedData = ordered.map(d => ({
      label: d.tLabel,
      valle: d.band === "valle" ? d.on : 0,
      resto: d.band === "resto" ? d.on : 0,
      pico:  d.band === "pico"  ? d.on : 0,
    }));

    const yMax = Math.max(stats.peak, capacity ?? 0, 1);

    return { series: ordered, stats, pieData, stackedData, yMax };
  }, [valid, ts, vals, schedule, capacity]);

  if (!valid) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Eficiencia energética (24h)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-500">Sin datos.</CardContent>
        </Card>
      </div>
    );
  }

  // Porcentajes para barra apilada
  const pct = {
    valle: stats.total > 0 ? (stats.valle.hours / stats.total) * 100 : 0,
    resto: stats.total > 0 ? (stats.resto.hours / stats.total) * 100 : 0,
    pico:  stats.total > 0 ? (stats.pico.hours  / stats.total) * 100 : 0,
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Resumen 24h (ahora con Valle/Resto/Pico adentro) */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-500">Resumen (24h)</CardTitle>
        </CardHeader>
        <CardContent>
          {/* KPIs arriba */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-gray-500">Horas-bomba</div>
              <div className="text-2xl md:text-3xl font-semibold">{stats.total.toFixed(1)} h</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Promedio ON</div>
              <div className="text-2xl md:text-3xl font-semibold">{stats.avgOn.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Pico ON</div>
              <div className="text-2xl md:text-3xl font-semibold">{stats.peak.toFixed(0)}</div>
            </div>
          </div>

          {/* Barra apilada por franja */}
          <div className="mt-4">
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
              <div className="h-2" style={{ width: `${pct.valle}%`, backgroundColor: COLORS.valle }} />
              <div className="h-2" style={{ width: `${pct.resto}%`, backgroundColor: COLORS.resto }} />
              <div className="h-2" style={{ width: `${pct.pico}%`,  backgroundColor: COLORS.pico  }} />
            </div>

            {/* Chips con horas y % por franja */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.valle }} />
                <span className="text-gray-700">Valle</span>
                <span className="ml-auto font-medium">{stats.valle.hours.toFixed(1)} h</span>
                <span className="text-gray-500">({pct.valle.toFixed(0)}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.resto }} />
                <span className="text-gray-700">Resto</span>
                <span className="ml-auto font-medium">{stats.resto.hours.toFixed(1)} h</span>
                <span className="text-gray-500">({pct.resto.toFixed(0)}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.pico }} />
                <span className="text-gray-700">Pico</span>
                <span className="ml-auto font-medium">{stats.pico.hours.toFixed(1)} h</span>
                <span className="text-gray-500">({pct.pico.toFixed(0)}%)</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Distribución por franja */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-500">Distribución por franja</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
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
                label={(d: any) => `${d.name} ${((d.value / (stats.total || 1)) * 100).toFixed(0)}%`}
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
        </CardContent>
      </Card>

      {/* Perfil horario (24h) */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-500">Perfil horario (24h)</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="tLabel" tickMargin={8} minTickGap={24} />
              <YAxis allowDecimals={false} domain={[0, Math.max(yMax, 1)]} width={28} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v: any) => [String(v), "Bombas ON"]} />
              <Legend />
              <Line type="stepAfter" dataKey="on" name="Bombas ON" stroke="currentColor" strokeWidth={2} dot={false} isAnimationActive={false} />
              {series.length > 24 && <Brush dataKey="tLabel" height={22} stroke="currentColor" travellerWidth={8} />}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Horas por franja (apilado por punto) */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-500">Horas por franja (apilado)</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stackedData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="label" tickMargin={8} minTickGap={24} />
              <YAxis allowDecimals={false} width={28} />
              <Tooltip cursor={{ fillOpacity: 0.05 }} formatter={(v: any, name: any) => [`${v} h`, name]} />
              <Legend />
              <Bar stackId="a" dataKey="valle" name="Valle" fill={COLORS.valle} isAnimationActive={false} />
              <Bar stackId="a" dataKey="resto" name="Resto" fill={COLORS.resto} isAnimationActive={false} />
              <Bar stackId="a" dataKey="pico"  name="Pico"  fill={COLORS.pico}  isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
