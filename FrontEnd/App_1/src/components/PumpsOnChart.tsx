// src/components/PumpsOnChart.tsx
import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

/** Serie del hook: timestamps (ms/ISO) + cantidad ON */
type Agg = {
  timestamps?: Array<number | string>;
  is_on?: Array<number | boolean | string | null>;
};

type Props = {
  pumpsTs: Agg | null | undefined;
  title?: string;
  tz?: string;            // default "America/Argentina/Buenos_Aires"
  height?: number;        // default 260 (igual TankLevelChart)
  max?: number;           // techo Y opcional
  syncId?: string;        // ej: "op-sync"
};

const toMs = (x: number | string) => {
  if (typeof x === "number") return x > 10_000 ? x : x * 1000;
  const n = Number(x);
  if (Number.isFinite(n) && n > 10_000) return n;
  return new Date(x).getTime();
};
const startOfMin  = (ms: number) => { const d = new Date(ms); d.setSeconds(0,0); return d.getTime(); };
const startOfHour = (ms: number) => { const d = new Date(ms); d.setMinutes(0,0,0); return d.getTime(); };
const addMinutes  = (ms: number, m: number) => ms + m * 60_000;
const addHours    = (ms: number, h: number) => ms + h * 3_600_000;

const fmtHM = (ms: number, tz = "America/Argentina/Buenos_Aires") => {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(ms);
  } catch {
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
};

/**
 * Arma perfil horario escalonado por minuto en 24h:
 * - dilateMin: ensancha ±N minutos los ON para que no queden “palitos”
 * - bridgeMin: rellena gaps cortos entre ON consecutivos (evita cortes por jitter)
 * Devuelve serie numérica (ms) para sincronizar por valor con el chart de tanques.
 */
function buildMinuteProfile24h(
  pumps: Agg,
  { dilateMin = 2, bridgeMin = 1 }: { dilateMin?: number; bridgeMin?: number } = {}
) {
  const ts = pumps?.timestamps ?? [];
  const vs = pumps?.is_on ?? [];
  const pairs: Array<{ ms: number; on: number }> = [];

  const N = Math.min(ts.length, vs.length);
  for (let i = 0; i < N; i++) {
    const ms = toMs(ts[i] as any);
    if (!Number.isFinite(ms)) continue;
    let on = vs[i];
    on = typeof on === "boolean" ? (on ? 1 : 0) : (on == null ? 0 : Number(on));
    pairs.push({ ms, on: Number(on) || 0 });
  }

  const last = pairs.length ? Math.max(...pairs.map(p => p.ms)) : Date.now();
  const end   = startOfMin(last);
  const start = addHours(end, -24);

  // minuto → max ON en ese minuto
  const perMin = new Map<number, number>();
  for (const p of pairs) {
    if (p.ms < start || p.ms > end) continue;
    const m = startOfMin(p.ms);
    const cur = perMin.get(m) ?? 0;
    if (p.on > cur) perMin.set(m, p.on);
  }

  // 1) DILATACIÓN
  if (dilateMin > 0) {
    const activeMinutes = Array.from(perMin.keys()).filter(k => (perMin.get(k) ?? 0) > 0);
    for (const m of activeMinutes) {
      const val = perMin.get(m)!;
      for (let d = -dilateMin; d <= dilateMin; d++) {
        const mm = addMinutes(m, d);
        if (mm >= start && mm <= end) perMin.set(mm, Math.max(perMin.get(mm) ?? 0, val));
      }
    }
  }

  // 2) PUENTE de gaps cortos
  if (bridgeMin > 0) {
    const minutes = Array.from({ length: ((end - start) / 60_000) + 1 }, (_, i) => addMinutes(start, i));
    let i = 0;
    while (i < minutes.length) {
      if ((perMin.get(minutes[i]) ?? 0) > 0) { i++; continue; }
      let j = i;
      while (j < minutes.length && ((perMin.get(minutes[j]) ?? 0) === 0)) j++;
      const gapLen = j - i;
      const leftActive  = i > 0 && (perMin.get(minutes[i - 1]) ?? 0) > 0;
      const rightActive = j < minutes.length && (perMin.get(minutes[j]) ?? 0) > 0;
      if (leftActive && rightActive && gapLen <= bridgeMin) {
        const val = Math.max(perMin.get(minutes[i - 1]) ?? 1, perMin.get(minutes[j]) ?? 1);
        for (let k = i; k < j; k++) perMin.set(minutes[k], val);
      }
      i = j + 1;
    }
  }

  // Serie final (step)
  let series: Array<{ x: number; on: number; tLabel: string }> = [];
  for (let t = start; t <= end; t = addMinutes(t, 1)) {
    const on = perMin.get(t) ?? 0;
    series.push({ x: t, on, tLabel: fmtHM(t) });
  }
  if (series.length === 1) {
    const only = series[0];
    series = [{ x: only.x - 60_000, on: 0, tLabel: fmtHM(only.x - 60_000) }, only];
  }

  // Ticks de X a cada hora
  const ticks: number[] = [];
  for (let t = startOfHour(start); t <= end; t = addHours(t, 1)) ticks.push(t);

  const yDataMax = Math.max(0, ...series.map(d => d.on));
  return { series, ticks, yDataMax };
}

export default function PumpsOnChart({
  pumpsTs,
  title = "Perfil horario (24h)",
  tz = "America/Argentina/Buenos_Aires",
  height = 260,
  max,
  syncId,
}: Props) {
  // Igual que eficiencia: línea escalonada + grid punteada + ejes simples
  const { series, ticks, yDataMax } = useMemo(
    () => buildMinuteProfile24h(pumpsTs ?? {}, { dilateMin: 2, bridgeMin: 1 }),
    [pumpsTs]
  );

  const yMax = Math.max(1, yDataMax, max ?? 0);

  // Estética igual a eficiencia
  const GRID_COLOR = "rgba(0,0,0,.18)";
  const AXIS_COLOR = "rgba(0,0,0,.20)";
  const TICK_COLOR = "#475569"; // slate-600

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-gray-500">{title}</CardTitle>
      </CardHeader>

      <CardContent style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={series}
            syncId={syncId}
            syncMethod="value"
            margin={{ top: 8, right: 16, left: 8, bottom: 0 }} // = TankLevelChart
          >
            {/* Grid punteada como eficiencia */}
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />

            {/* Eje X con HH:mm por hora */}
            <XAxis
              dataKey="x"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tickFormatter={(v) => fmtHM(v as number, tz)}
              axisLine={{ stroke: AXIS_COLOR }}
              tickLine={false}
              tick={{ fontSize: 11, fill: TICK_COLOR }}
              minTickGap={24}
            />
            {/* Eje Y alineado con Tank (width=40) */}
            <YAxis
              domain={[0, yMax]}
              allowDecimals={false}
              width={40}
              axisLine={{ stroke: AXIS_COLOR }}
              tickLine={false}
              tick={{ fontSize: 11, fill: TICK_COLOR }}
            />

            {/* Tooltip minimal en el mismo formato */}
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const p = payload[0].payload as { x: number; on: number };
                return (
                  <div className="rounded-md border bg-white/95 px-2 py-1 text-xs shadow">
                    <div>{fmtHM(p.x, tz)}</div>
                    <div><strong>{p.on}</strong> Bombas ON</div>
                  </div>
                );
              }}
            />
            <Legend />

            {/* Línea escalonada negra (como eficiencia) */}
            <Line
              type="stepAfter"
              dataKey="on"
              name="Bombas ON"
              stroke="#0b0f19"     // negro suave (mejor anti-alias)
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
