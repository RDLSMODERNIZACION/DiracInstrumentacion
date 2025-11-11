// src/components/PumpsOnChart.tsx
import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
} from "recharts";

/** Serie del hook: timestamps (ms/ISO) + cantidad ON */
type Agg = { timestamps?: Array<number | string>; is_on?: Array<number | boolean | string | null> };

type Props = {
  pumpsTs: Agg | null | undefined;
  title?: string;
  tz?: string;           // default "America/Argentina/Buenos_Aires"
  height?: number;       // default 260 (igual que TankLevelChart)
  max?: number;          // escala Y superior opcional
  syncId?: string;       // ej: "op-sync"
  barWidthPx?: number;   // default 14 (más ancho)
};

// ================== helpers ==================
const toMs = (x: number | string) => {
  if (typeof x === "number") return x > 10_000 ? x : x * 1000;
  const n = Number(x);
  if (Number.isFinite(n) && n > 10_000) return n;
  return new Date(x).getTime();
};
const startOfHour = (ms: number) => { const d = new Date(ms); d.setMinutes(0,0,0); return d.getTime(); };
const addHours    = (ms: number, h: number) => ms + h * 3_600_000;

const fmtHour = (ms: number, tz = "America/Argentina/Buenos_Aires") => {
  try {
    return new Intl.DateTimeFormat("es-AR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(ms);
  } catch {
    const d = new Date(ms); const hh = String(d.getHours()).padStart(2,"0"); const mm = String(d.getMinutes()).padStart(2,"0");
    return `${hh}:${mm}`;
  }
};

function buildFromLive(pumps: Agg) {
  const ts = pumps?.timestamps ?? [];
  const vs = pumps?.is_on ?? [];
  const N = Math.min(ts.length, vs.length);

  let series: Array<{ x: number; on: number | null }> = [];
  for (let i = 0; i < N; i++) {
    const ms = toMs(ts[i] as any);
    if (!Number.isFinite(ms)) continue;
    let on = vs[i];
    on = typeof on === "boolean" ? (on ? 1 : 0) : (on == null ? 0 : Number(on));
    series.push({ x: ms, on: (on as number) > 0 ? (on as number) : null }); // null = NO dibuja
  }
  series.sort((a, b) => a.x - b.x);

  const yDataMax = Math.max(0, ...series.map(d => d.on ?? 0));
  if (!series.length) return { series, ticks: [] as number[], yDataMax };

  // ticks de X a cada hora entre min y max (estilo eficiencia)
  const min = series[0].x, max = series[series.length - 1].x;
  const t0 = startOfHour(min);
  const ticks: number[] = [];
  for (let t = t0; t <= max; t = addHours(t, 1)) ticks.push(t);

  return { series, ticks, yDataMax };
}

// ================== component ==================
export default function PumpsOnChart({
  pumpsTs,
  title = "Bombas encendidas (24h • en vivo)",
  tz = "America/Argentina/Buenos_Aires",
  height = 260,            // ⬅️ igual que TankLevelChart para alinear ejes
  max,
  syncId,
  barWidthPx = 14,          // ⬅️ barras más anchas
}: Props) {
  const { series, ticks, yDataMax } = useMemo(() => buildFromLive(pumpsTs ?? {}), [pumpsTs]);
  const hasAnyBar = series.some(d => d.on != null);
  const yMax = Math.max(1, yDataMax, max ?? 0);

  const AXIS_COLOR = "rgba(0,0,0,.20)";
  const TICK_COLOR = "#475569"; // slate-600

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-gray-500">{title}</CardTitle>
      </CardHeader>

      <CardContent style={{ height }}>
        {!hasAnyBar ? (
          <div className="h-full grid place-items-center text-sm text-gray-500">
            Sin eventos ON en las últimas 24 h.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={series}
              syncId={syncId}
              syncMethod="value"
              margin={{ top: 8, right: 16, left: 8, bottom: 0 }}  // ⬅️ mismo margin que Tank
              barCategoryGap={0}
              barGap={0}
            >
              {/* Eje X temporal simple, ticks cada hora, mismo estilo que eficiencia */}
              <XAxis
                dataKey="x"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                ticks={ticks}
                tickFormatter={(v) => fmtHour(v as number, tz)}
                axisLine={{ stroke: AXIS_COLOR }}
                tickLine={false}
                tick={{ fontSize: 11, fill: TICK_COLOR }}
                minTickGap={24}
              />

              {/* Eje Y minimal para que combinen bases y alturas */}
              <YAxis
                domain={[0, yMax]}
                allowDecimals={false}
                width={40}                       // ⬅️ igual que TankLevelChart
                axisLine={{ stroke: AXIS_COLOR }}
                tickLine={false}
                tick={{ fontSize: 11, fill: TICK_COLOR }}
              />

              {/* Tooltip liviano */}
              <Tooltip
                cursor={{ fillOpacity: 0 }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const p = payload[0].payload as { x: number; on: number | null };
                  return (
                    <div className="rounded-md border bg-white/95 px-2 py-1 text-xs shadow">
                      <div>{fmtHour(p.x, tz)} h</div>
                      <div><strong>{p.on ?? 0}</strong> ON</div>
                    </div>
                  );
                }}
              />

              {/* Barras negras, anchas y redondeadas arriba */}
              <Bar
                dataKey="on"
                isAnimationActive={false}
                fill="#000"
                stroke="#000"
                barSize={barWidthPx}
                maxBarSize={barWidthPx}
                radius={[6, 6, 6, 6]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
